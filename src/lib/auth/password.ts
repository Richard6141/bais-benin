import { hash, verify } from "@node-rs/argon2";

// Argon2id avec les paramètres minimaux recommandés par l'OWASP (m = 19 456 KiB, t = 2, p = 1).
// Utilisé pour les mots de passe des comptes institutionnels ; better-auth reçoit ces deux
// fonctions à la place de son scrypt par défaut.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(input.hash, input.password);
  } catch {
    return false;
  }
}
