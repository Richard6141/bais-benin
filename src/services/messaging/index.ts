import { getServerEnv } from "@/lib/env";
import type { MessagingChannel } from "@/services/ports/messaging-channel";
import { ConsoleMessagingChannel } from "./console/console-channel";
import { FixtureMessagingChannel } from "./fixture/fixture-channel";
import { WapyMessagingChannel } from "./wapy/wapy-channel";

// Une seule instance par processus : le canal fixture doit conserver ses messages
// entre l'envoi et la lecture dans un test.
const globalForMessaging = globalThis as unknown as { messagingChannel?: MessagingChannel };

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
      channel = new FixtureMessagingChannel();
      break;
    default:
      channel = new ConsoleMessagingChannel();
  }
  globalForMessaging.messagingChannel = channel;
  return channel;
}

export function getFixtureMessagingChannel(): FixtureMessagingChannel {
  const channel = getMessagingChannel();
  if (!(channel instanceof FixtureMessagingChannel)) {
    throw new Error("Le canal fixture n'est pas actif (MESSAGING_PRIMARY_CHANNEL=fixture)");
  }
  return channel;
}
