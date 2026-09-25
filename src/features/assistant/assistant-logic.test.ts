import { describe, expect, it } from "vitest";
import {
  QUESTION_MAX,
  SMS_MAX,
  agentSuggestions,
  dryDaysOf,
  errorMessage,
  farmerSuggestions,
  outcomeFilter,
  questionState,
  shortForProducer,
  speechText,
  visibleNotice,
} from "./assistant-logic";

describe("champ de question", () => {
  it("refuse une question vide ou trop longue", () => {
    expect(questionState("   ").canSend).toBe(false);
    expect(questionState("Quand semer le maïs ?").canSend).toBe(true);
    const long = "a".repeat(QUESTION_MAX + 1);
    expect(questionState(long)).toMatchObject({ canSend: false, tooLong: true, remaining: -1 });
  });
});

describe("suggestions", () => {
  it("compte les jours secs observés, sans les prévisions", () => {
    const days = [
      { rainMm: 12, forecast: false },
      { rainMm: 0, forecast: false },
      { rainMm: 0.4, forecast: false },
      { rainMm: 30, forecast: true },
    ];
    expect(dryDaysOf(days)).toBe(2);
    expect(dryDaysOf([{ rainMm: null, forecast: false }])).toBe(0);
  });

  it("part des cultures, de l'alerte et de la météo du producteur", () => {
    const suggestions = farmerSuggestions({
      crops: ["Maïs", "Niébé"],
      alert: { title: "Chenille légionnaire", communeName: "Bohicon" },
      dryDays: 12,
      rain10dMm: 0,
    });
    expect(suggestions).toEqual([
      "Maïs : quand semer et comment entretenir ?",
      "Chenille légionnaire à Bohicon : que faire ?",
      "Pas de pluie depuis 12 jours : faut-il arroser mes cultures ?",
    ]);
  });

  it("garde des questions utiles sans culture et sans doublon", () => {
    const suggestions = farmerSuggestions({ crops: [], alert: null, dryDays: 0, rain10dMm: 150 });
    expect(suggestions).toEqual([
      "Beaucoup de pluie ces derniers jours : comment protéger mes champs ?",
      "Comment bien sécher et conserver ma récolte ?",
    ]);
    expect(
      agentSuggestions({ openRequests: ["Q1", "Q1", "Q2", "Q3"], alert: null, crops: [] }),
    ).toEqual(["Q1", "Q2", "Comment limiter les pertes après récolte ?"]);
  });
});

describe("texte pour le producteur", () => {
  it("garde réponse et conseil quand ils tiennent en un message court", () => {
    expect(shortForProducer("Semez après 20 mm de pluie.", "Paillez le sol.")).toBe(
      "Semez après 20 mm de pluie. Paillez le sol.",
    );
  });

  it("préfère le conseil, puis la première phrase tronquée au mot", () => {
    const answer = `${"Le maïs se sème en début de saison des pluies. ".repeat(4)}`;
    expect(shortForProducer(answer, "Semez en lignes.")).toBe("Semez en lignes.");
    const text = shortForProducer(`${"mot ".repeat(60)}fin.`, null);
    expect(text.length).toBeLessThanOrEqual(SMS_MAX);
    expect(text.endsWith("…")).toBe(true);
    expect(shortForProducer(null, null)).toBe("");
  });

  it("lit la réponse et le conseil, ou le message de refus", () => {
    expect(speechText({ outcome: "ANSWERED", answer: "A.", advice: "B.", notice: null })).toBe(
      "A. Conseil : B.",
    );
    expect(
      speechText({ outcome: "OFF_TOPIC", answer: null, advice: null, notice: "Hors sujet." }),
    ).toBe("Hors sujet.");
  });

  it("n'oriente pas vers l'agent quand un indicateur sourcé répond", () => {
    const reply = {
      outcome: "LOW_CONFIDENCE",
      answer: null,
      advice: null,
      notice: "Je ne dispose pas d'une information fiable.",
    };
    expect(visibleNotice({ ...reply, indicator: { available: true } })).toBeNull();
    expect(visibleNotice({ ...reply, indicator: { available: false } })).toBe(reply.notice);
    expect(visibleNotice(reply)).toBe(reply.notice);
    expect(speechText({ ...reply, indicator: { available: true } })).toBe("");
  });
});

describe("erreurs et filtres", () => {
  it("traduit les statuts de l'API en phrases", () => {
    expect(errorMessage(429)).toMatch(/dans une heure/);
    expect(errorMessage(404, "NOT_FOUND")).toMatch(/périmètre/);
    expect(errorMessage(500)).toMatch(/ne répond pas/);
  });

  it("n'accepte qu'une issue connue dans l'adresse", () => {
    expect(outcomeFilter("LOW_CONFIDENCE")).toBe("LOW_CONFIDENCE");
    expect(outcomeFilter(["OFF_TOPIC"])).toBe("OFF_TOPIC");
    expect(outcomeFilter("DROP TABLE")).toBeUndefined();
  });
});
