import { z } from "zod";

// Variables lues côté serveur. L'application refuse de démarrer si une variable
// obligatoire manque : mieux vaut une erreur claire au lancement qu'une panne
// silencieuse au premier appel à la base.

const base64Key = (bytes: number, name: string) =>
  z
    .string()
    .optional()
    .refine((value) => value === undefined || Buffer.from(value, "base64").length === bytes, {
      message: `${name} doit être une clé de ${bytes} octets encodée en base64`,
    });

// Variable présente mais vide dans .env (« NOM= ») : traitée comme absente.
const optionalText = (schema: z.ZodType<string>) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Next.js positionne NEXT_PHASE=phase-production-build pendant `next build`, avant que
    // les variables de déploiement ne soient forcément disponibles (cf. next.config.ts,
    // qui importe ce module). On ne doit pas faire échouer le build pour ça (A1).
    NEXT_PHASE: z.string().optional(),
    // NODE_ENV vaut "production" dès `next build` ou `next start`, y compris pour une
    // démonstration locale. APP_ENV distingue le déploiement réel (production) des
    // environnements de démonstration et de recette, où les comptes de démo sont admis.
    // Défaut fail-closed (A1) : une variable oubliée en déploiement doit se comporter
    // comme de la production (comptes de démo bloqués, secrets obligatoires), jamais
    // l'inverse. En local, .env.example fixe APP_ENV=development explicitement.
    APP_ENV: z.enum(["development", "test", "demo", "staging", "production"]).default("production"),
    APP_URL: z.url().default("http://localhost:3000"),
    // Vide au moment du build (image Docker sans base) : la connexion est vérifiée au premier usage.
    DATABASE_URL: z
      .string()
      .default("")
      .refine(
        (value) =>
          value === "" || value.startsWith("postgres://") || value.startsWith("postgresql://"),
        { message: "DATABASE_URL doit être une URL PostgreSQL" },
      ),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

    // Authentification
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire au moins 32 caractères").optional(),
    OTP_DEMO_CODE: z
      .string()
      .regex(/^\d{6}$/, "OTP_DEMO_CODE doit être un code à 6 chiffres")
      .optional(),
    // Liste des comptes de démonstration sous le formulaire de connexion : affichée par défaut
    // hors production. « 0 » la masque (serveur de démonstration ouvert au public, accès remis en
    // privé) sans rien changer d'autre : le code de démonstration reste valable pour ces numéros.
    DEMO_SIGNIN_PANEL: z.enum(["0", "1"]).optional(),
    // B4 : adresses IP ou plages CIDR du ou des relais inverses de confiance placés devant
    // l'application (nginx du docker-compose fourni, load balancer managé…), séparées par des
    // virgules. Sans ceci, better-auth ignore X-Forwarded-For par défaut — un client pourrait
    // sinon usurper son adresse en la falsifiant lui-même dans cet en-tête, faussant la limite
    // de débit et le journal d'audit. Vide en développement (accès direct sans relais).
    TRUSTED_PROXIES: z.string().optional(),

    // Messagerie
    MESSAGING_PRIMARY_CHANNEL: z.enum(["console", "wapy", "fixture"]).default("console"),
    WAPY_API_URL: z.url().default("https://wapy.pro"),
    WAPY_API_KEY: z.string().optional(),
    WAPY_WEBHOOK_SECRET: z.string().optional(),

    // Monitoring : fournisseur météo (Open-Meteo par défaut, fixture hors réseau) et secret
    // du déclenchement planifié de l'ingestion.
    WEATHER_PROVIDER: z.enum(["open-meteo", "fixture"]).default("open-meteo"),
    OPEN_METEO_BASE_URL: z.url().default("https://api.open-meteo.com"),
    CRON_SECRET: z.string().min(32, "CRON_SECRET doit faire au moins 32 caractères").optional(),

    // Feux actifs (ADR-0022) : fichiers publics de NASA FIRMS, sans clé (vérifié le 26/09/2026) ;
    // fixture pour les tests et la démonstration hors réseau.
    FIRE_PROVIDER: z.enum(["firms", "fixture"]).default("firms"),
    FIRMS_BASE_URL: z.url().default("https://firms.modaps.eosdis.nasa.gov"),

    // Vue du ciel (ADR-0016) : Copernicus Data Space Ecosystem, sans intermédiaire commercial.
    // Le catalogue STAC est public ; les images et statistiques NDVI demandent un client OAuth
    // du compte CDSE gratuit (tableau de bord CDSE, « User Settings », « OAuth clients »).
    // Sans ces deux variables, la carte propose les périodes mais pas les images.
    SATELLITE_PROVIDER: z.enum(["cdse", "fixture"]).default("cdse"),
    CDSE_CLIENT_ID: optionalText(z.string().trim().min(1)),
    CDSE_CLIENT_SECRET: optionalText(z.string().trim().min(1)),
    CDSE_STAC_URL: z.url().default("https://stac.dataspace.copernicus.eu/v1"),
    CDSE_PROCESSING_URL: z.url().default("https://sh.dataspace.copernicus.eu"),
    CDSE_TOKEN_URL: z
      .url()
      .default(
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
      ),
    // Plafond mensuel de requêtes de traitement envoyées à CDSE (quota gratuit : 10 000 par
    // mois) : au-delà, BAIS ne sert que son cache jusqu'au mois suivant.
    SATELLITE_MONTHLY_REQUEST_BUDGET: z.coerce.number().int().min(0).max(10000).default(9000),
    // Parts étanches de ce plafond (revue R2) : propositions de contours de champs, statistiques
    // de la confrontation déclaration / satellite ; les images de la carte ont le reste.
    SATELLITE_PROPOSAL_SHARE: z.coerce.number().min(0).max(0.9).default(0.3),
    SATELLITE_STATISTICS_SHARE: z.coerce.number().min(0).max(0.9).default(0.5),
    // Unités de traitement par mois (quota gratuit : 10 000) et requêtes par minute, tous usages
    // confondus (plafond Copernicus : 300).
    SATELLITE_MONTHLY_UNIT_BUDGET: z.coerce.number().min(0).max(10000).default(9000),
    SATELLITE_REQUESTS_PER_MINUTE: z.coerce.number().int().min(0).max(300).default(250),
    // Radar Sentinel-1 (ADR-0019) : quand les nuages empêchent Sentinel-2 de conclure, la
    // confrontation demande l'indice radar. Désactivé tant que le coût en unités de traitement
    // n'a pas été mesuré (POST /api/v1/satellite/radar-calibration).
    SATELLITE_RADAR_FALLBACK: z.enum(["0", "1"]).default("0"),
    // Riz par radar Sentinel-1 dans les surfaces par commune (ADR-0026) : environ 2 unités de
    // plus par commune. Désactivé tant qu'une mesure réelle n'a pas validé la règle.
    SATELLITE_RADAR_RICE: z.enum(["0", "1"]).default("0"),
    // Classe de la carte aux points d'enquête (ADR-0033) : environ 0,16 unité par point, 100 PU
    // pour 600 points. Désactivé tant que le chef d'équipe n'a pas validé une passe réelle ; les
    // points sont tirés quand même, et la fixture reste lue sans compte Copernicus.
    SURVEY_MAP_READS: z.enum(["0", "1"]).default("0"),
    // Communes pilotes des cultures par parcelle (ADR-0030) : seules leurs parcelles sont lues
    // par satellite, en attendant l'échantillon aréolaire. Codes séparés par des virgules.
    // Plafond mensuel des lectures de séries de parcelles, en unités de traitement (ADR-0031) :
    // la tâche s'arrête net quand la dépense du mois l'atteint.
    CROP_MODEL_MONTHLY_UNIT_CAP: z.coerce.number().min(0).max(9000).default(600),
    CROP_MODEL_PILOT_COMMUNES: z
      .string()
      .default("BJ-BOR-008,BJ-ATA-008,BJ-DON-001,BJ-COL-004,BJ-ALI-006")
      .transform((value) =>
        value
          .split(",")
          .map((code) => code.trim())
          .filter(Boolean),
      ),
    // Tuiles détaillées absentes du cache qu'un même compte peut faire calculer par mois.
    SATELLITE_TILE_MISSES_PER_ACCOUNT: z.coerce.number().int().min(0).default(400),

    // NPI : chiffrement AES-256-GCM et index HMAC, deux clés distinctes de 32 octets.
    NPI_ENCRYPTION_KEY: base64Key(32, "NPI_ENCRYPTION_KEY"),
    NPI_HASH_KEY: base64Key(32, "NPI_HASH_KEY"),
    NPI_LENGTH: z.coerce.number().int().min(10).max(13).default(13),
    IDENTITY_VERIFICATION_PROVIDER: z.enum(["anip-local", "anip-xroad"]).default("anip-local"),

    // C4 : clé du HMAC qui remplace le hachage simple de l'adresse IP dans le journal d'audit
    // (modules/audit/service.ts) — une IPv4 tient sur 32 bits, un sha256 non salé se retourne
    // par table arc-en-ciel ; un HMAC à clé secrète ne peut pas se précalculer sans elle.
    AUDIT_IP_HASH_KEY: base64Key(32, "AUDIT_IP_HASH_KEY"),

    // Assistant agricole : aucun fournisseur par défaut. Sans ASSISTANT_LLM_MODEL, l'assistant
    // fonctionne avec l'adaptateur de démonstration (extractif, sans réseau). Les identifiants
    // de modèle sont transmis tels quels au SDK ; avec ASSISTANT_LLM_BASE_URL, le point d'accès
    // compatible OpenAI indiqué est interrogé.
    ASSISTANT_LLM_MODEL: optionalText(z.string().trim().min(1)),
    ASSISTANT_EMBEDDING_MODEL: optionalText(z.string().trim().min(1)),
    // https obligatoire, sauf point d'accès local (poste de développement, conteneur voisin).
    ASSISTANT_LLM_BASE_URL: optionalText(
      z.url().refine(
        (value) => {
          const url = new URL(value);
          return (
            url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
          );
        },
        { message: "ASSISTANT_LLM_BASE_URL doit être en https (sauf localhost)" },
      ),
    ),
    ASSISTANT_LLM_API_KEY: optionalText(z.string()),
    // Dimension de la colonne assistant_chunk.embedding (migration assistant) : 1024.
    ASSISTANT_EMBEDDING_DIMENSIONS: z.coerce
      .number()
      .int()
      .refine((value) => value === 1024, {
        message: "ASSISTANT_EMBEDDING_DIMENSIONS doit valoir 1024, dimension de la colonne en base",
      })
      .default(1024),
    ASSISTANT_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
    ASSISTANT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
    // Plafond global de questions par jour (heure de Porto-Novo) : borne le coût d'un modèle payant.
    ASSISTANT_DAILY_LIMIT: z.coerce.number().int().min(1).default(2000),
  })
  .superRefine((env, ctx) => {
    // Parts étanches du quota Copernicus : les images de la carte ont ce qui reste.
    if (env.SATELLITE_PROPOSAL_SHARE + env.SATELLITE_STATISTICS_SHARE > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["SATELLITE_STATISTICS_SHARE"],
        message: "SATELLITE_PROPOSAL_SHARE et SATELLITE_STATISTICS_SHARE dépassent ensemble 1",
      });
    }
    // A1 : pendant la phase de build Next.js (NEXT_PHASE=phase-production-build), aucune
    // requête n'est encore servie et les secrets de déploiement peuvent ne pas être présents
    // dans l'environnement de build (image Docker construite avant injection des variables
    // d'exécution, par exemple) : on n'exige rien de production ici, seulement au démarrage
    // réel du serveur (nouveau process, donc nouvel appel à parseServerEnv).
    const isBuildPhase = env.NEXT_PHASE === "phase-production-build";
    if (isBuildPhase) return;

    // AUTH_SECRET est obligatoire dès que NODE_ENV=production (déploiement réel ou
    // démonstration lancée avec `next start`), pas seulement quand APP_ENV=production.
    if (env.NODE_ENV === "production" && !env.AUTH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "obligatoire dès que NODE_ENV=production",
      });
    }
    if (env.APP_ENV === "production") {
      if (!env.CRON_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["CRON_SECRET"],
          message: "obligatoire en production (déclenchement de l'ingestion météo)",
        });
      }
      if (!env.AUDIT_IP_HASH_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["AUDIT_IP_HASH_KEY"],
          message: "obligatoire en production (HMAC du journal d'audit)",
        });
      }
      if (env.OTP_DEMO_CODE) {
        ctx.addIssue({
          code: "custom",
          path: ["OTP_DEMO_CODE"],
          message: "le code de démonstration est interdit en production",
        });
      }
      // B5 : le canal "console" journalise le code en clair (services/messaging/console/
      // console-channel.ts) et "fixture" ne fait qu'accumuler les messages en mémoire pour les
      // tests — ni l'un ni l'autre n'envoie quoi que ce soit à un vrai téléphone. En
      // production, seul "wapy" (avec sa clé) est un canal d'envoi réel.
      if (env.MESSAGING_PRIMARY_CHANNEL !== "wapy") {
        ctx.addIssue({
          code: "custom",
          path: ["MESSAGING_PRIMARY_CHANNEL"],
          message: 'seul "wapy" est autorisé en production (jamais console ni fixture)',
        });
      } else if (!env.WAPY_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["WAPY_API_KEY"],
          message: "obligatoire en production quand MESSAGING_PRIMARY_CHANNEL=wapy",
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

export type EnvSource = Record<string, string | undefined>;

export function parseServerEnv(source: EnvSource): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`)
      .join("\n");
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return result.data;
}

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}
