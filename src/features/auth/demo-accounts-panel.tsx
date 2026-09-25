"use client";

import { Button } from "@/components/ui/button";
import type { DemoSignInAccount } from "@/lib/auth/demo-accounts";

interface DemoAccountsPanelProps {
  accounts: readonly DemoSignInAccount[];
  code: string;
  onUse: (account: DemoSignInAccount) => void;
}

// Aide aux essais, jamais affichée en production : NPI et numéros fictifs des comptes de
// démonstration, qui acceptent le code de démonstration au lieu d'un message WhatsApp.
export function DemoAccountsPanel({ accounts, code, onUse }: DemoAccountsPanelProps) {
  return (
    <section aria-labelledby="comptes-demo" className="border-t pt-6">
      <h2 id="comptes-demo" className="text-sm font-semibold">
        Comptes de démonstration
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Environnement d&apos;essai : ces comptes ne reçoivent pas de message WhatsApp. Code de
        connexion : <span className="tabular font-medium text-foreground">{code}</span>.
      </p>
      <table className="mt-3 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Rôle</th>
            <th>NPI</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.key} className="border-b last:border-b-0">
              <td className="py-2 pr-2">{account.roleLabel}</td>
              <td className="tabular py-2 pr-2 text-muted-foreground">{account.npi}</td>
              <td className="py-2 text-right">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onUse(account)}
                  aria-label={`Utiliser le compte ${account.roleLabel}`}
                >
                  Utiliser
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
