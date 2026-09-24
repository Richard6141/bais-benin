"use client";

import { createAuthClient } from "better-auth/react";
import { phoneNumberClient, twoFactorClient } from "better-auth/client/plugins";

// Client d'authentification pour les composants React. Les redirections après
// double authentification sont gérées par les formulaires eux-mêmes.
export const authClient = createAuthClient({
  plugins: [phoneNumberClient(), twoFactorClient()],
});

export type AuthClient = typeof authClient;
