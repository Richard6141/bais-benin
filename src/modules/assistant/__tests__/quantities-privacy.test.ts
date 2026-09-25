import { describe, expect, it } from "vitest";
import { redactPersonalData } from "../privacy";
import { checkQuantities, extractQuantities, mentionsDose } from "../quantities";

const pairs = (text: string) => extractQuantities(text).map((q) => [q.value, q.unit]);

describe("repérage des quantités", () => {
  it("lit les nombres en chiffres, en lettres et avec milliers, suivis de leur unité", () => {
    expect(pairs("Appliquez 1,5 l/ha")).toEqual([[1.5, "l"]]);
    expect(pairs("deux litres par hectare")).toEqual([[2, "l"]]);
    expect(pairs("vingt-cinq kilos")).toEqual([[25, "kg"]]);
    expect(pairs("30 000 plants par hectare")).toEqual([[30000, "plant"]]);
    expect(pairs("50 kg d'urée par ha")).toEqual([[50, "kg"]]);
    expect(pairs("200 ml pour 15 L")).toEqual([
      [200, "ml"],
      [15, "l"],
    ]);
    expect(pairs("480 g/L de matière active, formulation 50 EC")).toEqual([
      [480, "g"],
      [50, "formulation"],
    ]);
    expect(pairs("20 % des plants")).toEqual([[20, "pct"]]);
    // « un », « une » sans unité sont des articles.
    expect(pairs("Posez une bâche et un sac")).toEqual([[1, "sac"]]);
  });

  it("reconnaît le vocabulaire de dose, de surface traitée et de délai avant récolte", () => {
    expect(mentionsDose("C'est par hectare.")).toBe(true);
    expect(mentionsDose("à l'hectare")).toBe(true);
    expect(mentionsDose("attendre avant de récolter")).toBe(true);
    expect(mentionsDose("Semez après une bonne pluie.")).toBe(false);
  });

  it("compare les valeurs avec leurs bornes et leur unité", () => {
    const source = ["Appliquer 11 l/ha, soit 110 ml pour 10 litres, 14 jours avant la récolte."];
    expect(checkQuantities(["Appliquez 11 l/ha."], source).unsafe).toEqual([]);
    expect(checkQuantities(["Appliquez 1 l/ha."], source).unsafe).toHaveLength(1);
    expect(checkQuantities(["Appliquez 11 kg/ha."], source).unsafe).toHaveLength(1);
    expect(checkQuantities(["Attendez 14 jours avant la récolte."], source).unsafe).toEqual([]);
    expect(checkQuantities(["Attendez 7 jours avant de récolter."], source).unsafe).toHaveLength(1);
    // Nombre seul dans une réponse qui parle de dose : il doit venir de la source.
    expect(checkQuantities(["Mettez 3 fois le produit."], source).unsafe).toHaveLength(1);
    // Écartement inventé, sans rapport avec une dose : signalé, pas refusé comme dose.
    const spacing = checkQuantities(["Semez à 90 cm."], ["Semez à 75 cm."]);
    expect(spacing.unsafe).toEqual([]);
    expect(spacing.unsupported).toHaveLength(1);
  });
});

describe("masquage des données personnelles", () => {
  it("masque téléphones, NPI et adresses, garde les nombres agronomiques", () => {
    expect(redactPersonalData("Appelez-moi au +229 01 97 12 34 56 ou 97123456")).toBe(
      "Appelez-moi au [numéro masqué] ou [numéro masqué]",
    );
    expect(redactPersonalData("Mon NPI est 1234567890123.")).toBe("Mon NPI est [numéro masqué].");
    expect(redactPersonalData("Écrivez à kofi.a@exemple.bj")).toBe("Écrivez à [adresse masquée]");
    expect(redactPersonalData("30 000 plants, 12 300 pieds, 2026-2027, 75 × 50 cm")).toBe(
      "30 000 plants, 12 300 pieds, 2026-2027, 75 × 50 cm",
    );
  });
});
