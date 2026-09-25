import { describe, expect, it } from "vitest";
import { readJsonWithLimit } from "./read-json";

// Corps envoyé par morceaux, sans Content-Length : le cas que la seule lecture de l'en-tête
// laissait passer (revue de sécurité, D).
function chunkedRequest(parts: string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Request("http://localhost/api/v1/sync", {
    method: "POST",
    body,
    // @ts-expect-error -- option requise par undici pour un corps en flux
    duplex: "half",
  });
}

describe("readJsonWithLimit", () => {
  it("lit un corps JSON sous le plafond", async () => {
    const result = await readJsonWithLimit(chunkedRequest(['{"commands":', "[]}"]), 1024);
    expect(result).toEqual({ ok: true, value: { commands: [] } });
  });

  it("refuse un corps par morceaux qui dépasse le plafond, sans Content-Length", async () => {
    const big = chunkedRequest(Array.from({ length: 20 }, () => "x".repeat(100)));
    expect(await readJsonWithLimit(big, 1024)).toEqual({ ok: false, reason: "TOO_LARGE" });
  });

  it("refuse d'emblée un Content-Length trop grand, et un JSON illisible", async () => {
    const declared = new Request("http://localhost/api/v1/sync", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "5000" },
    });
    expect(await readJsonWithLimit(declared, 1024)).toEqual({ ok: false, reason: "TOO_LARGE" });
    expect(await readJsonWithLimit(chunkedRequest(["{pas du json"]), 1024)).toEqual({
      ok: false,
      reason: "INVALID_JSON",
    });
  });
});
