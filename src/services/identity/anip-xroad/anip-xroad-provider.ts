import {
  IdentityVerificationError,
  type IdentityVerificationOutcome,
  type IdentityVerificationProvider,
  type IdentityVerificationRequest,
} from "@/services/ports/identity-verification-provider";
import { AnipLocalProvider } from "@/services/identity/anip-local/anip-local-provider";

export interface AnipXRoadOptions {
  // Point d'accès du serveur de sécurité X-Road BJ fourni avec la convention ANIP.
  securityServerUrl: string;
  clientIdentifier: string;
  serviceIdentifier: string;
  fetchImpl?: typeof fetch;
}

// Adaptateur X-Road BJ : le contrat de l'ANIP n'est pas public, l'échange exact
// (schéma de requête, champs de réponse) sera complété à réception de la convention.
// Le squelette expose déjà le contrat attendu par le reste de l'application.
export class AnipXRoadProvider implements IdentityVerificationProvider {
  readonly id = "anip-xroad" as const;
  private readonly local: AnipLocalProvider;

  constructor(
    private readonly options: AnipXRoadOptions,
    expectedLength: number,
  ) {
    this.local = new AnipLocalProvider(expectedLength);
  }

  validateFormat(npi: string) {
    return this.local.validateFormat(npi);
  }

  async verify(request: IdentityVerificationRequest): Promise<IdentityVerificationOutcome> {
    const format = this.validateFormat(request.npi);
    if (!format.valid) {
      return { status: "MISMATCH", provider: this.id, reason: format.reason ?? "format invalide" };
    }
    if (!this.options.securityServerUrl) {
      throw new IdentityVerificationError(
        "NOT_CONFIGURED",
        "Serveur de sécurité X-Road non configuré",
      );
    }
    throw new IdentityVerificationError(
      "UNAVAILABLE",
      "Échange X-Road ANIP non encore activé : convention et schéma de service requis",
    );
  }
}
