import { timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";

// Authentification des tâches planifiées : `Authorization: Bearer <CRON_SECRET>`, comparé en
// temps constant. Sans secret configuré, les routes planifiées restent fermées.
export function isCronRequest(headers: Headers): boolean {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
