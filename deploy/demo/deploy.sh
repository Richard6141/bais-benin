#!/usr/bin/env bash
# Déploiement de BAIS sur le serveur de démonstration (docs/deploiement-demo.md), installé en
# /opt/bais/deploy.sh. C'est la commande forcée de la clé de déploiement de la CI
# (authorized_keys) : cette clé ne peut rien lancer d'autre.
#
#   deploy <sha> <utilisateur>  jeton GHCR lu sur l'entrée standard, jamais en argument ;
#                               tire les images du commit, sauvegarde la base, migre, redémarre
#                               l'application et le planificateur, vérifie la santé et revient à
#                               l'image précédente si elle échoue.
#   rollback                    revient à l'image précédente (sans toucher aux migrations).
#   status                      image en service et état des conteneurs.
#   deploy-local <sha>          à la main seulement : images déjà construites sur le serveur.
#
# À la main : ./deploy.sh status, ./deploy.sh rollback, ou
#             ./deploy.sh deploy <sha> <utilisateur> < fichier-contenant-le-jeton
set -euo pipefail
umask 077

BAIS_DIR=/opt/bais
REGISTRY=ghcr.io/richard6141/bais-benin
HEALTH_URL=http://127.0.0.1:3100/api/health
KEEP_IMAGES=3
# Identifiants GHCR propres à BAIS, effacés après chaque tirage : rien n'est écrit dans la
# configuration Docker de l'utilisateur, partagée avec les autres projets du serveur.
export DOCKER_CONFIG="$BAIS_DIR/.docker"

cd "$BAIS_DIR"
mkdir -p logs backups "$DOCKER_CONFIG"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a logs/deploy.log >&2; }
fail() {
  log "ÉCHEC : $*"
  exit 1
}

compose() {
  local tag="$1"
  shift
  IMAGE_TAG="$tag" docker compose --project-directory "$BAIS_DIR" -f "$BAIS_DIR/compose.yml" "$@"
}

current_tag() { cat current.tag 2>/dev/null || true; }
previous_tag() { cat previous.tag 2>/dev/null || true; }
valid_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

healthy() {
  local attempt
  for attempt in $(seq 1 18); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  return 1
}

db_running() { [ "$(docker inspect -f '{{.State.Running}}' bais-db 2>/dev/null)" = "true" ]; }

backup_db() {
  db_running || return 0
  local file
  file="backups/bais-$(date -u +%Y%m%dT%H%M%SZ).dump"
  docker exec bais-db pg_dump -U bais -d bais -Fc >"$file"
  # Sept sauvegardes gardées.
  ls -1t backups/bais-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
  log "sauvegarde de la base : $file"
}

# Les KEEP_IMAGES images les plus récentes de chaque dépôt restent ; l'image en service et la
# précédente ne sont jamais retirées.
prune_images() {
  local repo tag keep
  keep=" $(current_tag) $(previous_tag) "
  for repo in app tools scheduler; do
    docker image ls "$REGISTRY/$repo" --format '{{.Tag}}' | tail -n +$((KEEP_IMAGES + 1)) |
      while read -r tag; do
        case "$keep" in *" $tag "*) continue ;; esac
        docker image rm "$REGISTRY/$repo:$tag" >/dev/null 2>&1 || true
      done
  done
}

switch_to() {
  local tag="$1"
  compose "$tag" up -d --remove-orphans app scheduler
}

# Sauvegarde, migrations, nouvelle image, santé ; retour à l'image précédente si elle échoue.
release() {
  local sha="$1" previous
  previous="$(current_tag)"
  compose "$sha" up -d --wait db
  backup_db
  log "migrations"
  docker run --rm --network bais_default --env-file app.env \
    "$REGISTRY/tools:$sha" pnpm exec prisma migrate deploy >&2 || fail "migrations"

  switch_to "$sha"
  if healthy; then
    if [ -n "$previous" ] && [ "$previous" != "$sha" ]; then echo "$previous" >previous.tag; fi
    echo "$sha" >current.tag
    prune_images
    log "déploiement réussi : $sha en service"
  else
    log "santé en échec après 90 s"
    if valid_sha "$previous"; then
      switch_to "$previous"
      if healthy; then log "retour automatique à $previous"; else log "l'image précédente ne répond pas"; fi
    fi
    fail "déploiement de $sha annulé"
  fi
}

request="${SSH_ORIGINAL_COMMAND:-$*}"
read -r action sha user extra <<<"$request" || true
[ -z "${extra:-}" ] || fail "argument en trop"

exec 9>"$BAIS_DIR/deploy.lock"
flock -n 9 || fail "un déploiement est déjà en cours"

case "${action:-}" in
  status)
    running="$(current_tag)"
    echo "image en service : ${running:-aucune}"
    echo "image précédente : $(previous_tag)"
    compose "${running:-aucune}" ps
    ;;

  rollback)
    target="$(previous_tag)"
    valid_sha "$target" || fail "aucune image précédente"
    log "retour à $target"
    switch_to "$target"
    healthy || fail "l'image précédente ne répond pas non plus"
    mv current.tag previous.tag.tmp
    echo "$target" >current.tag
    mv previous.tag.tmp previous.tag
    log "retour effectué : $target en service"
    ;;

  deploy)
    valid_sha "${sha:-}" || fail "SHA invalide"
    [[ "${user:-}" =~ ^[A-Za-z0-9-]{1,39}$ ]] || fail "utilisateur GHCR invalide"
    IFS= read -r token || true
    [ -n "${token:-}" ] || fail "jeton GHCR absent de l'entrée standard"
    exec </dev/null

    log "déploiement de $sha"
    printf '%s' "$token" | docker login ghcr.io -u "$user" --password-stdin >/dev/null
    unset token
    trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
    for repo in app tools scheduler; do
      docker pull --quiet "$REGISTRY/$repo:$sha" >/dev/null || fail "image $repo:$sha introuvable"
    done
    docker logout ghcr.io >/dev/null 2>&1 || true

    release "$sha"
    ;;

  deploy-local)
    # Images déjà présentes sur le serveur (construction de secours sur place) : jamais par la
    # clé de la CI, seulement lancé à la main.
    [ -z "${SSH_ORIGINAL_COMMAND:-}" ] || fail "commande refusée"
    valid_sha "${sha:-}" || fail "SHA invalide"
    for repo in app tools scheduler; do
      docker image inspect "$REGISTRY/$repo:$sha" >/dev/null 2>&1 || fail "image $repo:$sha absente"
    done
    log "déploiement local de $sha"
    release "$sha"
    ;;

  *)
    fail "commande refusée"
    ;;
esac
