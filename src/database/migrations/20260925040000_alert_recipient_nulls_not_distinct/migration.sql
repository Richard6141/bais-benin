-- Un destinataire est identifié par (alerte, exploitation, utilisateur, canal). Exploitation ou
-- utilisateur peuvent être absents (agent sans exploitation, producteur sans compte) : sans
-- NULLS NOT DISTINCT, PostgreSQL considère deux NULL comme différents et laisserait passer des
-- doublons. PostgreSQL 15 ou plus.
DROP INDEX "alert_recipient_alert_id_farm_id_user_id_channel_key";
CREATE UNIQUE INDEX "alert_recipient_alert_id_farm_id_user_id_channel_key"
  ON "alert_recipient" ("alert_id", "farm_id", "user_id", "channel") NULLS NOT DISTINCT;
