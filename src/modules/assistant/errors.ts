// Erreurs de l'assistant traduites en réponses HTTP par les routes.
export class AssistantError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "RATE_LIMITED",
    message: string,
  ) {
    super(message);
    this.name = "AssistantError";
  }
}
