import type { prisma } from "@/database/client";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const E2E_EMAIL_SUFFIX = "@e2e.bais.invalid";
const DEMO_EMAIL_SUFFIX = "@bais.demo";

/**
 * Conversations de l'assistant laissées par une suite de bout en bout : celles des comptes de
 * démonstration (ministère compris depuis ADR-0012) créées depuis le début de la suite, celles
 * dont l'auteur a disparu depuis ce début (la conversation garde alors un auteur nul), et celles
 * des anciens comptes ministère jetables (@e2e.bais.invalid) qu'une base aurait gardées. Messages,
 * retours et demandes à l'agent partent avec leur conversation (suppression en cascade).
 */
export async function cleanAssistantConversations(
  tx: Tx,
  since: Date,
  demoPhones: readonly string[],
  add: (key: string, value: number) => void,
): Promise<void> {
  const users = await tx.user.findMany({
    where: {
      OR: [
        { email: { endsWith: E2E_EMAIL_SUFFIX } },
        { email: { endsWith: DEMO_EMAIL_SUFFIX } },
        { phoneNumber: { in: [...demoPhones] } },
      ],
    },
    select: { id: true, email: true },
  });
  const testUserIds = users.filter((u) => u.email?.endsWith(E2E_EMAIL_SUFFIX)).map((u) => u.id);
  const demoUserIds = users.filter((u) => !u.email?.endsWith(E2E_EMAIL_SUFFIX)).map((u) => u.id);
  const deleted = await tx.assistantConversation.deleteMany({
    where: {
      OR: [
        { userId: { in: testUserIds } },
        { userId: { in: demoUserIds }, createdAt: { gte: since } },
        { userId: null, createdAt: { gte: since } },
      ],
    },
  });
  add("assistant_conversation", deleted.count);
}
