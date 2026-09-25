import { APIError } from "better-auth/api";
import { bindNpiOnSignIn, isNpiTaken } from "@/modules/identity";
import { signInIntentFromHeaders, type SignInIntent } from "./sign-in-intent";

// Connexion par NPI et code WhatsApp (ADR-0012), branchée sur le greffon phone-number de
// better-auth. Trois points de contrôle :
// 1. envoi du code : refusé tant qu'un NPI n'a pas été saisi pour ce numéro (intention) ;
// 2. création d'un compte (numéro inconnu) : refusée si le NPI appartient déjà à un compte ;
// 3. après vérification du code, avant la session : le NPI est lié au compte, ou doit être
//    celui qui y est déjà lié.
// Les contrôles 2 et 3 n'interviennent qu'une fois le code vérifié : un refus ne renseigne
// sur un NPI que celui qui a prouvé détenir le numéro saisi.

export const NPI_REQUIRED_CODE = "NPI_REQUIRED";
export const NPI_MISMATCH_CODE = "NPI_MISMATCH";

const MISMATCH_MESSAGE =
  "Ce NPI et ce numéro ne sont pas reliés au même compte. Vérifiez votre NPI ou adressez-vous " +
  "à un agent de votre commune.";

interface HeaderContext {
  headers?: Headers;
  request?: Request;
}

/** Intention de connexion valable pour ce numéro, sinon erreur NPI_REQUIRED. */
export function requireSignInIntent(
  ctx: HeaderContext | null | undefined,
  phone: unknown,
): SignInIntent {
  const intent = signInIntentFromHeaders(ctx?.headers ?? ctx?.request?.headers);
  if (!intent || intent.phone !== phone) {
    throw new APIError("BAD_REQUEST", {
      code: NPI_REQUIRED_CODE,
      message: "Saisissez d'abord votre NPI et votre numéro.",
    });
  }
  return intent;
}

/** Avant la création d'un compte par numéro : le NPI ne doit appartenir à aucun compte. */
export async function assertNpiFreeForNewAccount(
  ctx: HeaderContext | null | undefined,
  phone: unknown,
): Promise<void> {
  const intent = requireSignInIntent(ctx, phone);
  if (await isNpiTaken(intent.npi)) {
    throw new APIError("FORBIDDEN", { code: NPI_MISMATCH_CODE, message: MISMATCH_MESSAGE });
  }
}

/**
 * Après vérification du code : lie le NPI au compte ou vérifie qu'il y est déjà lié. Met aussi à
 * jour l'objet `user` que better-auth s'apprête à placer dans le cache de session (cookie de
 * 5 minutes) : sans cela, un compte tout juste créé y figurerait sans NPI et serait refusé par
 * resolveSession jusqu'à l'expiration du cache.
 */
export async function bindSignInNpi(
  ctx: HeaderContext | null | undefined,
  phone: string,
  user: { id: string; npiStatus?: unknown },
): Promise<void> {
  const intent = requireSignInIntent(ctx, phone);
  const binding = await bindNpiOnSignIn(user.id, intent.npi);
  if (!binding.ok) {
    throw new APIError("FORBIDDEN", { code: NPI_MISMATCH_CODE, message: MISMATCH_MESSAGE });
  }
  if (binding.attached) user.npiStatus = "PENDING";
}
