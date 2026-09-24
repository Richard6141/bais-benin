// Les tests d'intégration lisent DATABASE_URL depuis .env (poste de développement)
// ou depuis l'environnement de la CI. Vitest ne charge pas .env pour process.env.
import "dotenv/config";
