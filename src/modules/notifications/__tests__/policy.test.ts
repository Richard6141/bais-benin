import { describe, expect, it } from "vitest";
import {
  MessagingError,
  type MessagingChannel,
  type OutboundMessage,
} from "@/services/ports/messaging-channel";
import {
  assistanceResolvedText,
  assistanceTakenText,
  quote,
  reportConfirmedText,
  reportDismissedText,
} from "../messages";
import { processNotification, type PendingNotification } from "../policy";

function channel(failWith?: MessagingError): MessagingChannel & { sent: OutboundMessage[] } {
  const sent: OutboundMessage[] = [];
  return {
    id: "fixture",
    sent,
    async send(message) {
      if (failWith) throw failWith;
      sent.push(message);
      return {
        channel: "fixture",
        providerMessageId: `msg-${sent.length}`,
        accepted: true,
        replayed: false,
      };
    },
  };
}

const pending: PendingNotification = {
  id: "notif-1",
  attempts: 0,
  text: "BAIS : votre demande est prise en charge.",
  recipient: {
    reliability: "DECLARED",
    phoneE164: "+2290197000001",
    whatsappConsentId: "consent-wa",
  },
};
// 10 h 00 et 22 h 30 à Porto-Novo (UTC+1).
const DAY = new Date("2026-09-25T09:00:00Z");
const NIGHT = new Date("2026-09-25T21:30:00Z");

describe("textes des messages de suivi", () => {
  const requestedAt = new Date("2026-09-24T08:00:00Z");

  it("nomme l'objet et la date, jamais l'agent", () => {
    const text = assistanceTakenText({ category: "INPUT", requestedAt });
    expect(text).toContain("(intrants) du 24/09");
    expect(text).toContain("prise en charge par un agent de votre commune");
  });

  it("cite la réponse de l'agent, tronquée", () => {
    const long = "Semences livrées. ".repeat(40);
    const text = assistanceResolvedText({ category: "ADVICE", requestedAt, note: long });
    expect(text).toContain("est résolue");
    expect(quote(long).length).toBeLessThanOrEqual(280);
    expect(quote(long).endsWith("…")).toBe(true);
    expect(quote("  deux\n lignes ")).toBe("deux lignes");
  });

  it("annonce la confirmation et le motif d'un signalement écarté", () => {
    const observedAt = new Date("2026-09-23T23:30:00Z");
    // 23 h 30 UTC = 0 h 30 le lendemain à Porto-Novo.
    expect(reportConfirmedText({ type: "PEST", observedAt })).toContain("(ravageur) du 24/09");
    expect(
      reportDismissedText({ type: "CROP_DISEASE", observedAt, note: "Sécheresse, pas maladie" }),
    ).toContain("Motif : « Sécheresse, pas maladie »");
    expect(reportDismissedText({ type: "OTHER", observedAt, note: null })).not.toContain("Motif");
  });
});

describe("envoi d'un message de suivi", () => {
  it("envoie avec la référence du consentement et une clé d'idempotence stable", async () => {
    const fixture = channel();
    const outcome = await processNotification(pending, fixture, DAY);
    expect(outcome.update).toMatchObject({ status: "SENT", attempts: 1, sentAt: DAY });
    expect(fixture.sent[0]).toMatchObject({
      kind: "TEXT",
      to: "+2290197000001",
      consentReference: "consent-wa",
      idempotencyKey: "farmer-notification-notif-1",
    });
  });

  it("n'envoie rien sans consentement, sans numéro ou pour une fiche de démonstration", async () => {
    const fixture = channel();
    const cases: PendingNotification["recipient"][] = [
      { ...pending.recipient, whatsappConsentId: null },
      { ...pending.recipient, phoneE164: null },
      { ...pending.recipient, reliability: "SYNTHETIC" },
    ];
    for (const recipient of cases) {
      const outcome = await processNotification({ ...pending, recipient }, fixture, DAY);
      expect(outcome.update.status).toBe("SKIPPED");
    }
    expect(fixture.sent).toHaveLength(0);
  });

  it("attend 6 h pendant le silence nocturne", async () => {
    const outcome = await processNotification(pending, channel(), NIGHT);
    expect(outcome.update).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(outcome.update.nextAttemptAt?.toISOString()).toBe("2026-09-26T05:00:00.000Z");
  });

  it("reprend après un échec passager, abandonne au troisième ou si le numéro est inconnu", async () => {
    const down = channel(new MessagingError("PROVIDER_UNAVAILABLE", "Indisponible"));
    const first = await processNotification(pending, down, DAY);
    expect(first.update).toMatchObject({ status: "PENDING", attempts: 1 });
    const last = await processNotification({ ...pending, attempts: 2 }, down, DAY);
    expect(last.update).toMatchObject({ status: "FAILED", attempts: 3 });
    const unknown = channel(new MessagingError("RECIPIENT_UNKNOWN", "Pas sur WhatsApp"));
    expect((await processNotification(pending, unknown, DAY)).update.status).toBe("FAILED");
  });

  it("s'arrête au quota du fournisseur sans compter d'essai", async () => {
    const limited = channel(new MessagingError("RATE_LIMITED", "Quota", 120));
    const outcome = await processNotification(pending, limited, DAY);
    expect(outcome.quotaReached).toBe(true);
    expect(outcome.update).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(outcome.update.nextAttemptAt?.getTime()).toBe(DAY.getTime() + 120_000);
  });
});
