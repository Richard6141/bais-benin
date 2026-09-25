import { redirect } from "next/navigation";

// Ancienne connexion institutionnelle (e-mail et mot de passe) : remplacée par la connexion
// unique par NPI et code WhatsApp (ADR-0012). Les liens existants mènent à celle-ci.
export default function InstitutionSignInPage() {
  redirect("/connexion");
}
