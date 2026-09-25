# Planificateur des tâches de monitoring (docs/modules/monitoring-parcours-ux.md §2.E).
# Image minimale : crond de BusyBox et curl. Aucun secret n'est inscrit dans l'image : CRON_SECRET
# est lu au démarrage depuis l'environnement du conteneur (voir entrypoint.sh).
FROM alpine:3.20

RUN apk add --no-cache curl tzdata \
  && adduser -D -H -s /sbin/nologin scheduler

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY call-app.sh /usr/local/bin/call-app.sh
COPY crontab /etc/crontabs/root.template
RUN chmod 0755 /usr/local/bin/entrypoint.sh /usr/local/bin/call-app.sh

# Horaires exprimés en UTC : 4 h 00 UTC = 5 h 00 à Porto-Novo (UTC+1, sans heure d'été).
ENV TZ=UTC

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
