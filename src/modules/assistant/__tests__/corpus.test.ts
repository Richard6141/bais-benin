import { describe, expect, it } from "vitest";
import { chunkFiche, embeddingText, parseFiche } from "../corpus";

const header = {
  slug: "mais-semis",
  title: "Maïs : semis",
  crops: ["MAIZE"],
  topics: ["semis"],
  demonstration: true,
  source: {
    organization: "Organisme",
    title: "Guide",
    url: "https://example.org/guide.pdf",
    licence: "CC BY 4.0",
    published: "2020",
    checkedOn: "2026-09-25",
  },
};

const fiche = (body: string, meta: object = header) =>
  `---\n${JSON.stringify(meta, null, 2)}\n---\n${body}`;

describe("fiches du corpus", () => {
  it("lit l'en-tête, applique les valeurs par défaut et calcule une empreinte stable", () => {
    const parsed = parseFiche(fiche("# Maïs\n\nIntroduction.\n\n## Date\n\nSemez tôt."));
    expect(parsed.meta).toMatchObject({ slug: "mais-semis", zones: [], alertCategories: [] });
    expect(parsed.contentHash).toBe(
      parseFiche(fiche("# Maïs\n\nIntroduction.\n\n## Date\n\nSemez tôt.")).contentHash,
    );
    expect(parsed.contentHash).not.toBe(parseFiche(fiche("# Maïs\n\nAutre.")).contentHash);
  });

  it("refuse une fiche sans en-tête ou avec une source incomplète", () => {
    expect(() => parseFiche("# Sans en-tête")).toThrow(/en-tête/);
    expect(() =>
      parseFiche(
        fiche("Texte", { ...header, source: { ...header.source, url: "pas une url" } }),
        "x.md",
      ),
    ).toThrow(/x\.md : en-tête invalide \(source\.url/);
  });

  it("découpe par section, garde le titre, coupe une section trop longue avec recouvrement", () => {
    const long = Array.from({ length: 6 }, (_, i) => `Paragraphe ${i} ${"mot ".repeat(90)}`).join(
      "\n\n",
    );
    const chunks = chunkFiche(
      parseFiche(
        fiche(
          `# Maïs\n\nIntroduction courte.\n\n## Densité\n\n${long}\n\n## Récolte\n\nRécoltez sec.`,
        ),
      ),
      1200,
    );
    expect(chunks[0]).toMatchObject({ ordinal: 0, heading: "Maïs : semis — Présentation" });
    const density = chunks.filter((c) => c.heading.endsWith("Densité"));
    expect(density.length).toBeGreaterThan(1);
    // Le dernier paragraphe d'un morceau ouvre le suivant.
    const lastOfFirst = density[0]!.content.split("\n\n").at(-1)!;
    expect(density[1]!.content.startsWith(lastOfFirst)).toBe(true);
    expect(chunks.at(-1)).toMatchObject({
      heading: "Maïs : semis — Récolte",
      content: "Récoltez sec.",
    });
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
    expect(embeddingText(chunks.at(-1)!)).toBe("Maïs : semis — Récolte\nRécoltez sec.");
  });
});
