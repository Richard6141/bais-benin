import { getServerEnv } from "@/lib/env";
import type { MessagingChannel } from "@/services/ports/messaging-channel";
import { ConsoleMessagingChannel } from "./console/console-channel";
import { FixtureMessagingChannel } from "./fixture/fixture-channel";
import { guardSyntheticRecipients } from "./synthetic-guard";
import { WapyMessagingChannel } from "./wapy/wapy-channel";

// Une seule instance par processus : le canal fixture doit conserver ses messages
// entre l'envoi et la lecture dans un test. Hors production, le canal est enveloppé par le filet
// des numéros inventés (synthetic-guard.ts) ; le canal fixture reste lisible par les tests.
const globalForMessaging = globalThis as unknown as {
  messagingChannel?: MessagingChannel;
  fixtureChannel?: FixtureMessagingChannel;
};

export function getMessagingChannel(): MessagingChannel {
  if (globalForMessaging.messagingChannel) return globalForMessaging.messagingChannel;
  const env = getServerEnv();
  let channel: MessagingChannel;
  switch (env.MESSAGING_PRIMARY_CHANNEL) {
    case "wapy":
      if (!env.WAPY_API_KEY) {
        throw new Error("MESSAGING_PRIMARY_CHANNEL=wapy exige WAPY_API_KEY");
      }
      channel = new WapyMessagingChannel({ baseUrl: env.WAPY_API_URL, apiKey: env.WAPY_API_KEY });
      break;
    case "fixture":
      channel = globalForMessaging.fixtureChannel = new FixtureMessagingChannel();
      break;
    default:
      channel = new ConsoleMessagingChannel();
  }
  const guarded = env.APP_ENV === "production" ? channel : guardSyntheticRecipients(channel);
  globalForMessaging.messagingChannel = guarded;
  return guarded;
}

export function getFixtureMessagingChannel(): FixtureMessagingChannel {
  getMessagingChannel();
  const channel = globalForMessaging.fixtureChannel;
  if (!channel) {
    throw new Error("Le canal fixture n'est pas actif (MESSAGING_PRIMARY_CHANNEL=fixture)");
  }
  return channel;
}
