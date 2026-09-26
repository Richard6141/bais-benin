# Images de production Next.js (sortie standalone), non root.
#
# Deux cibles publiées :
# - runner (par défaut) : l'application seule, sans sources ni outils ;
# - tools : sources, dépendances et client Prisma, pour les tâches ponctuelles du déploiement
#   (prisma migrate deploy, seed de démonstration). Jamais exposée, lancée puis supprimée.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Pas de crochets Git dans une image : husky n'a rien à installer.
ENV HUSKY=0
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall copie le worker de MapLibre dans public/vendor : le script doit être présent.
COPY scripts/copy-maplibre-worker.mjs ./scripts/copy-maplibre-worker.mjs
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Aucune base n'est contactée au build : le client Prisma est généré à partir du schéma, et les
# routes ne se connectent qu'à la première requête. La configuration Prisma, le module de base et
# celui de l'authentification exigent pourtant DATABASE_URL et AUTH_SECRET à l'import : une
# adresse factice et un secret tiré au hasard, propres à cette commande, leur suffisent. Rien
# n'est gardé dans l'image finale ; l'application lit les vraies valeurs à son démarrage.
RUN export DATABASE_URL=postgresql://build:build@localhost:5432/build \
  && export AUTH_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')" \
  && pnpm db:generate && pnpm build

FROM base AS tools
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm db:generate
# Aucune commande par défaut utile : le déploiement passe la sienne (migrations, seed).
CMD ["pnpm", "exec", "prisma", "migrate", "status"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
