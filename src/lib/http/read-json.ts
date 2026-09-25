// Lecture d'un corps JSON plafonnée en octets. L'en-tête Content-Length ne suffit pas : un envoi
// par morceaux (Transfer-Encoding: chunked) n'en a pas, et `request.json()` lirait alors tout en
// mémoire. Le flux est lu morceau par morceau et abandonné dès que le plafond est dépassé.

export type ReadJsonResult =
  { ok: true; value: unknown } | { ok: false; reason: "TOO_LARGE" | "INVALID_JSON" };

export async function readJsonWithLimit(
  request: Request,
  maxBytes: number,
): Promise<ReadJsonResult> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, reason: "TOO_LARGE" };
  if (!request.body) return { ok: false, reason: "INVALID_JSON" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: "TOO_LARGE" };
    }
    chunks.push(value);
  }
  try {
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  }
}
