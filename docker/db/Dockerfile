# Image PostgreSQL 16 avec PostGIS 3.4 et pgvector.
# PostGIS porte les géométries du registre ; pgvector servira à la recherche
# documentaire de l'assistant. Une seule image évite deux bases à exploiter.
FROM postgis/postgis:16-3.4

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-16-pgvector \
  && rm -rf /var/lib/apt/lists/*
