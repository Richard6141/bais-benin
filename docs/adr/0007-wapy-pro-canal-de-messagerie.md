# ADR-0007 — wapy.pro intégré comme canal de messagerie WhatsApp, pas comme fournisseur d'identité

- Statut : acceptée
- Date : 2026-09-24
- Décideurs : Architecte, Sécurité, Product Manager

## Contexte

Le porteur du projet a développé wapy.pro et demande d'étudier l'usage de son authentification, de sa gestion d'utilisateurs et de ses services développeurs, sans créer de dépendance forte.

## Constat

L'offre publique de wapy.pro est un assistant WhatsApp pour entreprises et, pour les développeurs, une passerelle HTTP d'envoi de messages WhatsApp transactionnels (codes de vérification, confirmations). Elle ne propose pas de service d'identité OAuth2/OIDC ni de gestion de comptes tiers.

## Décision

- wapy.pro devient l'adaptateur par défaut du port `MessagingChannel` pour WhatsApp : OTP de connexion, alertes agricoles, confirmations, mises en relation.
- L'identité et les comptes restent dans BAIS (ADR-0003).
- Un emplacement `services/identity/wapy-stub/` est réservé si wapy.pro expose un jour un OIDC ; il ne serait qu'une méthode de connexion optionnelle.
- Repli obligatoire : SMS puis in-app ; l'application fonctionne sans wapy.pro (adaptateur `console` en développement, `fixture` en tests).

## Conséquences

- La contribution la plus utile de wapy.pro pour le contexte béninois est exploitée : la portée de WhatsApp auprès des producteurs.
- L'indépendance architecturale est préservée ; le remplacement par l'API WhatsApp Business ou un autre agrégateur est une question d'adaptateur.
