import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import {
  AttestationError,
  issueAttestation,
  listFarmAttestations,
  revokeAttestation,
  verifyAttestation,
} from "@/modules/attestations";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";

// Attestation d'exploitation : le producteur l'établit pour sa propre exploitation, l'agent pour
// celles qu'il a enregistrées (ADR-0014) ; la page publique la vérifie par son code et dit si
// elle a été retirée. Le NPI n'est jamais recopié.

let ministry: Actor;
let agent: Actor;
let farmer: Actor;
let agentFarmId: string;
let farmerFarmId: string;
let otherFarmId: string;
const codes: string[] = [];

describe("attestations d'exploitation", () => {
  beforeAll(async () => {
    await seedReferenceData();
    const [ministryUser, agentUser, farmerUser] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "ministere@bais.demo" } }),
      prisma.user.findFirstOrThrow({ where: { phoneNumber: "+2290190000001" } }),
      prisma.user.findFirstOrThrow({ where: { phoneNumber: "+2290190000002" } }),
    ]);
    [ministry, agent, farmer] = await Promise.all([
      loadActor(ministryUser.id),
      loadActor(agentUser.id),
      loadActor(farmerUser.id),
    ]);
    agentFarmId = (
      await prisma.farm.findFirstOrThrow({
        where: { registeredById: agentUser.id, archivedAt: null },
        select: { id: true },
      })
    ).id;
    farmerFarmId = (
      await prisma.farm.findFirstOrThrow({
        where: { farmer: { userId: farmerUser.id }, archivedAt: null },
        select: { id: true },
      })
    ).id;
    otherFarmId = (
      await prisma.farm.findFirstOrThrow({
        where: { registeredById: null, farmer: { userId: null }, archivedAt: null },
        select: { id: true },
      })
    ).id;
  }, 240_000);

  afterAll(async () => {
    await prisma.farmAttestation.deleteMany({ where: { code: { in: codes } } });
    await prisma.$disconnect();
  });

  it("établit l'attestation du producteur et la vérifie par son code", async () => {
    const code = await issueAttestation(farmer, farmerFarmId);
    codes.push(code);
    const view = await verifyAttestation(code.toLowerCase());
    expect(view).toMatchObject({ code, revokedAt: null, issuerRole: "PRODUCTEUR" });
    expect(view!.snapshot.parcels).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toMatch(/npi"?\s*:\s*"\d/i);
    const listed = await listFarmAttestations(farmer, farmerFarmId);
    expect(listed.map((item) => item.code)).toContain(code);
  });

  it("laisse l'agent attester ses exploitations, pas celles des autres", async () => {
    const code = await issueAttestation(agent, agentFarmId);
    codes.push(code);
    expect((await verifyAttestation(code))?.issuerRole).toBe("AGENT");
    await expect(issueAttestation(agent, otherFarmId)).rejects.toBeInstanceOf(AttestationError);
    await expect(issueAttestation(farmer, otherFarmId)).rejects.toBeInstanceOf(AttestationError);
  });

  it("dit qu'une attestation retirée n'est plus en vigueur", async () => {
    const code = codes[0]!;
    await revokeAttestation(farmer, code);
    expect((await verifyAttestation(code))?.revokedAt).toBeInstanceOf(Date);
    // Une attestation d'une exploitation hors de sa portée : l'agent ne peut pas la retirer.
    const foreign = await issueAttestation(ministry, otherFarmId);
    codes.push(foreign);
    expect((await verifyAttestation(foreign))?.issuerRole).toBe("MINISTERE");
    await expect(revokeAttestation(agent, foreign)).rejects.toBeInstanceOf(AttestationError);
  });

  it("ne reconnaît pas un numéro inventé", async () => {
    await expect(verifyAttestation("ABCD-EFGH-JKMN-PQRS")).resolves.toBeNull();
    await expect(verifyAttestation("n'importe quoi")).resolves.toBeNull();
  });
});
