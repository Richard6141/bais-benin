"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SimulationSummary } from "@/modules/monitoring/rule-admin/simulate";
import {
  applyThresholds,
  validateBounds,
  type ThresholdField,
} from "@/modules/monitoring/rule-admin/thresholds";
import type { RuleNode } from "@/modules/monitoring/rules";
import { createRuleVersionAction, simulateRuleAction } from "./actions";
import { MessagePreview } from "./message-preview";
import { SimulationResult } from "./simulation-result";

const OPERATOR_TEXT: Record<string, string> = {
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  "==": "=",
};

export interface EditableRule {
  code: string;
  version: number;
  definition: RuleNode;
  thresholds: ThresholdField[];
  messageShort: string;
  adviceFr: string;
  cooldownHours: number;
}

interface RuleDefinitionEditorProps {
  rule: EditableRule;
  /** Commune au nom le plus long, pour l'aperçu du message court. */
  previewCommune: string;
  /** Période de simulation par défaut : les 30 derniers jours (AAAA-MM-JJ). */
  simulationFrom: string;
  simulationTo: string;
}

// Éditeur des seuils généré depuis l'arbre de conditions (§2.C5) : un champ par condition
// numérique, bornes physiques vérifiées à la saisie, aperçu du message court, simulation du
// brouillon sur 30 jours avant d'enregistrer une nouvelle version.
//
// La version de référence est figée à l'ouverture de l'édition (`base`) : le brouillon est
// comparé à elle et elle est envoyée au serveur (`baseVersion`). Sans cela, un rafraîchissement
// de la page pendant la saisie (nouvelle version enregistrée ailleurs, revalidation après une
// action) remplaçait la référence par une version qui avait déjà la valeur saisie : le brouillon
// paraissait inchangé et l'enregistrement répondait « Aucune modification à enregistrer ».
export function RuleDefinitionEditor({
  rule,
  previewCommune,
  simulationFrom,
  simulationTo,
}: RuleDefinitionEditorProps) {
  const [base, setBase] = useState<EditableRule>(rule);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rule.thresholds.map((f) => [f.path, String(f.value)])),
  );
  const [messageShort, setMessageShort] = useState(rule.messageShort);
  const [adviceFr, setAdviceFr] = useState(rule.adviceFr);
  const [cooldownHours, setCooldownHours] = useState(String(rule.cooldownHours));
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "critical";
    text: string;
    issues?: string[];
  } | null>(null);
  const [simulation, setSimulation] = useState<SimulationSummary | null>(null);
  const [pending, startTransition] = useTransition();

  const changedThresholds = useMemo(() => {
    const out: Record<string, number> = {};
    for (const field of base.thresholds) {
      const next = Number((values[field.path] ?? "").replace(",", "."));
      if (Number.isFinite(next) && next !== field.value) out[field.path] = next;
    }
    return out;
  }, [values, base.thresholds]);

  const draft = useMemo(() => {
    try {
      return applyThresholds(base.definition, changedThresholds);
    } catch {
      return base.definition;
    }
  }, [base.definition, changedThresholds]);
  const boundIssues = useMemo(
    () => new Map(validateBounds(draft).map((i) => [i.path, i.message])),
    [draft],
  );
  const invalidNumber = base.thresholds.some(
    (f) => !Number.isFinite(Number((values[f.path] ?? "").replace(",", "."))),
  );

  function save() {
    setFeedback(null);
    const saved = {
      thresholds: changedThresholds,
      messageShort: messageShort !== base.messageShort ? messageShort : undefined,
      adviceFr: adviceFr !== base.adviceFr ? adviceFr : undefined,
      cooldownHours:
        Number(cooldownHours) !== base.cooldownHours ? Number(cooldownHours) : undefined,
    };
    startTransition(async () => {
      const result = await createRuleVersionAction(base.code, {
        ...saved,
        reason: reason.trim() || undefined,
        baseVersion: base.version,
      });
      if (result.ok) {
        // La version enregistrée devient la nouvelle référence de l'édition.
        const definition = applyThresholds(base.definition, saved.thresholds);
        setBase({
          ...base,
          version: result.data.version,
          definition,
          thresholds: base.thresholds.map((f) => ({
            ...f,
            value: saved.thresholds[f.path] ?? f.value,
          })),
          messageShort: saved.messageShort ?? base.messageShort,
          adviceFr: saved.adviceFr ?? base.adviceFr,
          cooldownHours: saved.cooldownHours ?? base.cooldownHours,
        });
      }
      setFeedback(
        result.ok
          ? { tone: "success", text: `Version ${result.data.version} enregistrée et activée.` }
          : {
              tone: "critical",
              text: result.message,
              issues: result.issues?.map((i) => i.message),
            },
      );
    });
  }

  function simulate() {
    setFeedback(null);
    startTransition(async () => {
      const hasDraft = Object.keys(changedThresholds).length > 0;
      const result = await simulateRuleAction({
        code: base.code,
        draftDefinition: hasDraft ? draft : undefined,
        from: simulationFrom,
        to: simulationTo,
      });
      if (result.ok) setSimulation(result.data);
      else
        setFeedback({
          tone: "critical",
          text: result.message,
          issues: result.issues?.map((i) => i.message),
        });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">Seuils</legend>
        {base.thresholds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cette règle ne comporte aucun seuil numérique.
          </p>
        ) : (
          base.thresholds.map((field) => {
            const issue = boundIssues.get(field.path);
            return (
              <div
                key={field.path}
                className="grid gap-2 sm:grid-cols-[1fr_auto_10rem] sm:items-center"
              >
                <Label htmlFor={`seuil-${field.path}`}>{field.label}</Label>
                <span className="text-sm text-muted-foreground">
                  {OPERATOR_TEXT[field.op] ?? field.op}
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    id={`seuil-${field.path}`}
                    inputMode="decimal"
                    className="tabular"
                    value={values[field.path] ?? ""}
                    aria-invalid={issue ? true : undefined}
                    onChange={(event) =>
                      setValues((v) => ({ ...v, [field.path]: event.target.value }))
                    }
                  />
                  {field.unit ? (
                    <span className="text-sm text-muted-foreground">{field.unit}</span>
                  ) : null}
                </div>
                {issue ? <p className="text-sm text-destructive sm:col-span-3">{issue}</p> : null}
              </div>
            );
          })
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem] sm:items-center">
          <Label htmlFor="refroidissement">Délai avant une nouvelle alerte (heures)</Label>
          <Input
            id="refroidissement"
            inputMode="numeric"
            className="tabular"
            value={cooldownHours}
            onChange={(e) => setCooldownHours(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold">Messages</legend>
        <Label htmlFor="message-court">Message court (SMS et WhatsApp)</Label>
        <Textarea
          id="message-court"
          rows={3}
          value={messageShort}
          onChange={(e) => setMessageShort(e.target.value)}
        />
        <MessagePreview template={messageShort} commune={previewCommune} />
        <Label htmlFor="conseil">Conseil pratique</Label>
        <Textarea
          id="conseil"
          rows={3}
          value={adviceFr}
          onChange={(e) => setAdviceFr(e.target.value)}
        />
        <Label htmlFor="motif-version">Motif de la modification</Label>
        <Input
          id="motif-version"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </fieldset>

      {rule.version > base.version ? (
        <Alert variant="watch">
          <AlertTitle>Version plus récente disponible</AlertTitle>
          <AlertDescription>
            <p>
              La version {rule.version} a été enregistrée pendant votre saisie. Rechargez la page
              pour repartir de cette version : vos modifications seraient sinon refusées.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {feedback ? (
        <Alert variant={feedback.tone}>
          <AlertTitle>
            {feedback.tone === "success" ? "Enregistré" : "Impossible d'enregistrer"}
          </AlertTitle>
          <AlertDescription>
            <p>{feedback.text}</p>
            {feedback.issues?.length ? (
              <ul className="list-disc pl-5">
                {feedback.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="outline"
          disabled={pending || boundIssues.size > 0 || invalidNumber}
          onClick={simulate}
        >
          {pending ? "Calcul en cours" : "Simuler sur 30 jours"}
        </Button>
        <Button disabled={pending || boundIssues.size > 0 || invalidNumber} onClick={save}>
          Enregistrer la version {base.version + 1}
        </Button>
      </div>

      {simulation ? <SimulationResult summary={simulation} /> : null}
    </div>
  );
}
