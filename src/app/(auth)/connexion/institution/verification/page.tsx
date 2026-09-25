import { redirect } from "next/navigation";

// Ancien défi de double authentification par application (TOTP) : retiré avec la connexion par
// NPI et code WhatsApp (ADR-0012), qui prouve la possession du téléphone à chaque connexion.
export default function TwoFactorPage() {
  redirect("/connexion");
}
