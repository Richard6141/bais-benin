// Comptes de démonstration (ADR-0012) : un NPI fictif et un numéro fictif par rôle, semés par
// src/database/seed/steps/accounts.seed.ts et acceptant le code OTP_DEMO_CODE. Liste blanche
// exacte (A2) : isDemoPhone ne reconnaît que ces numéros, jamais un motif. Aucun de ces comptes
// n'existe en production (seed et lib/env.ts l'interdisent).

export interface DemoSignInAccount {
  key: string;
  roleLabel: string;
  npi: string;
  /** Numéro national à dix chiffres, tel que saisi à l'écran de connexion. */
  phoneDigits: string;
}

export const DEMO_SIGN_IN_ACCOUNTS: readonly DemoSignInAccount[] = [
  {
    key: "agent-djougou",
    roleLabel: "Agent de terrain (Djougou)",
    npi: "1000000000001",
    phoneDigits: "0190000001",
  },
  {
    key: "agricultrice-djougou",
    roleLabel: "Agricultrice (Djougou)",
    npi: "1000000000002",
    phoneDigits: "0190000002",
  },
  { key: "ministere", roleLabel: "Ministère", npi: "1000000000003", phoneDigits: "0190000003" },
  { key: "cooperative", roleLabel: "Coopérative", npi: "1000000000004", phoneDigits: "0190000004" },
  { key: "acheteur", roleLabel: "Acheteur", npi: "1000000000005", phoneDigits: "0190000005" },
];

export const demoPhoneE164 = (account: DemoSignInAccount) => `+229${account.phoneDigits}`;

export function demoAccount(key: string): DemoSignInAccount {
  const account = DEMO_SIGN_IN_ACCOUNTS.find((candidate) => candidate.key === key);
  if (!account) throw new Error(`Compte de démonstration inconnu : ${key}`);
  return account;
}
