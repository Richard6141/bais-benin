"use client";

import { useEffect, useState } from "react";

interface CountdownTextProps {
  seconds: number;
  onDone?: () => void;
  render: (remaining: number) => React.ReactNode;
}

// Compte à rebours affiché à côté d'une action différée (« Renvoyer le code dans 45 s »).
// Le reste est dérivé d'une échéance fixée au montage : remonter le composant avec une
// nouvelle clé suffit à relancer le décompte.
export function CountdownText({ seconds, onDone, render }: CountdownTextProps) {
  const [deadline] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));

  useEffect(() => {
    if (remaining <= 0) {
      onDone?.();
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onDone]);

  return <>{render(remaining)}</>;
}
