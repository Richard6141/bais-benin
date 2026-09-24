import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Le schéma reste à la racine (convention Prisma) ; les migrations et le seed
// vivent avec le reste du code de données dans src/database.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "src/database/migrations",
    seed: "tsx src/database/seed/index.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
