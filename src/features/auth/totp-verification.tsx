"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OtpInput } from "@/components/forms/otp-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";

interface TotpVerificationProps {
  nextPath?: string;
}

// Deuxième facteur des comptes institutionnels : code à six chiffres de l'application
// d'authentification, ou code de secours à usage unique.
export function TotpVerification({ nextPath }: TotpVerificationProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const destination = nextPath
    ? `/apres-connexion?suite=${encodeURIComponent(nextPath)}`
    : "/apres-connexion";

  async function verify(value: string) {
    setError(null);
    setPending(true);
    const result = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code: value, trustDevice });
    setPending(false);
    if (result.error) {
      setCode("");
      setError("Code refusé. Vérifiez l'heure de votre téléphone et réessayez.");
      return;
    }
    router.replace(destination as Route);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void verify(useBackup ? backupCode : code);
      }}
    >
      {useBackup ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="secours">Code de secours</Label>
          <input
            id="secours"
            className="tabular h-11 rounded-md border border-input bg-background px-3 font-mono text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            autoComplete="one-time-code"
            value={backupCode}
            onChange={(event) => setBackupCode(event.target.value.trim())}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Code de votre application d&apos;authentification</Label>
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={(value) => void verify(value)}
            autoFocus
            disabled={pending}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Checkbox
          id="confiance"
          checked={trustDevice}
          onCheckedChange={(value) => setTrustDevice(value === true)}
        />
        <Label htmlFor="confiance" className="font-normal">
          Faire confiance à cet appareil pendant 30 jours
        </Label>
      </div>
      {error ? (
        <Alert variant="warning">
          <AlertTitle>Vérification impossible</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="h-12 w-full"
        disabled={pending || (useBackup ? backupCode.length < 8 : code.length !== 6)}
      >
        {pending ? "Vérification…" : "Valider"}
      </Button>
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={() => setUseBackup((value) => !value)}
      >
        {useBackup ? "Utiliser l'application d'authentification" : "Utiliser un code de secours"}
      </Button>
    </form>
  );
}
