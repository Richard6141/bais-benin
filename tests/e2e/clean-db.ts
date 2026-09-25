import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Appel du script de nettoyage dans un processus à part : il charge Prisma et les alias `@/` via
// tsx, comme le seed, sans dépendre du chargeur TypeScript de Playwright.

export const STATE_DIR = join(process.cwd(), "test-results", "e2e-db");
export const SNAPSHOT_FILE = join(STATE_DIR, "farms-snapshot.json");
export const STARTED_AT_FILE = join(STATE_DIR, "started-at.txt");

const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const script = join(process.cwd(), "scripts", "e2e-clean.ts");

export const cleanDisabled = () => process.env.E2E_SKIP_CLEAN === "1";

export function runCleanScript(args: string[]): void {
  execFileSync(process.execPath, [tsxCli, script, ...args], { stdio: "inherit" });
}
