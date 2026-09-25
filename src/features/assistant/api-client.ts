import type { AssistantReply } from "@/modules/assistant";
import { errorMessage, type FeedbackReason } from "./assistant-logic";

// Appels de l'API de l'assistant depuis le navigateur (cookie de session, même origine). Chaque
// appel rend un résultat typé, jamais une exception : l'écran affiche le message d'erreur.

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function send<T>(url: string, method: "POST" | "PATCH", body?: unknown): Promise<Result<T>> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok) {
      return { ok: false, message: errorMessage(response.status, payload?.error) };
    }
    return { ok: true, data: payload as T };
  } catch {
    // Réseau coupé ou serveur injoignable : même message que l'indisponibilité du service.
    return { ok: false, message: errorMessage(503) };
  }
}

export function askAssistant(input: {
  question: string;
  farmCode?: string;
  conversationId?: string;
}): Promise<Result<AssistantReply>> {
  return send<AssistantReply>("/api/v1/assistant/ask", "POST", input);
}

export function sendFeedback(input: {
  messageId: string;
  useful: boolean;
  reason?: FeedbackReason;
  comment?: string;
}): Promise<Result<{ ok: true }>> {
  return send("/api/v1/assistant/feedback", "POST", input);
}

export function requestAgent(
  messageId: string,
): Promise<Result<{ requestId: string; agentAvailable: boolean }>> {
  return send("/api/v1/assistant/agent-requests", "POST", { messageId });
}

export function markRequestHandled(id: string): Promise<Result<{ ok: true }>> {
  return send(`/api/v1/assistant/agent-requests/${id}`, "PATCH");
}
