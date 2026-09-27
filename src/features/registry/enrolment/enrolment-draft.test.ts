import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import { AgentDatabase } from "@/lib/offline/db";
import { openEnrolmentDraft, saveEnrolmentSection } from "./enrolment-draft";

const newDb = () => new AgentDatabase(`test-draft-${crypto.randomUUID()}`);

describe("openEnrolmentDraft", () => {
  it("crée le brouillon sous l'identifiant de l'adresse, une seule fois", async () => {
    const db = newDb();
    const id = crypto.randomUUID();

    const [first, second] = await Promise.all([
      openEnrolmentDraft(db, id),
      openEnrolmentDraft(db, id),
    ]);

    expect(first?.id).toBe(id);
    expect(second?.id).toBe(id);
    expect(first?.status).toBe("IN_PROGRESS");
    expect(await db.drafts.count()).toBe(1);
  });

  it("reprend un brouillon existant sans l'écraser", async () => {
    const db = newDb();
    const id = crypto.randomUUID();
    await openEnrolmentDraft(db, id);
    await saveEnrolmentSection(
      db,
      id,
      { size: { areaHa: "2,5", tenure: "FAMILY", irrigation: "NONE" } },
      3,
    );

    const reopened = await openEnrolmentDraft(db, id);

    expect(reopened?.step).toBe(3);
    expect(reopened?.data.size?.areaHa).toBe("2,5");
  });

  it("refuse l'identifiant d'un autre type de brouillon", async () => {
    const db = newDb();
    const id = crypto.randomUUID();
    await db.drafts.add({
      id,
      kind: "HARVEST_DECLARATION",
      step: 0,
      data: {},
      status: "IN_PROGRESS",
      createdAt: "2026-09-27T10:00:00.000Z",
      updatedAt: "2026-09-27T10:00:00.000Z",
    });

    expect(await openEnrolmentDraft(db, id)).toBeNull();
    expect((await db.drafts.get(id))?.kind).toBe("HARVEST_DECLARATION");
  });
});
