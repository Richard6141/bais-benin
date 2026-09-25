import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Appel des scripts de base de données dans un processus à part : ils chargent Prisma et les
// alias `@/` via tsx, comme le seed, sans dépendre du chargeur TypeScript de Playwright.

export const STATE_DIR = join(process.cwd(), "test-results", "e2e-db");
export const SNAPSHOT_FILE = join(STATE_DIR, "farms-snapshot.json");
export const STARTED_AT_FILE = join(STATE_DIR, "started-at.txt");

const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const cleanScript = join(process.cwd(), "scripts", "e2e-clean.ts");
const accountsScript = join(process.cwd(), "scripts", "e2e-accounts.ts");

export const cleanDisabled = () => process.env.E2E_SKIP_CLEAN === "1";
export const accountsDisabled = () => process.env.E2E_SKIP_ACCOUNTS === "1";

export function runCleanScript(args: string[]): void {
  execFileSync(process.execPath, [tsxCli, cleanScript, ...args], { stdio: "inherit" });
}

export function runAccountsScript(args: string[]): void {
  execFileSync(process.execPath, [tsxCli, accountsScript, ...args], { stdio: "inherit" });
}
