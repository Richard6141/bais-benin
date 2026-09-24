-- Extensions requises par la plateforme.
-- postgis   : géométries des parcelles, communes et exploitations.
-- pg_trgm   : recherche tolérante aux fautes sur les noms de communes et de personnes.
-- citext    : adresses e-mail insensibles à la casse.
-- pgcrypto  : fonctions de hachage utilisées par certaines contraintes.
-- vector    : recherche documentaire de l'assistant (installée si disponible).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN undefined_file OR feature_not_supported THEN
    RAISE NOTICE 'pgvector indisponible sur ce serveur : la recherche documentaire sera activée plus tard.';
END
$$;
