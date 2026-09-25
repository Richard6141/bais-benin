import { redirect } from "next/navigation";

// L'ancienne activation de la double authentification par application (TOTP) n'a plus lieu
// d'être : chaque connexion exige le NPI et un code envoyé sur WhatsApp (ADR-0012).
export default function SecurityPage() {
  redirect("/compte");
}
