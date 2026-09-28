import { prisma } from "@/database/client";
import { formatNational, isDemoPhone, normalizeBeninPhone } from "@/lib/auth/phone";
import { authorize, type Actor } from "@/modules/authorization";
import {
  MAX_SCOPE_ENTRIES,
  diffAgentScope,
  normalizeAgentScope,
  type AgentScopeEntry,
} from "./agent-scope";
import { npiSummary, validateNpiFormat } from "./npi";
import { provisionAccount } from "./provisioning";
import { grantRole, revokeRole } from "./roles";

// Gestion des agents de terrain par le ministère (ADR-0013) : ouvrir le compte d'un agent avec
// son NPI et son numéro, lui donner des communes ou des départements, le réaffecter, lui retirer
// l'accès. Chaque affectation et chaque retrait passe par grantRole et revokeRole, donc au
// journal d'audit avec le compte du ministère qui l'a décidé. Seul le rôle d'agent est touché :
// un autre rôle du même compte (producteur, ministère) reste en place.

const AGENT = "AGENT_AGRICULTURE" as const;

export type AgentErrorCode =
  | "FORBIDDEN"
  | "INVALID_NPI"
  | "INVALID_PHONE"
  | "INVALID_NAME"
  | "EMPTY_SCOPE"
  | "TOO_WIDE"
  | "UNKNOWN_TERRITORY"
  | "NOT_AN_AGENT"
  | "MINISTRY_ACCOUNT"
  | "IDENTITY_CONFLICT";

export type AgentResult<T = object> = ({ ok: true } & T) | { ok: false; code: AgentErrorCode };

export interface AgentScopeInput {
  communeIds: readonly string[];
  departementIds: readonly string[];
}

export interface AgentScopeView {
  scopeType: AgentScopeEntry["scopeType"];
  scopeId: string;
  label: string;
}

export interface AgentRow {
  userId: string;
  name: string;
  phone: string | null;
  npi: string | null;
  demo: boolean;
  scopes: AgentScopeView[];
  farmsRegistered: number;
  lastLoginAt: Date | null;
  since: Date;
}

export interface RevokedAgentRow {
  userId: string;
  name: string;
  phone: string | null;
  revokedAt: Date;
}

export interface TerritoryOption {
  id: string;
  name: string;
  communes: { id: string; name: string }[];
}

export interface AgentOverview {
  agents: AgentRow[];
  revoked: RevokedAgentRow[];
  territories: TerritoryOption[];
  communeCount: number;
  uncovered: { id: string; name: string; departementName: string }[];
}

function canManage(actor: Actor): boolean {
  return authorize(actor, "user.role.grant").allowed;
}

function nationalPhone(e164: string | null): string | null {
  if (!e164) return null;
  return e164.startsWith("+229") ? formatNational(e164.slice(4)) : e164;
}

/** Départements et communes actifs, pour le choix du périmètre et le calcul de couverture. */
async function loadTerritories(): Promise<TerritoryOption[]> {
  const departements = await prisma.departement.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      communes: {
        where: { archivedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });
  return departements;
}

/** Vue du ministère : agents actifs, accès retirés, communes encore sans agent. */
export async function listAgents(actor: Actor): Promise<AgentResult<AgentOverview>> {
  if (!canManage(actor)) return { ok: false, code: "FORBIDDEN" };

  const [assignments, territories] = await Promise.all([
    prisma.roleAssignment.findMany({
      where: { role: AGENT, revokedAt: null, user: { archivedAt: null } },
      orderBy: { grantedAt: "asc" },
      select: {
        userId: true,
        scopeType: true,
        scopeId: true,
        grantedAt: true,
        user: { select: { name: true, phoneNumber: true, lastLoginAt: true } },
      },
    }),
    loadTerritories(),
  ]);

  const departementNames = new Map(territories.map((d) => [d.id, d.name]));
  const communeNames = new Map(
    territories.flatMap((d) => d.communes.map((c) => [c.id, c.name] as const)),
  );
  const communesByDepartement = new Map(
    territories.map((d) => [d.id, d.communes.map((c) => c.id)]),
  );

  const byUser = new Map<string, AgentRow>();
  const covered = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.scopeType !== "COMMUNE" && assignment.scopeType !== "DEPARTEMENT") continue;
    if (!assignment.scopeId) continue;
    const isDepartement = assignment.scopeType === "DEPARTEMENT";
    const name = isDepartement
      ? departementNames.get(assignment.scopeId)
      : communeNames.get(assignment.scopeId);
    if (!name) continue;
    let row = byUser.get(assignment.userId);
    if (!row) {
      row = {
        userId: assignment.userId,
        name: assignment.user.name,
        phone: nationalPhone(assignment.user.phoneNumber),
        npi: null,
        demo: isDemoPhone(assignment.user.phoneNumber ?? ""),
        scopes: [],
        farmsRegistered: 0,
        lastLoginAt: assignment.user.lastLoginAt,
        since: assignment.grantedAt,
      };
      byUser.set(assignment.userId, row);
    }
    row.scopes.push({
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId,
      label: isDepartement ? `Département ${name}` : name,
    });
    const ids = isDepartement
      ? (communesByDepartement.get(assignment.scopeId) ?? [])
      : [assignment.scopeId];
    for (const id of ids) covered.add(id);
  }

  const agents = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const userIds = agents.map((agent) => agent.userId);
  const [farmCounts, npis] = await Promise.all([
    prisma.farm.groupBy({
      by: ["registeredById"],
      where: { registeredById: { in: userIds }, archivedAt: null },
      _count: { _all: true },
    }),
    Promise.all(userIds.map((id) => npiSummary(id).then((summary) => summary.masked))),
  ]);
  const farmsByUser = new Map(farmCounts.map((row) => [row.registeredById, row._count._all]));
  agents.forEach((agent, index) => {
    agent.farmsRegistered = farmsByUser.get(agent.userId) ?? 0;
    agent.npi = npis[index] ?? null;
  });

  const revokedAssignments = await prisma.roleAssignment.findMany({
    where: {
      role: AGENT,
      revokedAt: { not: null },
      userId: { notIn: userIds },
      user: { archivedAt: null },
    },
    orderBy: { revokedAt: "desc" },
    take: 200,
    select: {
      userId: true,
      revokedAt: true,
      user: { select: { name: true, phoneNumber: true } },
    },
  });
  const revoked: RevokedAgentRow[] = [];
  const seen = new Set<string>();
  for (const assignment of revokedAssignments) {
    if (seen.has(assignment.userId) || !assignment.revokedAt) continue;
    seen.add(assignment.userId);
    revoked.push({
      userId: assignment.userId,
      name: assignment.user.name,
      phone: nationalPhone(assignment.user.phoneNumber),
      revokedAt: assignment.revokedAt,
    });
  }

  const uncovered = territories.flatMap((d) =>
    d.communes
      .filter((c) => !covered.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, departementName: d.name })),
  );
  const communeCount = territories.reduce((sum, d) => sum + d.communes.length, 0);

  return {
    ok: true,
    agents,
    revoked: revoked.slice(0, 20),
    territories,
    communeCount,
    uncovered,
  };
}

/** Vérifie les territoires choisis et en tire les affectations à enregistrer. */
async function resolveScope(
  input: AgentScopeInput,
): Promise<AgentResult<{ entries: AgentScopeEntry[] }>> {
  const communeIds = [...new Set(input.communeIds)];
  const departementIds = [...new Set(input.departementIds)];
  if (communeIds.length + departementIds.length === 0) return { ok: false, code: "EMPTY_SCOPE" };
  if (communeIds.length + departementIds.length > MAX_SCOPE_ENTRIES) {
    return { ok: false, code: "TOO_WIDE" };
  }
  const [communes, departements] = await Promise.all([
    prisma.commune.findMany({
      where: { id: { in: communeIds }, archivedAt: null },
      select: { id: true, departementId: true },
    }),
    prisma.departement.findMany({
      where: { id: { in: departementIds }, archivedAt: null },
      select: { id: true },
    }),
  ]);
  if (communes.length !== communeIds.length || departements.length !== departementIds.length) {
    return { ok: false, code: "UNKNOWN_TERRITORY" };
  }
  // Ordre de la saisie conservé : findMany ne le garantit pas.
  const byId = new Map(communes.map((c) => [c.id, c]));
  const ordered = communeIds.map((id) => byId.get(id)).filter((c) => c !== undefined);
  return { ok: true, entries: normalizeAgentScope(ordered, departementIds) };
}

// Toutes les affectations d'agent en cours, y compris une portée autre qu'une commune ou un
// département (nationale, héritée d'un script) : la réaffectation la remplace comme le reste.
function activeAgentAssignments(userId: string) {
  return prisma.roleAssignment.findMany({
    where: { userId, role: AGENT, revokedAt: null },
    select: { id: true, scopeType: true, scopeId: true },
  });
}

// Nouvelles affectations d'abord, anciennes retirées ensuite : l'agent n'est jamais sans
// périmètre pendant le changement.
async function applyScope(userId: string, wanted: readonly AgentScopeEntry[], actorId: string) {
  const current = await activeAgentAssignments(userId);
  const { toGrant, toRevoke } = diffAgentScope(current, wanted);
  for (const entry of toGrant) {
    await grantRole({ userId, role: AGENT, ...entry, grantedById: actorId });
  }
  for (const assignment of toRevoke) await revokeRole(assignment.id, actorId);
}

async function holdsMinistryRole(userId: string): Promise<boolean> {
  const count = await prisma.roleAssignment.count({
    where: { userId, role: "ADMIN_STATE", revokedAt: null },
  });
  return count > 0;
}

export interface CreateAgentInput extends AgentScopeInput {
  npi: string;
  phone: string;
  name: string;
}

/**
 * Ouvre le compte d'un agent, ou redonne l'accès à un compte existant qui porte ce NPI et ce
 * numéro. Le périmètre saisi remplace celui que le compte aurait déjà. L'agent se connecte
 * ensuite comme tout le monde : NPI, numéro, code reçu sur WhatsApp.
 */
export async function createAgent(
  actor: Actor,
  input: CreateAgentInput,
): Promise<AgentResult<{ userId: string; created: boolean }>> {
  if (!canManage(actor)) return { ok: false, code: "FORBIDDEN" };
  const npi = input.npi.replace(/\D/g, "");
  if (!validateNpiFormat(npi).valid) return { ok: false, code: "INVALID_NPI" };
  const phone = normalizeBeninPhone(input.phone);
  if (!phone) return { ok: false, code: "INVALID_PHONE" };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { ok: false, code: "INVALID_NAME" };
  const scope = await resolveScope(input);
  if (!scope.ok) return scope;

  const existing = await prisma.user.findUnique({
    where: { phoneNumber: phone.e164 },
    select: { id: true },
  });
  if (existing && (await holdsMinistryRole(existing.id))) {
    return { ok: false, code: "MINISTRY_ACCOUNT" };
  }

  const [first] = scope.entries;
  if (!first) return { ok: false, code: "EMPTY_SCOPE" };
  const provisioned = await provisionAccount({
    npi,
    phone: phone.e164,
    role: AGENT,
    scopeType: first.scopeType,
    scopeId: first.scopeId,
    name,
    grantedById: actor.userId,
  });
  if (!provisioned.ok) return { ok: false, code: "IDENTITY_CONFLICT" };
  await applyScope(provisioned.userId, scope.entries, actor.userId);
  return { ok: true, userId: provisioned.userId, created: provisioned.created };
}

/** Réaffecte un agent : son périmètre devient exactement celui choisi. */
export async function updateAgentScope(
  actor: Actor,
  userId: string,
  input: AgentScopeInput,
): Promise<AgentResult> {
  if (!canManage(actor)) return { ok: false, code: "FORBIDDEN" };
  const current = await activeAgentAssignments(userId);
  if (current.length === 0) return { ok: false, code: "NOT_AN_AGENT" };
  const scope = await resolveScope(input);
  if (!scope.ok) return scope;
  await applyScope(userId, scope.entries, actor.userId);
  return { ok: true };
}

/**
 * Retire l'accès d'agent : toutes ses affectations d'agent sont closes. Le compte, ses autres
 * rôles et ce qu'il a enregistré restent ; ses exploitations ne sont plus suivies par personne
 * jusqu'à ce qu'un autre agent les reprenne sur le terrain.
 */
export async function revokeAgent(actor: Actor, userId: string): Promise<AgentResult> {
  if (!canManage(actor)) return { ok: false, code: "FORBIDDEN" };
  const current = await activeAgentAssignments(userId);
  if (current.length === 0) return { ok: false, code: "NOT_AN_AGENT" };
  for (const assignment of current) await revokeRole(assignment.id, actor.userId);
  return { ok: true };
}
