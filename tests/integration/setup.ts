// Les tests d'intégration lisent DATABASE_URL depuis .env (poste de développement)
// ou depuis l'environnement de la CI. Vitest ne charge pas .env pour process.env.
import "dotenv/config";

// Le canal de messagerie fixture conserve les codes envoyés : les tests les relisent
// sans fournisseur externe. Forcé ici, avant que l'application ne lise l'environnement.
process.env.MESSAGING_PRIMARY_CHANNEL = "fixture";
