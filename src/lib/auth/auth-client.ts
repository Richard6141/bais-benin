"use client";

import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";

// Client d'authentification pour les composants React : connexion par NPI et code reçu sur
// WhatsApp (ADR-0012), le NPI étant transmis au serveur par l'action prepareSignIn.
export const authClient = createAuthClient({
  plugins: [phoneNumberClient()],
});

export type AuthClient = typeof authClient;
