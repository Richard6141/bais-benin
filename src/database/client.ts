import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getServerEnv } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";

// Une seule instance par processus. En développement, le rechargement à chaud
// de Next recrée les modules : on accroche l'instance au global pour ne pas
// épuiser les connexions de la base.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

function createClient() {
  const env = getServerEnv();
  const pool = globalForPrisma.pgPool ?? new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  if (env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();
