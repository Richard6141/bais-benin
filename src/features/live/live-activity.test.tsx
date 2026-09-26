import { describe, expect, it } from "vitest";
import type { LiveActivityItem } from "@/modules/live";
import { describeActivity } from "./live-activity-feed";
import { pulseTone } from "./live-pulse";
import { mergeActivity } from "./use-live-activity";

const item = (over: Partial<LiveActivityItem>): LiveActivityItem => ({
  id: "a",
  kind: "farm.PARCEL_GEOMETRY_SET",
  detail: null,
  at: "2026-09-26T10:00:00.000Z",
  communeCode: "BJ-DON-003",
  communeName: "Djougou",
  departementName: "Donga",
  point: null,
  href: null,
  ...over,
});

describe("fil d'activité en direct", () => {
  it("fusionne sans doublon, du plus récent au plus ancien, en gardant les derniers", () => {
    const current = [item({ id: "a", at: "2026-09-26T10:00:00.000Z" })];
    const merged = mergeActivity(
      current,
      [
        item({ id: "b", at: "2026-09-26T10:05:00.000Z" }),
        item({ id: "a", at: "2026-09-26T10:00:00.000Z" }),
        item({ id: "c", at: "2026-09-26T09:00:00.000Z" }),
      ],
      2,
    );
    expect(merged.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("décrit chaque fait en clair, sans séparateur interdit", () => {
    const labels = [
      describeActivity(item({ kind: "farm.PARCEL_GEOMETRY_SET" })).label,
      describeActivity(item({ kind: "report.created", detail: "PEST" })).label,
      describeActivity(item({ kind: "alert.raised", detail: "CRITICAL" })).label,
      describeActivity(item({ kind: "fire.detected" })).label,
      describeActivity(item({ kind: "assistance.requested", detail: "DISASTER" })).label,
    ];
    expect(labels).toEqual([
      "Contour de champ relevé",
      "Signalement : ravageur",
      expect.stringMatching(/^Alerte levée \(/),
      "Feu détecté",
      "Demande d'aide : sinistre",
    ]);
    expect(labels.join(" ")).not.toMatch(/·|…|—/);
  });

  it("colore le point sur la carte selon la nature du fait", () => {
    expect(pulseTone("fire.detected")).toBe("alert");
    expect(pulseTone("alert.raised")).toBe("alert");
    expect(pulseTone("farm.PARCEL_GEOMETRY_SET")).toBe("field");
    expect(pulseTone("report.created")).toBe("neutral");
  });
});
