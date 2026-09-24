# ADR-0003 — Auth.js v5 avec OTP téléphone, identifiants institutionnels et OIDC prêt pour l'ANIP

- Statut : acceptée
- Date : 2026-09-24
- Décideurs : Sécurité, Architecte, Product Manager

## Contexte

Les agriculteurs et les agents s'identifient par téléphone, souvent sans adresse e-mail. Les institutions ont des comptes nominatifs. Une connexion future à l'ANIP doit être possible sans refonte. wapy.pro, étudié comme fournisseur d'identité potentiel, s'avère être une passerelle de messagerie, pas un fournisseur d'identité.

## Options étudiées

1. Service d'identité tiers hébergé (Clerk, Auth0) — écarté : dépendance externe forte et données personnelles nationales hors du périmètre de l'État.
2. Implémentation maison complète — écartée : coût et risque de sécurité élevés.
3. Auth.js v5 avec fournisseurs personnalisés — retenu.

## Décision

- Fournisseur `phone-otp` : code à usage unique envoyé par le module `notifications` (WhatsApp via wapy.pro, SMS, console en développement).
- Fournisseur `credentials` pour les comptes institutionnels, mots de passe Argon2id, MFA TOTP obligatoire pour les rôles d'administration.
- Fournisseur OIDC générique désactivé par défaut, activable par configuration pour l'ANIP ou tout fournisseur national.
- Sessions JWT courtes avec rotation ; liste de sessions côté serveur pour la révocation ; le jeton porte les affectations de rôle et de périmètre pour éviter une requête par action.
- Le NPI est traité par le port `IdentityVerificationProvider` (ADR indépendante de l'authentification) : il rehausse la confiance d'une identité, il ne sert pas à se connecter.

## Conséquences

- Auth.js gère les cas difficiles (CSRF, cookies, rotation) ; nous gardons la maîtrise des données.
- Toute nouvelle méthode de connexion est un fournisseur de plus, pas une refonte.
