"use client";

import { ArrowLeft } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CountdownText } from "@/components/forms/countdown-text";
import { OtpInput } from "@/components/forms/otp-input";
import { PhoneField } from "@/components/forms/phone-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import type { DemoSignInAccount } from "@/lib/auth/demo-accounts";
import { prepareSignIn } from "./actions";
import { DemoAccountsPanel } from "./demo-accounts-panel";

const RESEND_DELAY_SECONDS = 60;

interface SignInFormProps {
  nextPath?: string;
  /** Comptes fictifs et code de démonstration, affichés hors production pour les essais. */
  demo?: { accounts: readonly DemoSignInAccount[]; code: string } | null;
}

// Connexion unique pour tous les rôles (ADR-0012), en deux écrans : le NPI et le numéro relié,
// puis le code reçu sur WhatsApp. Une première connexion ne crée qu'un compte d'agriculteur
// (ADR-0013) ; les agents et les institutions reçoivent le leur de l'administration.
export function SignInForm({ nextPath, demo }: SignInFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [npi, setNpi] = useState("");
  const [digits, setDigits] = useState("");
  const [phone, setPhone] = useState<{ e164: string; national: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendKey, setResendKey] = useState(0);

  async function sendCode() {
    setError(null);
    setPending(true);
    const prepared = await prepareSignIn({ npi, phoneDigits: digits });
    if (!prepared.ok) {
      setPending(false);
      setError(prepared.message);
      return;
    }
    const result = await authClient.phoneNumber.sendOtp({ phoneNumber: prepared.phone });
    setPending(false);
    if (result.error) {
      setError(messageFor(result.error.code, result.error.message));
      return;
    }
    setPhone({ e164: prepared.phone, national: prepared.national });
    setCanResend(false);
    setResendKey((key) => key + 1);
    setStep(1);
  }

  async function verifyCode(value: string) {
    if (!phone || value.length !== 6) return;
    setError(null);
    setPending(true);
    const result = await authClient.phoneNumber.verify({ phoneNumber: phone.e164, code: value });
    setPending(false);
    if (result.error) {
      setCode("");
      if (result.error.code === "NPI_REQUIRED") setStep(0);
      setError(messageFor(result.error.code, result.error.message));
      return;
    }
    router.replace(
      (nextPath
        ? `/apres-connexion?suite=${encodeURIComponent(nextPath)}`
        : "/apres-connexion") as Route,
    );
  }

  if (step === 1 && phone) {
    return (
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void verifyCode(code);
        }}
      >
        <div className="flex flex-col gap-2">
          <Label className="text-base">Code reçu sur WhatsApp au +229 {phone.national}</Label>
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={(value) => void verifyCode(value)}
            autoFocus
            disabled={pending}
          />
          <p className="text-sm text-muted-foreground">Le code est valable 5 minutes.</p>
        </div>
        {error ? <ErrorNotice message={error} /> : null}
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full text-base"
          disabled={pending || code.length !== 6}
        >
          {pending ? "Vérification en cours" : "Me connecter"}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep(0);
              setCode("");
              setError(null);
            }}
          >
            <ArrowLeft aria-hidden />
            Modifier mes informations
          </Button>
          {canResend ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => void sendCode()}
              disabled={pending}
            >
              Renvoyer le code
            </Button>
          ) : (
            <CountdownText
              key={resendKey}
              seconds={RESEND_DELAY_SECONDS}
              onDone={() => setCanResend(true)}
              render={(remaining) => (
                <span className="tabular text-muted-foreground">
                  Nouveau code possible dans {remaining} s
                </span>
              )}
            />
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void sendCode();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="npi" className="text-base">
            Votre NPI
          </Label>
          <Input
            id="npi"
            inputMode="numeric"
            autoComplete="off"
            placeholder="13 chiffres"
            maxLength={13}
            className="tabular text-base tracking-wide"
            value={npi}
            onChange={(event) => setNpi(event.target.value.replace(/\D/g, "").slice(0, 13))}
            aria-describedby="npi-aide"
            autoFocus
          />
          <p id="npi-aide" className="text-sm text-muted-foreground">
            Numéro personnel d&apos;identification, inscrit sur votre carte d&apos;identité ou votre
            certificat d&apos;identification personnelle (CIP).
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="telephone" className="text-base">
            Numéro de téléphone relié à votre NPI
          </Label>
          <PhoneField
            id="telephone"
            value={digits}
            onChange={setDigits}
            aria-describedby="telephone-aide"
          />
          <p id="telephone-aide" className="text-sm text-muted-foreground">
            Le code de connexion vous est envoyé sur WhatsApp à ce numéro.
          </p>
        </div>
        {error ? <ErrorNotice message={error} /> : null}
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full text-base"
          disabled={pending || npi.length === 0 || digits.length < 10}
        >
          {pending ? "Envoi du code en cours" : "Recevoir mon code sur WhatsApp"}
        </Button>
      </form>
      {demo ? (
        <DemoAccountsPanel
          accounts={demo.accounts}
          code={demo.code}
          onUse={(account) => {
            setNpi(account.npi);
            setDigits(account.phoneDigits);
            setError(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <Alert variant="warning">
      <AlertTitle>Impossible de continuer</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
      </AlertDescription>
    </Alert>
  );
}

// Messages neutres : avant la vérification du code, rien ne dit si un NPI ou un numéro est connu.
function messageFor(code: string | undefined, fallback: string | undefined): string {
  switch (code) {
    case "INVALID_OTP":
    case "OTP_NOT_FOUND":
      return "Ce code n'est pas valable. Vérifiez les six chiffres ou demandez un nouveau code.";
    case "OTP_EXPIRED":
      return "Ce code a expiré. Demandez un nouveau code.";
    case "TOO_MANY_ATTEMPTS":
      return "Trop d'essais. Patientez quelques minutes avant de recommencer.";
    case "INVALID_PHONE_NUMBER":
      return "Ce numéro n'est pas un numéro béninois valide (01 XX XX XX XX).";
    case "NPI_REQUIRED":
      return "Votre saisie a expiré. Saisissez de nouveau votre NPI et votre numéro.";
    case "NPI_MISMATCH":
      return fallback ?? "Ce NPI et ce numéro ne sont pas reliés au même compte.";
    default:
      if (/rate|too many|trop/i.test(fallback ?? "")) {
        return "Trop de demandes. Patientez quelques minutes avant de réessayer.";
      }
      return "Le service est momentanément indisponible. Réessayez dans un instant.";
  }
}
