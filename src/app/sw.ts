import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

// Service worker de BAIS (ADR-0005, docs/modules/registre.md).
//
// Stratégies, dans l'ordre d'évaluation (la première règle qui correspond l'emporte) :
// - jamais de cache pour l'authentification, la synchronisation et les points d'exploitations ;
// - CacheFirst longue durée pour les ressources immuables (/_next/static, polices, /vendor) ;
// - StaleWhileRevalidate pour le référentiel embarqué et la liste des exploitations : l'agent
//   voit tout de suite la dernière copie, rafraîchie en arrière-plan ;
// - NetworkFirst avec repli cache pour les pages de navigation des espaces agent et agriculteur,
//   y compris leurs charges React Server Components, mises en cache à la visite ;
// - une page de repli /hors-ligne quand une page de navigation n'est ni en réseau ni en cache.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60;
const OFFLINE_URL = "/hors-ligne";
const OFFLINE_SPACES = ["/agent", "/agriculteur"];

function isSpacePath(pathname: string): boolean {
  return OFFLINE_SPACES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Espaces authentifiés sans mode hors ligne (même liste que proxy.ts, moins agent et agriculteur).
const ONLINE_ONLY_SPACES = ["/pilotage", "/compte", "/commune", "/cooperative", "/acheteur"];

function isAccountPath(pathname: string): boolean {
  return ONLINE_ONLY_SPACES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isNeverCached(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/v1/sync") ||
    pathname.startsWith("/api/tiles/farms/")
  );
}

// 200 seulement (B2) : le statut 0 couvre aussi les redirections opaques, qu'un cache resservirait
// (vers /connexion ou vers l'espace d'un autre compte). Toutes les règles sont de même origine.
const okOnly = new CacheableResponsePlugin({ statuses: [200] });

const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && isNeverCached(url.pathname),
    handler: new NetworkOnly({ networkTimeoutSeconds: 30 }),
  },
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: "bais-static",
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 365 * DAY })],
    }),
  },
  {
    matcher: ({ sameOrigin, url }) =>
      sameOrigin &&
      (url.pathname.startsWith("/vendor/") ||
        url.pathname.startsWith("/icons/") ||
        /\.(?:woff2?|ttf|otf)$/i.test(url.pathname)),
    handler: new CacheFirst({
      cacheName: "bais-vendor",
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 180 * DAY })],
    }),
  },
  {
    // A3 : NetworkOnly, pas de cache partagé pour des données propres à un compte. Ces routes
    // renvoient des exploitations et des référentiels scoping-dépendants (commune, rôle) ; un
    // cache clé uniquement sur l'URL laisserait un agent B qui reprend le même téléphone après
    // un agent A recevoir les données de A. Le mode hors-ligne reste assuré côté client par
    // Dexie (lib/offline/db.ts), qui a sa propre copie déjà scoping-consciente : aucune perte
    // de fonctionnalité.
    matcher: ({ sameOrigin, url }) =>
      sameOrigin &&
      (url.pathname.startsWith("/api/v1/referentiel") ||
        url.pathname.startsWith("/api/v1/registry/farms")),
    handler: new NetworkOnly({ networkTimeoutSeconds: 30 }),
  },
  {
    // Tuiles des limites administratives : stables, servies depuis le cache dès qu'elles y sont.
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/tiles/"),
    handler: new CacheFirst({
      cacheName: "bais-tiles",
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 30 * DAY })],
    }),
  },
  {
    // Images satellite (ADR-0016) : les mêmes pour tous les comptes, sans donnée personnelle.
    // Gardées sur l'appareil et affichées tout de suite ; la copie est rafraîchie en arrière-plan
    // depuis le cache du serveur (le mois en cours reçoit de nouveaux passages), sans quota.
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/satellite/"),
    handler: new StaleWhileRevalidate({
      cacheName: "bais-satellite",
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 800, maxAgeSeconds: 30 * DAY })],
    }),
  },
  {
    // B2 : charges RSC des espaces authentifiés (navigation côté client). Le repli sur cache
    // n'existe que pour amortir un réseau lent ou une coupure de quelques minutes en plein
    // parcours de terrain — pas pour rester valide des semaines. Une rétention courte réduit
    // la fenêtre pendant laquelle un appareil partagé, jamais explicitement déconnecté
    // (sign-out-button.tsx vide déjà ce cache normalement), pourrait rendre une page
    // authentifiée périmée ; session-identity-guard.tsx détecte et corrige le cas résiduel où
    // la page servie ne correspond plus à la session active.
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.headers.get("RSC") === "1" && isSpacePath(url.pathname),
    handler: new NetworkFirst({
      cacheName: "bais-spaces-rsc",
      networkTimeoutSeconds: 8,
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: DAY })],
    }),
  },
  {
    // Documents HTML des espaces agent et agriculteur : réseau d'abord, cache en secours de
    // courte durée (même raisonnement que la charge RSC ci-dessus).
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.mode === "navigate" && isSpacePath(url.pathname),
    handler: new NetworkFirst({
      cacheName: "bais-spaces-pages",
      networkTimeoutSeconds: 8,
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: DAY })],
    }),
  },
  {
    // Pages authentifiées sans usage hors ligne (ministère, compte, coopérative, acheteur) :
    // jamais en cache. Elles portent des données nominatives (palmarès, signalements, demandes)
    // qu'un appareil partagé ne doit pas resservir au compte suivant ; hors réseau, page de repli.
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.mode === "navigate" && isAccountPath(url.pathname),
    handler: new NetworkOnly({ networkTimeoutSeconds: 30 }),
  },
  {
    // Autres pages du site (publiques) : réseau d'abord, cache court.
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.mode === "navigate" && !url.pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: "bais-pages",
      networkTimeoutSeconds: 8,
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 7 * DAY })],
    }),
  },
  {
    matcher: ({ sameOrigin, url }) =>
      sameOrigin && /\.(?:png|jpe?g|webp|svg|gif|ico)$/i.test(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: "bais-images",
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * DAY })],
    }),
  },
];

// La page de repli est précachée à l'installation : la route /serwist l'inscrit dans le
// manifeste avec la révision du commit courant, pour qu'une nouvelle version l'invalide.
// `fallbacks` ne précache rien lui-même : il sert l'entrée déjà présente dans le précache
// quand une stratégie échoue sur une requête de document.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: OFFLINE_URL,
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
