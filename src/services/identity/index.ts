import { getServerEnv } from "@/lib/env";
import type { IdentityVerificationProvider } from "@/services/ports/identity-verification-provider";
import { AnipLocalProvider } from "./anip-local/anip-local-provider";
import { AnipXRoadProvider } from "./anip-xroad/anip-xroad-provider";

let cached: IdentityVerificationProvider | undefined;

export function getIdentityVerificationProvider(): IdentityVerificationProvider {
  if (cached) return cached;
  const env = getServerEnv();
  cached =
    env.IDENTITY_VERIFICATION_PROVIDER === "anip-xroad"
      ? new AnipXRoadProvider(
          {
            securityServerUrl: process.env.ANIP_XROAD_SECURITY_SERVER_URL ?? "",
            clientIdentifier: process.env.ANIP_XROAD_CLIENT_ID ?? "",
            serviceIdentifier: process.env.ANIP_XROAD_SERVICE_ID ?? "",
          },
          env.NPI_LENGTH,
        )
      : new AnipLocalProvider(env.NPI_LENGTH);
  return cached;
}
