import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingError, type MessagingChannel } from "@/services/ports/messaging-channel";

// Filet des numéros inventés : hors production, aucun message TEXT ne part vers la plage des
// fiches de démonstration, quel que soit le chemin ; les codes de connexion passent toujours.

const { warn, env } = vi.hoisted(() => ({
  warn: vi.fn(),
  env: { APP_ENV: "demo", MESSAGING_PRIMARY_CHANNEL: "fixture" } as Record<string, string>,
}));
vi.mock("@/lib/logger", () => ({ logger: { warn, info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => env }));

import { getFixtureMessagingChannel, getMessagingChannel } from "./index";
import { guardSyntheticRecipients } from "./synthetic-guard";

// Plage inventée : +229 01 XX 9X XX XX.
const INVENTED = "+2290112934567";
const REAL = "+2290166000123";

const text = (to: string) => ({
  kind: "TEXT" as const,
  to,
  text: "BAIS : feu à environ 600 m au nord-est de votre champ.",
  idempotencyKey: "alert-a-r-whatsapp",
});

function recordingChannel(): MessagingChannel & { send: ReturnType<typeof vi.fn> } {
  return {
    id: "wapy",
    send: vi.fn(async () => ({
      channel: "wapy" as const,
      providerMessageId: "m1",
      accepted: true,
      replayed: false,
    })),
  };
}

const globals = globalThis as unknown as { messagingChannel?: unknown; fixtureChannel?: unknown };

describe("filet des numéros inventés", () => {
  beforeEach(() => {
    warn.mockClear();
    delete globals.messagingChannel;
    delete globals.fixtureChannel;
  });
  afterEach(() => {
    env.APP_ENV = "demo";
    delete globals.messagingChannel;
    delete globals.fixtureChannel;
  });

  it("refuse un message vers un numéro inventé, sans l'envoyer, et le trace sans le numéro", async () => {
    const inner = recordingChannel();
    const guarded = guardSyntheticRecipients(inner);
    const refusal = guarded.send(text(INVENTED));
    await expect(refusal).rejects.toBeInstanceOf(MessagingError);
    await expect(refusal).rejects.toMatchObject({ code: "RECIPIENT_UNKNOWN" });
    expect(inner.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain(INVENTED);
  });

  it("laisse passer un vrai numéro, et toujours un code de connexion", async () => {
    const inner = recordingChannel();
    const guarded = guardSyntheticRecipients(inner);
    await guarded.send(text(REAL));
    await guarded.send({
      kind: "OTP",
      to: INVENTED,
      code: "123456",
      service: "BAIS",
      expiresInMinutes: 10,
      idempotencyKey: "otp-1",
    });
    expect(inner.send).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it("enveloppe le canal hors production, et le canal fixture reste lisible par les tests", async () => {
    const channel = getMessagingChannel();
    await expect(channel.send(text(INVENTED))).rejects.toMatchObject({
      code: "RECIPIENT_UNKNOWN",
    });
    await channel.send(text(REAL));
    expect(getFixtureMessagingChannel().sent.map((m) => m.to)).toEqual([REAL]);
  });

  it("n'enveloppe pas le canal en production", async () => {
    env.APP_ENV = "production";
    await getMessagingChannel().send(text(INVENTED));
    expect(getFixtureMessagingChannel().sent.map((m) => m.to)).toEqual([INVENTED]);
  });
});
