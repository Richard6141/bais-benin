"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CROP_STAGE_LABELS } from "@/features/registry/agent/labels";
import { getAgentDatabase } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/use-sync";
import { DAMAGE_CROP_STAGES } from "@/modules/sync/commands";
import { buildDamageReview, type DamageDecision } from "./damage-command";

const SELECT_CLASS = "h-11 rounded-md border bg-background px-3 text-base";

// Visite d'un sinistre (ADR-0038 §2) : l'agent confirme la surface brûlée qu'il constate, la
// culture et son stade, ou écarte le sinistre avec sa raison. Tout part dans l'outbox et suit la
// prochaine synchronisation, même sans réseau au champ.
export function DamageReviewForm({
  userId,
  declarationId,
  estimate,
  crops,
}: {
  userId: string;
  declarationId: string;
  /** Fourchette satellite, pour pré-remplir la surface avec le bas de la fourchette. */
  estimate: { lowHa: number; highHa: number };
  crops: readonly { code: string; nameFr: string }[];
}) {
  const sync = useSync(userId);
  const [decision, setDecision] = useState<DamageDecision | null>(null);
  const [area, setArea] = useState(estimate.lowHa.toFixed(2).replace(".", ","));
  const [cropCode, setCropCode] = useState("");
  const [cropStage, setCropStage] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    const built = buildDamageReview({
      declarationId,
      decision,
      observedAreaHa: area,
      cropCode,
      cropStage,
      note,
      reason,
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    await built.enqueue(getAgentDatabase(userId));
    setSaved(true);
    if (sync.online) void sync.sync();
  }

  if (saved) {
    return (
      <Alert variant="success" role="status">
        <CheckCircle2 aria-hidden />
        <AlertTitle>Visite enregistrée</AlertTitle>
        <AlertDescription>
          <p>
            {sync.online
              ? "Elle part au serveur maintenant."
              : "Elle partira à la prochaine synchronisation."}
          </p>
          <Link href="/agent/sinistres" className="font-semibold underline">
            Revenir aux sinistres
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>Constat sur place</CardTitle>
          <HelpTip label="Constat d'un sinistre">
            Le satellite estime la surface brûlée ; vous seul pouvez dire ce qui a brûlé. Un brûlis
            volontaire du producteur, ou un feu sans dégât sur la culture, s&apos;écarte. La
            déclaration confirmée sert de pièce pour l&apos;assistance et les assureurs.
          </HelpTip>
        </div>
        <CardDescription>
          Estimation satellite : {estimate.lowHa.toFixed(2).replace(".", ",")} à{" "}
          {estimate.highHa.toFixed(2).replace(".", ",")} ha.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Décision">
          <Button
            type="button"
            variant={decision === "CONFIRMED" ? "default" : "outline"}
            aria-pressed={decision === "CONFIRMED"}
            className="h-11"
            onClick={() => setDecision("CONFIRMED")}
          >
            Confirmer le sinistre
          </Button>
          <Button
            type="button"
            variant={decision === "REJECTED" ? "default" : "outline"}
            aria-pressed={decision === "REJECTED"}
            className="h-11"
            onClick={() => setDecision("REJECTED")}
          >
            Écarter
          </Button>
        </div>

        {decision === "CONFIRMED" ? (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="surface">Surface brûlée constatée (ha)</Label>
              <Input
                id="surface"
                inputMode="decimal"
                value={area}
                onChange={(event) => setArea(event.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="culture">Culture touchée</Label>
              <select
                id="culture"
                value={cropCode}
                onChange={(event) => setCropCode(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Aucune ou inconnue</option>
                {crops.map((crop) => (
                  <option key={crop.code} value={crop.code}>
                    {crop.nameFr}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="stade">Stade de la culture</Label>
              <select
                id="stade"
                value={cropStage}
                onChange={(event) => setCropStage(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Non précisé</option>
                {DAMAGE_CROP_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {CROP_STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        {decision === "REJECTED" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="raison">Raison</Label>
            <Textarea
              id="raison"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Brûlis volontaire, pas de dégât"
            />
          </div>
        ) : null}

        {decision ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="note">Note (facultatif)</Label>
            <Textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="button" className="h-11 self-start" onClick={submit} disabled={!decision}>
          Enregistrer la visite
        </Button>
      </CardContent>
    </Card>
  );
}
