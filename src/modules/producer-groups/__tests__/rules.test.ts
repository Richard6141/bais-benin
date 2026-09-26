import { describe, expect, it } from "vitest";
import {
  MAX_GROUP_MESSAGE_LENGTH,
  checkGroupMessage,
  groupMessageText,
  normalizeGroupName,
  suggestGroupName,
} from "../rules";
import { groupMessageSubjectId, uuidV5 } from "../subject";

const FORBIDDEN_MARKS = /[·…—]/;

describe("nom proposé d'un groupe", () => {
  it("reprend culture, zone, campagne et nombre de producteurs", () => {
    expect(
      suggestGroupName({
        cropName: "Coton",
        scopeName: "Borgou",
        campaignCode: "2024-2025",
        count: 100,
        metric: "production",
      }),
    ).toBe("Coton, Borgou, 2024-2025, 100 premiers");
  });

  it("dit le pays sans département, le rendement quand il sert de critère, et accorde", () => {
    const name = suggestGroupName({
      cropName: "MAÏS",
      scopeName: null,
      campaignCode: "2023-2024",
      count: 1,
      metric: "yield",
    });
    expect(name).toBe("Maïs, Bénin, 2023-2024, 1 premier au rendement");
    expect(name).not.toMatch(FORBIDDEN_MARKS);
  });
});

describe("nom d'un groupe", () => {
  it("retire espaces en trop et caractères invisibles", () => {
    expect(normalizeGroupName("  Coton\u200b   Borgou \n 2024 ")).toBe("Coton Borgou 2024");
  });

  it("refuse un nom vide, trop court ou trop long", () => {
    expect(normalizeGroupName("   ")).toBeNull();
    expect(normalizeGroupName("ab")).toBeNull();
    expect(normalizeGroupName("x".repeat(121))).toBeNull();
    expect(normalizeGroupName("x".repeat(120))).toHaveLength(120);
  });
});

describe("message aux membres", () => {
  it("nettoie le texte sans toucher aux sauts de ligne voulus", () => {
    expect(checkGroupMessage("  Bonjour,\r\n\n\n\nRéunion   lundi\u202e à Parakou.  ")).toEqual({
      ok: true,
      text: "Bonjour,\n\nRéunion lundi à Parakou.",
    });
  });

  it("refuse un message vide ou fait d'espaces", () => {
    expect(checkGroupMessage("")).toEqual({ ok: false, code: "EMPTY" });
    expect(checkGroupMessage(" \n\t\u200b ")).toEqual({ ok: false, code: "EMPTY" });
  });

  it("accepte 500 caractères, pas un de plus", () => {
    expect(checkGroupMessage("a".repeat(MAX_GROUP_MESSAGE_LENGTH)).ok).toBe(true);
    expect(checkGroupMessage("a".repeat(MAX_GROUP_MESSAGE_LENGTH + 1))).toEqual({
      ok: false,
      code: "TOO_LONG",
    });
    // Les espaces retirés ne comptent pas.
    expect(checkGroupMessage(`  ${"a".repeat(MAX_GROUP_MESSAGE_LENGTH)}  `).ok).toBe(true);
  });

  it("refuse liens et adresses e-mail, deux fois de suite (pas d'état entre appels)", () => {
    for (let i = 0; i < 2; i += 1) {
      expect(checkGroupMessage("Inscrivez-vous sur https://exemple.bj/prime")).toEqual({
        ok: false,
        code: "LINK",
      });
      expect(checkGroupMessage("Écrivez à primes@exemple.org")).toEqual({
        ok: false,
        code: "LINK",
      });
    }
    expect(checkGroupMessage("Rendez-vous au magasin. Merci.").ok).toBe(true);
  });

  it("signe le message au nom du ministère", () => {
    expect(groupMessageText("Réunion lundi.")).toBe(
      "BAIS, ministère de l'Agriculture : Réunion lundi.",
    );
  });
});

describe("sujet d'une notification de groupe", () => {
  it("suit l'UUID v5 de la RFC (vecteur de référence)", () => {
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("donne un sujet stable et propre à chaque couple (message, producteur)", () => {
    const message = "019284a0-0000-7000-8000-0000000f1001";
    const farmer = "019284a0-0000-7000-8000-0000000f1002";
    const subject = groupMessageSubjectId(message, farmer);
    expect(subject).toBe("3fec4a9f-41ea-5e21-ae80-428d57a4fd18");
    expect(groupMessageSubjectId(message, farmer.toUpperCase())).toBe(subject);
    expect(groupMessageSubjectId(message, "019284a0-0000-7000-8000-0000000f1003")).not.toBe(
      subject,
    );
    expect(groupMessageSubjectId(farmer, message)).not.toBe(subject);
  });

  it("refuse un espace de noms qui n'est pas un UUID", () => {
    expect(() => uuidV5("x", "pas-un-uuid")).toThrow();
  });
});
