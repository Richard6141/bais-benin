import type { GroupActionState } from "./actions";

// Retour d'une action sur un groupe : annoncé aux lecteurs d'écran, en rouge si refusée.
export function ActionFeedback({ state }: { state: GroupActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-sm text-destructive" : "text-sm font-medium"}
    >
      {state.message}
    </p>
  );
}
