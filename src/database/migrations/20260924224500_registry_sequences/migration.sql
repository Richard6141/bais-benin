-- Séquences des codes attribués par le serveur de synchronisation (registre, étape 5).
-- Les codes agriculteur (BJ-F-NNNNNNNNN) et exploitation (BJ-DEP-COM-NNNNNN) du jeu de
-- démonstration occupent les premiers numéros ; les séquences démarrent au-delà pour
-- qu'aucune saisie terrain ne puisse entrer en collision avec une ligne synthétique.
CREATE SEQUENCE IF NOT EXISTS "farmer_code_seq" START WITH 10000001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "farm_code_seq" START WITH 100001 INCREMENT BY 1;
