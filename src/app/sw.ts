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

function isNeverCached(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/v1/sync") ||
    pathname.startsWith("/api/tiles/farms/")
  );
}

const okOnly = new CacheableResponsePlugin({ statuses: [0, 200] });

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
    matcher: ({ sameOrigin, url }) =>
      sameOrigin &&
      (url.pathname.startsWith("/api/v1/referentiel") ||
        url.pathname.startsWith("/api/v1/registry/farms")),
    handler: new StaleWhileRevalidate({
      cacheName: "bais-registry-data",
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * DAY })],
    }),
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
    // Charges RSC des espaces (navigation côté client) : même stratégie que les documents.
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.headers.get("RSC") === "1" && isSpacePath(url.pathname),
    handler: new NetworkFirst({
      cacheName: "bais-spaces-rsc",
      networkTimeoutSeconds: 8,
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * DAY })],
    }),
  },
  {
    // Documents HTML des espaces agent et agriculteur : réseau d'abord, cache en secours.
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.mode === "navigate" && isSpacePath(url.pathname),
    handler: new NetworkFirst({
      cacheName: "bais-spaces-pages",
      networkTimeoutSeconds: 8,
      plugins: [okOnly, new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * DAY })],
    }),
  },
  {
    // Autres pages du site : réseau d'abord, cache court.
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
