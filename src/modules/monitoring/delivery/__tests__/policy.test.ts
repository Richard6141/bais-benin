import { describe, expect, it } from "vitest";

import {
  MessagingError,
  type MessagingChannel,
  type OutboundMessage,
} from "@/services/ports/messaging-channel";
import {
  MAX_ATTEMPTS,
  backoffDelayMs,
  endOfQuietHours,
  isQuietHours,
  processDelivery,
  reminderChannel,
  type DeliveryAlert,
  type DeliveryConsents,
  type PendingDelivery,
} from "../policy";

// Double de messagerie : enregistre les messages, échoue à la demande.
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

const alert: DeliveryAlert = {
  id: "alert-1",
  severity: "WARNING",
  reliability: "ESTIMATED",
  status: "ACTIVE",
  messageShort: "BAIS Djougou : 12 jours sans pluie.",
};
const delivery: PendingDelivery = {
  id: "rcpt-1",
  alertId: "alert-1",
  farmId: "farm-1",
  phoneE164: "+2290190000002",
  channel: "WHATSAPP",
  attempts: 0,
};
const bothConsents: DeliveryConsents = { WHATSAPP: "consent-wa", SMS: "consent-sms" };
// 10 h 00 à Porto-Novo (UTC+1).
const DAY = new Date("2026-09-25T09:00:00Z");
// 22 h 30 à Porto-Novo.
const NIGHT = new Date("2026-09-25T21:30:00Z");

describe("silence nocturne", () => {
  it("couvre 21 h à 6 h heure de Porto-Novo", () => {
    expect(isQuietHours(new Date("2026-09-25T19:59:00Z"))).toBe(false); // 20 h 59
    expect(isQuietHours(new Date("2026-09-25T20:00:00Z"))).toBe(true); // 21 h
    expect(isQuietHours(new Date("2026-09-26T04:59:00Z"))).toBe(true); // 5 h 59
    expect(isQuietHours(new Date("2026-09-26T05:00:00Z"))).toBe(false); // 6 h
    expect(endOfQuietHours(NIGHT).toISOString()).toBe("2026-09-26T05:00:00.000Z");
    expect(endOfQuietHours(new Date("2026-09-26T02:00:00Z")).toISOString()).toBe(
      "2026-09-26T05:00:00.000Z",
    );
  });

  it("reporte à 6 h un message non critique envoyé la nuit, sans tentative", async () => {
    const wa = channel();
    const outcome = await processDelivery(
      delivery,
      alert,
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      NIGHT,
    );
    expect(wa.sent).toHaveLength(0);
    expect(outcome.update).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(outcome.update.nextAttemptAt?.toISOString()).toBe("2026-09-26T05:00:00.000Z");
  });

  it("envoie une alerte critique même la nuit", async () => {
    const wa = channel();
    const outcome = await processDelivery(
      delivery,
      { ...alert, severity: "CRITICAL" },
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      NIGHT,
    );
    expect(outcome.update.status).toBe("SENT");
    expect(wa.sent).toHaveLength(1);
  });
});

describe("envoi", () => {
  it("envoie le message court avec consentement et clé d'idempotence", async () => {
    const wa = channel();
    const outcome = await processDelivery(
      delivery,
      alert,
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(outcome.update).toMatchObject({
      status: "SENT",
      attempts: 1,
      providerMessageId: "msg-1",
      sentAt: DAY,
    });
    expect(wa.sent[0]).toEqual({
      kind: "TEXT",
      to: "+2290190000002",
      text: alert.messageShort,
      consentReference: "consent-wa",
      idempotencyKey: "alert-alert-1-rcpt-1-whatsapp",
    });
  });

  it("n'envoie jamais hors application une alerte calculée sur des données de démonstration", async () => {
    const wa = channel();
    const outcome = await processDelivery(
      delivery,
      { ...alert, reliability: "SYNTHETIC" },
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(wa.sent).toHaveLength(0);
    expect(outcome.update.status).toBe("SKIPPED");
    expect(outcome.update.failureReason).toMatch(/démonstration/);
    expect(outcome.followUp).toBeNull();
  });

  it("n'envoie jamais à un producteur de démonstration, même pour une alerte réelle", async () => {
    const wa = channel();
    const outcome = await processDelivery(
      { ...delivery, recipientReliability: "SYNTHETIC" },
      alert,
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(wa.sent).toHaveLength(0);
    expect(outcome.update.status).toBe("SKIPPED");
    expect(outcome.update.failureReason).toMatch(/Producteur de démonstration/);
    expect(outcome.followUp).toBeNull();
  });

  it("n'envoie pas sans consentement et propose le repli", async () => {
    const wa = channel();
    const outcome = await processDelivery(
      delivery,
      alert,
      { WHATSAPP: null, SMS: "consent-sms" },
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(outcome.update.status).toBe("SKIPPED");
    expect(outcome.followUp).toBe("SMS");
    const none = await processDelivery(
      delivery,
      alert,
      { WHATSAPP: null, SMS: null },
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(none.followUp).toBe("RELAY");
    expect(wa.sent).toHaveLength(0);
  });

  it("ignore une alerte déjà levée", async () => {
    const outcome = await processDelivery(
      delivery,
      { ...alert, status: "RESOLVED" },
      bothConsents,
      { WHATSAPP: channel(), SMS: null },
      DAY,
    );
    expect(outcome.update.status).toBe("SKIPPED");
  });
});

describe("échecs", () => {
  it("bascule sur le SMS quand le numéro n'a pas WhatsApp", async () => {
    const wa = channel(
      new MessagingError("RECIPIENT_UNKNOWN", "Destinataire introuvable sur WhatsApp"),
    );
    const outcome = await processDelivery(
      delivery,
      alert,
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(outcome.update).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(outcome.followUp).toBe("SMS");
    const noSms = await processDelivery(
      delivery,
      alert,
      { WHATSAPP: "consent-wa", SMS: null },
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(noSms.followUp).toBe("RELAY");
  });

  it("réessaie avec un repli exponentiel puis abandonne au bout de trois tentatives", async () => {
    const wa = channel(new MessagingError("PROVIDER_UNAVAILABLE", "WhatsApp injoignable (502)"));
    const first = await processDelivery(
      delivery,
      alert,
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(first.update).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(first.update.nextAttemptAt?.getTime()).toBe(DAY.getTime() + backoffDelayMs(1));
    const second = await processDelivery(
      { ...delivery, attempts: 1 },
      alert,
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(second.update.nextAttemptAt?.getTime()).toBe(DAY.getTime() + backoffDelayMs(2));
    expect(backoffDelayMs(2)).toBe(2 * backoffDelayMs(1));
    const last = await processDelivery(
      { ...delivery, attempts: MAX_ATTEMPTS - 1 },
      alert,
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(last.update).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
    expect(last.followUp).toBe("RELAY");
  });

  it("s'arrête sur un quota atteint sans décompter de tentative", async () => {
    const wa = channel(new MessagingError("RATE_LIMITED", "Quota wapy.pro atteint", 120));
    const outcome = await processDelivery(
      delivery,
      alert,
      bothConsents,
      { WHATSAPP: wa, SMS: null },
      DAY,
    );
    expect(outcome.quotaReached).toBe(true);
    expect(outcome.update).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(outcome.update.nextAttemptAt?.getTime()).toBe(DAY.getTime() + 120_000);
  });

  it("passe au relais quand le canal SMS n'est pas configuré", async () => {
    const outcome = await processDelivery(
      { ...delivery, channel: "SMS" },
      alert,
      bothConsents,
      { WHATSAPP: channel(), SMS: null },
      DAY,
    );
    expect(outcome.update.status).toBe("SKIPPED");
    expect(outcome.followUp).toBe("RELAY");
  });
});

describe("relance", () => {
  const sent = {
    channel: "WHATSAPP" as const,
    status: "SENT",
    sentAt: new Date(DAY.getTime() - 25 * 3600_000),
  };

  it("relance une fois après 24 h un message non lu, par le canal suivant", () => {
    expect(reminderChannel(sent, alert, bothConsents, DAY)).toBe("SMS");
    expect(reminderChannel(sent, alert, { WHATSAPP: "c", SMS: null }, DAY)).toBe("RELAY");
    expect(reminderChannel({ ...sent, channel: "SMS" }, alert, bothConsents, DAY)).toBe("RELAY");
  });

  it("ne relance ni trop tôt, ni une alerte INFO ou WATCH, ni un message lu ou une alerte levée", () => {
    expect(
      reminderChannel(
        { ...sent, sentAt: new Date(DAY.getTime() - 23 * 3600_000) },
        alert,
        bothConsents,
        DAY,
      ),
    ).toBeNull();
    expect(reminderChannel(sent, { ...alert, severity: "WATCH" }, bothConsents, DAY)).toBeNull();
    expect(reminderChannel(sent, { ...alert, severity: "INFO" }, bothConsents, DAY)).toBeNull();
    expect(reminderChannel({ ...sent, status: "READ" }, alert, bothConsents, DAY)).toBeNull();
    expect(reminderChannel(sent, { ...alert, status: "RESOLVED" }, bothConsents, DAY)).toBeNull();
  });
});
