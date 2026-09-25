import type { Actor } from "@/modules/authorization";
import { ERASED_QUESTION, listAgentRequests, listMyQuestions } from "@/modules/assistant";
import { getCommuneWeather, listAlertsForActor } from "@/modules/monitoring";
import { getFarmDetail, listCampaigns, listOwnFarms } from "@/modules/registry";
import { agentSuggestions, dryDaysOf, farmerSuggestions } from "./assistant-logic";

// Données des suggestions contextuelles, lues côté serveur dans le périmètre de l'utilisateur :
// cultures de la campagne ouverte, alerte la plus grave, météo de la commune, demandes reçues.

/** Dernières questions encore lisibles (le texte est effacé après 90 jours). */
export async function readableHistory(actor: Actor) {
  const questions = await listMyQuestions(actor);
  return questions
    .filter((q) => q.content && q.content !== ERASED_QUESTION)
    .map((q) => ({ id: q.id, content: q.content }));
}

export async function farmerContext(actor: Actor, userId: string) {
  const [farms, campaigns, alerts] = await Promise.all([
    listOwnFarms(userId),
    listCampaigns(),
    listAlertsForActor(actor, { status: "ACTIVE" }),
  ]);
  const first = farms[0];
  const farm = first ? await getFarmDetail(actor, first.id) : null;
  const openCampaign = campaigns.find((c) => c.status === "OPEN")?.code ?? null;
  const crops = farm
    ? [
        ...new Set(
          farm.parcels
            .flatMap((p) => p.crops)
            .filter((c) => c.campaignCode === openCampaign)
            .map((c) => c.cropName),
        ),
      ]
    : [];
  const weather = first ? await getCommuneWeather(first.commune.code) : null;
  const top = alerts[0];
  return {
    communeName: first?.commune.name ?? null,
    suggestions: farmerSuggestions({
      crops,
      alert: top ? { title: top.title, communeName: top.communeName } : null,
      dryDays: weather ? dryDaysOf(weather.rain) : 0,
      rain10dMm: weather?.rain10dMm ?? null,
    }),
  };
}

export async function agentContext(actor: Actor) {
  const [requests, alerts] = await Promise.all([
    listAgentRequests(actor).catch(() => []),
    listAlertsForActor(actor, { status: "ACTIVE" }),
  ]);
  const top = alerts[0];
  return {
    requests,
    suggestions: agentSuggestions({
      openRequests: requests
        .filter((r) => r.status === "OPEN" && r.question !== ERASED_QUESTION)
        .map((r) => r.question),
      alert: top ? { title: top.title, communeName: top.communeName } : null,
      crops: [],
    }),
  };
}
