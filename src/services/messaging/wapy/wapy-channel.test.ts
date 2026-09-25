import { describe, expect, it, vi } from "vitest";
import { WapyMessagingChannel } from "./wapy-channel";

// Contrat du « Pont WhatsApp » de wapy.pro (documentation développeurs) : réponses et erreurs.

function channelReturning(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
  const channel = new WapyMessagingChannel({
    baseUrl: "https://wapy.pro",
    apiKey: "cle-de-test",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { channel, fetchImpl };
}

const otp = {
  kind: "OTP" as const,
  to: "+2290190000009",
  code: "482913",
  service: "BAIS",
  expiresInMinutes: 5,
  idempotencyKey: "otp-test-1",
};

describe("WapyMessagingChannel", () => {
  it("envoie un code sur /pont/v1/otp et accepte un identifiant numérique", async () => {
    const { channel, fetchImpl } = channelReturning(200, {
      id: 1042,
      message_id: "3EB0C8F2A1D4E5B6",
      statut: "envoye",
      remise: "acceptee",
      rejeu: false,
    });
    const receipt = await channel.send(otp);
    expect(receipt).toMatchObject({
      channel: "wapy",
      providerMessageId: "3EB0C8F2A1D4E5B6",
      accepted: true,
      replayed: false,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://wapy.pro/pont/v1/otp");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer cle-de-test",
      "Idempotency-Key": "otp-test-1",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      destinataire: "+2290190000009",
      code: "482913",
      service: "BAIS",
      minutes: 5,
    });
  });

  it("se rabat sur l'identifiant numérique quand message_id manque", async () => {
    const { channel } = channelReturning(200, { id: 7, statut: "envoye" });
    expect((await channel.send(otp)).providerMessageId).toBe("7");
  });

  it("traduit le quota atteint et l'absence de compte WhatsApp", async () => {
    await expect(
      channelReturning(429, {}, { "Retry-After": "120" }).channel.send(otp),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 120 });
    await expect(channelReturning(404, {}).channel.send(otp)).rejects.toMatchObject({
      code: "RECIPIENT_UNKNOWN",
    });
  });
});
