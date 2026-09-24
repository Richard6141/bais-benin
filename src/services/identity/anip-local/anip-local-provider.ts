import type {
  IdentityVerificationOutcome,
  IdentityVerificationProvider,
  IdentityVerificationRequest,
} from "@/services/ports/identity-verification-provider";

// Adaptateur sans convention ANIP : vérifie la forme du NPI et laisse la vérification
// en attente. La longueur est paramétrable (NPI_LENGTH) car le format n'est pas publié
// officiellement ; 13 chiffres selon la seule source disponible.
export class AnipLocalProvider implements IdentityVerificationProvider {
  readonly id = "anip-local" as const;

  constructor(private readonly expectedLength: number) {}

  validateFormat(npi: string): { valid: boolean; reason?: string } {
    const digits = npi.replace(/\D/g, "");
    if (digits.length === 0) return { valid: false, reason: "Le NPI ne contient aucun chiffre" };
    if (digits.length !== this.expectedLength) {
      return {
        valid: false,
        reason: `Le NPI doit comporter ${this.expectedLength} chiffres (${digits.length} saisis)`,
      };
    }
    if (/^(\d)\1+$/.test(digits))
      return { valid: false, reason: "Le NPI ne peut pas être une répétition" };
    return { valid: true };
  }

  async verify(request: IdentityVerificationRequest): Promise<IdentityVerificationOutcome> {
    const format = this.validateFormat(request.npi);
    if (!format.valid) {
      return { status: "MISMATCH", provider: this.id, reason: format.reason ?? "format invalide" };
    }
    return {
      status: "PENDING",
      provider: this.id,
      reason: "Vérification auprès de l'ANIP en attente de la convention d'accès X-Road",
    };
  }
}
