"use client";

import { useState } from "react";
import { OtpInput } from "@/components/forms/otp-input";
import { StepIndicator } from "@/components/forms/step-indicator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";

const STEPS = ["Mot de passe", "Application", "Codes de secours"] as const;

interface TwoFactorSetupProps {
  mandatory: boolean;
  qrSvgFor: (uri: string) => Promise<string>;
}

// Activation de la double authentification en trois écrans : confirmation du mot de passe,
// QR code à scanner puis code de contrôle, codes de secours à conserver.
export function TwoFactorSetup({ mandatory, qrSvgFor }: TwoFactorSetupProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function enable() {
    setError(null);
    setPending(true);
    const result = await authClient.twoFactor.enable({ password, issuer: "BAIS" });
    setPending(false);
    if (result.error || !("totpURI" in result.data)) {
      setError("Mot de passe refusé.");
      return;
    }
    setTotpUri(result.data.totpURI);
    setBackupCodes(result.data.backupCodes);
    setQrSvg(await qrSvgFor(result.data.totpURI));
    setStep(1);
  }

  async function confirm(value: string) {
    setError(null);
    setPending(true);
    const result = await authClient.twoFactor.verifyTotp({ code: value });
    setPending(false);
    if (result.error) {
      setCode("");
      setError("Code refusé. Vérifiez que l'heure du téléphone est juste et réessayez.");
      return;
    }
    setStep(2);
  }

  const secret = totpUri ? new URL(totpUri).searchParams.get("secret") : null;

  return (
    <div className="flex flex-col gap-6">
      {mandatory ? (
        <Alert variant="info">
          <AlertTitle>Étape obligatoire pour votre rôle</AlertTitle>
          <AlertDescription>
            <p>
              L&apos;accès au centre de pilotage exige la double authentification. Trois écrans,
              deux minutes.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      <StepIndicator steps={STEPS} current={step} />

      {step === 0 ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void enable();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="mdp">Confirmez votre mot de passe</Label>
            <Input
              id="mdp"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error ? <Notice message={error} /> : null}
          <Button type="submit" disabled={pending || !password} className="sm:self-start">
            {pending ? "Préparation…" : "Continuer"}
          </Button>
        </form>
      ) : null}

      {step === 1 ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm(code);
          }}
        >
          <p className="text-sm text-muted-foreground">
            Scannez ce code avec Google Authenticator, Microsoft Authenticator, Aegis ou toute
            application compatible, puis saisissez le code affiché.
          </p>
          {qrSvg ? (
            <div
              className="w-fit rounded-lg border bg-white p-3"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label="QR code à scanner"
              role="img"
            />
          ) : null}
          {secret ? (
            <p className="text-xs text-muted-foreground">
              Saisie manuelle : <code className="tabular font-mono select-all">{secret}</code>
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label>Code affiché par l&apos;application</Label>
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={(value) => void confirm(value)}
              disabled={pending}
            />
          </div>
          {error ? <Notice message={error} /> : null}
          <Button type="submit" disabled={pending || code.length !== 6} className="sm:self-start">
            {pending ? "Vérification…" : "Activer"}
          </Button>
        </form>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-4">
          <Alert variant="success">
            <AlertTitle>Double authentification activée</AlertTitle>
            <AlertDescription>
              <p>
                Conservez ces codes de secours en lieu sûr : chacun ne sert qu&apos;une fois, si
                vous perdez votre téléphone.
              </p>
            </AlertDescription>
          </Alert>
          <ul className="tabular grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm sm:grid-cols-5">
            {backupCodes.map((backup) => (
              <li key={backup} className="select-all">
                {backup}
              </li>
            ))}
          </ul>
          <Button asChild className="sm:self-start">
            <a href="/apres-connexion">Accéder à mon espace</a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <Alert variant="warning">
      <AlertTitle>Impossible de continuer</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
      </AlertDescription>
    </Alert>
  );
}
