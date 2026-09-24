"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";

interface InstitutionSignInProps {
  nextPath?: string;
}

// Connexion des comptes institutionnels (ministère, communes, coopératives, acheteurs) :
// e-mail et mot de passe, puis code de l'application d'authentification quand la
// double authentification est active (redirection gérée par le client d'auth).
export function InstitutionSignIn({ nextPath }: InstitutionSignInProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setPending(true);
    const result = await authClient.signIn.email({ email, password, rememberMe: false });
    setPending(false);
    if (result.error) {
      // Message identique quel que soit le champ en cause : pas d'énumération de comptes.
      setError("Identifiants incorrects ou compte inactif.");
      return;
    }
    if ("twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
      router.replace(
        (nextPath
          ? `/connexion/institution/verification?suite=${encodeURIComponent(nextPath)}`
          : "/connexion/institution/verification") as Route,
      );
      return;
    }
    router.replace(
      (nextPath
        ? `/apres-connexion?suite=${encodeURIComponent(nextPath)}`
        : "/apres-connexion") as Route,
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Adresse e-mail professionnelle</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? (
        <Alert variant="warning">
          <AlertTitle>Connexion refusée</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="h-12 w-full"
        disabled={pending || !email || !password}
      >
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
