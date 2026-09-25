import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_RULES } from "./rules";

// Catalogue des règles en base. Le code stocké est le code de base (« WATER_STRESS_EARLY ») ;
// la version est une colonne. Les règles par défaut sont chargées une fois par version :
// une règle modifiée par le ministère (version supérieure) n'est jamais écrasée par le seed.

export function baseCode(versionedCode: string): string {
  return versionedCode.replace(/_V\d+$/, "");
}

export async function seedDefaultRules(): Promise<number> {
  let created = 0;
  for (const rule of DEFAULT_RULES) {
    const code = baseCode(rule.code);
    const existing = await prisma.rule.findUnique({
      where: { code_version: { code, version: rule.version } },
      select: { id: true },
    });
    const data = {
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      category: rule.category,
      target: rule.target,
      definition: rule.definition as Prisma.InputJsonValue,
      messageFr: rule.messageFr,
      messageShort: rule.messageShort,
      adviceFr: rule.adviceFr,
      cooldownHours: rule.cooldownHours,
    };
    if (existing) {
      await prisma.rule.update({ where: { id: existing.id }, data });
      continue;
    }
    const newer = await prisma.rule.findFirst({
      where: { code, version: { gt: rule.version } },
      select: { id: true },
    });
    await prisma.rule.create({
      data: {
        ...data,
        code,
        version: rule.version,
        // Une version plus récente existe déjà (modifiée par le ministère) : celle-ci reste inactive.
        enabled: !newer,
        sourceId: "BAIS_SEED",
      },
    });
    created += 1;
  }
  return created;
}
