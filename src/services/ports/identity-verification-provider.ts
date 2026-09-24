// Port de vérification d'identité nationale (NPI, ANIP). Contrat aligné sur
// docs/recherche/anip-npi-api.md §9 : la vérification en ligne passe par X-Road BJ sur
// convention ; en attendant, un adaptateur local contrôle la syntaxe et laisse le
// statut « en attente ».

export type IdentityVerificationProviderId = "anip-local" | "anip-xroad";

export interface IdentityVerificationRequest {
  npi: string;
  lastName: string;
  firstName?: string;
  birthYear?: number;
}

export type IdentityVerificationOutcome =
  | { status: "VERIFIED"; provider: IdentityVerificationProviderId; verifiedAt: Date }
  | { status: "MISMATCH"; provider: IdentityVerificationProviderId; reason: string }
  | { status: "PENDING"; provider: IdentityVerificationProviderId; reason: string };

export type IdentityVerificationErrorCode = "INVALID_FORMAT" | "NOT_CONFIGURED" | "UNAVAILABLE";

export class IdentityVerificationError extends Error {
  constructor(
    readonly code: IdentityVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IdentityVerificationError";
  }
}

export interface IdentityVerificationProvider {
  readonly id: IdentityVerificationProviderId;
  // Contrôle de forme, sans appel réseau : longueur et caractères.
  validateFormat(npi: string): { valid: boolean; reason?: string };
  verify(request: IdentityVerificationRequest): Promise<IdentityVerificationOutcome>;
}
