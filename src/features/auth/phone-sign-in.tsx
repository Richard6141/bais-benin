"use client";

import { ArrowLeft, MessageCircle } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CountdownText } from "@/components/forms/countdown-text";
import { OtpInput } from "@/components/forms/otp-input";
import { PhoneField } from "@/components/forms/phone-field";
import { StepIndicator } from "@/components/forms/step-indicator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { normalizeBeninPhone } from "@/lib/auth/phone";

const STEPS = ["Numéro", "Code reçu"] as const;
const RESEND_DELAY_SECONDS = 60;

interface PhoneSignInProps {
  nextPath?: string;
}

// Connexion par téléphone en deux écrans : le numéro, puis le code reçu sur WhatsApp
// (repli SMS). Un seul champ et un seul bouton par écran ; le numéro est mémorisé pour
// l'étape suivante et le renvoi n'est possible qu'à la demande, après 60 secondes.
export function PhoneSignIn({ nextPath }: PhoneSignInProps) {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendKey, setResendKey] = useState(0);

  const phone = normalizeBeninPhone(digits);

  async function sendCode() {
    if (!phone) {
      setError("Saisissez les dix chiffres de votre numéro, en commençant par 01.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await authClient.phoneNumber.sendOtp({ phoneNumber: phone.e164 });
    setPending(false);
    if (result.error) {
      setError(messageFor(result.error.code, result.error.message));
      return;
    }
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
      setError(messageFor(result.error.code, result.error.message));
      return;
    }
    router.replace(
      (nextPath
        ? `/apres-connexion?suite=${encodeURIComponent(nextPath)}`
        : "/apres-connexion") as Route,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator steps={STEPS} current={step} />

      {step === 0 ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="telephone" className="text-base">
              Votre numéro de téléphone
            </Label>
            <PhoneField
              id="telephone"
              value={digits}
              onChange={setDigits}
              autoFocus
              aria-describedby="telephone-aide"
            />
            <p id="telephone-aide" className="text-sm text-muted-foreground">
              Un code vous sera envoyé sur WhatsApp, ou par SMS si WhatsApp n&apos;est pas
              disponible.
            </p>
          </div>
          {error ? <ErrorNotice message={error} /> : null}
          <Button
            type="submit"
            size="lg"
            className="h-14 w-full text-base"
            disabled={pending || digits.length < 10}
          >
            <MessageCircle aria-hidden />
            {pending ? "Envoi du code…" : "Recevoir mon code"}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyCode(code);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-base">Code reçu au +229 {phone?.national}</Label>
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
            className="h-14 w-full text-base"
            disabled={pending || code.length !== 6}
          >
            {pending ? "Vérification…" : "Me connecter"}
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
              Changer de numéro
            </Button>
            {canResend ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => void sendCode()}
                disabled={pending}
              >
                Je n&apos;ai pas reçu le code
              </Button>
            ) : (
              <CountdownText
                key={resendKey}
                seconds={RESEND_DELAY_SECONDS}
                onDone={() => setCanResend(true)}
                render={(remaining) => (
                  <span className="tabular text-muted-foreground">
                    Renvoi possible dans {remaining} s
                  </span>
                )}
              />
            )}
          </div>
        </form>
      )}
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

// Messages neutres : ils ne révèlent jamais si un numéro est connu de la plateforme.
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
    default:
      if (
        fallback?.toLowerCase().includes("rate") ||
        fallback?.toLowerCase().includes("too many")
      ) {
        return "Trop de demandes. Patientez quelques minutes avant de réessayer.";
      }
      return "Le service est momentanément indisponible. Réessayez dans un instant.";
  }
}
