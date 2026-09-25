"use client";

import { Square, Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const hasSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window;

// « Écouter » : synthèse vocale du navigateur, voix française du système (phase 1). Absent
// quand le navigateur ne sait pas lire à voix haute ; la lecture s'arrête au démontage.
export function ListenButton({ text, className }: { text: string; className?: string }) {
  const supported = useSyncExternalStore(subscribe, hasSpeech, () => false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (hasSpeech()) window.speechSynthesis.cancel();
    };
  }, []);

  if (!supported || !text) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("fr"));
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className ?? "h-11"}
      onClick={toggle}
      aria-pressed={speaking}
    >
      {speaking ? <Square aria-hidden /> : <Volume2 aria-hidden />}
      {speaking ? "Arrêter la lecture" : "Écouter"}
    </Button>
  );
}
