import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDatabase } from "@/lib/offline/db";
import type { EnrolmentDraft } from "./enrolment-draft";
import { EMPTY_ENROLMENT } from "./enrolment-types";
import { useEnrolmentDraft } from "./use-enrolment-draft";

// Adresse de l'écran d'enregistrement. Le routeur de Next relit history.replaceState : une
// réécriture de l'adresse après la création asynchrone du brouillon annulait la navigation que
// l'agent avait lancée entre-temps (bulle des premiers pas « Étape suivante »).

const { openEnrolmentDraft } = vi.hoisted(() => ({ openEnrolmentDraft: vi.fn() }));
vi.mock("./enrolment-draft", () => ({ openEnrolmentDraft }));

const db = {} as AgentDatabase;
const ID = "01923456-0000-7000-8000-00000000d001";

const draftOf = (id: string): EnrolmentDraft => ({
  id,
  step: 0,
  data: { ...EMPTY_ENROLMENT },
  status: "IN_PROGRESS",
  createdAt: "2026-09-27T10:00:00.000Z",
  updatedAt: "2026-09-27T10:00:00.000Z",
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const address = () => `${window.location.pathname}${window.location.search}`;

describe("useEnrolmentDraft", () => {
  beforeEach(() => {
    openEnrolmentDraft.mockReset();
    window.history.replaceState(null, "", "/agent/enregistrer?pas=enregistrer");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("écrit l'identifiant d'un brouillon neuf dès l'ouverture, avant toute création", () => {
    renderHook(() => useEnrolmentDraft(db, null, vi.fn()));

    const url = new URL(window.location.href);
    expect(url.pathname).toBe("/agent/enregistrer");
    expect(url.searchParams.get("pas")).toBe("enregistrer");
    expect(url.searchParams.get("brouillon")).toMatch(/^[0-9a-f-]{36}$/);
    expect(openEnrolmentDraft).not.toHaveBeenCalled();
  });

  it("ne réécrit jamais l'adresse une fois le brouillon créé, même si l'agent est parti", async () => {
    window.history.replaceState(null, "", `/agent/enregistrer?pas=enregistrer&brouillon=${ID}`);
    const creation = deferred<EnrolmentDraft | null>();
    openEnrolmentDraft.mockReturnValue(creation.promise);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const onOpen = vi.fn();

    renderHook(() => useEnrolmentDraft(db, ID, onOpen));
    expect(openEnrolmentDraft).toHaveBeenCalledWith(db, ID);

    // L'agent touche « Étape suivante » avant la fin de la création : Next pousse l'adresse de
    // l'étape suivante.
    window.history.pushState(null, "", "/agent/exploitations?pas=exploitations");
    await act(async () => creation.resolve(draftOf(ID)));

    expect(onOpen).toHaveBeenCalledWith(draftOf(ID));
    expect(replaceState).not.toHaveBeenCalled();
    expect(address()).toBe("/agent/exploitations?pas=exploitations");
  });

  it("n'applique plus le brouillon une fois l'écran quitté", async () => {
    const creation = deferred<EnrolmentDraft | null>();
    openEnrolmentDraft.mockReturnValue(creation.promise);
    const onOpen = vi.fn();

    const { unmount } = renderHook(() => useEnrolmentDraft(db, ID, onOpen));
    unmount();
    await act(async () => creation.resolve(draftOf(ID)));

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("identifiant d'un autre brouillon : un neuf, seulement si l'écran est toujours affiché", async () => {
    const left = deferred<EnrolmentDraft | null>();
    openEnrolmentDraft.mockReturnValue(left.promise);
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderHook(() => useEnrolmentDraft(db, ID, vi.fn()));
    window.history.pushState(null, "", "/agent/exploitations?pas=exploitations");
    await act(async () => left.resolve(null));
    expect(replaceState).not.toHaveBeenCalled();
    expect(address()).toBe("/agent/exploitations?pas=exploitations");

    window.history.pushState(null, "", `/agent/enregistrer?pas=enregistrer&brouillon=${ID}`);
    const stayed = deferred<EnrolmentDraft | null>();
    openEnrolmentDraft.mockReturnValue(stayed.promise);
    renderHook(() => useEnrolmentDraft(db, ID, vi.fn()));
    await act(async () => stayed.resolve(null));
    const url = new URL(window.location.href);
    expect(url.pathname).toBe("/agent/enregistrer");
    expect(url.searchParams.get("pas")).toBe("enregistrer");
    expect(url.searchParams.get("brouillon")).not.toBe(ID);
  });
});
