# ADR-0012 — Connexion unique par NPI et code WhatsApp pour tous les rôles

- Statut : acceptée, remplace en partie ADR-0010 (connexion institutionnelle et double authentification TOTP)
- Date : 2026-09-25
- Décideurs : Produit (porteur du projet), Sécurité, Architecte

## Contexte

L'ADR-0010 prévoyait deux parcours : téléphone et code à usage unique pour les agriculteurs et les agents, e-mail, mot de passe puis code TOTP pour le ministère, les coopératives et les acheteurs. Le NPI n'était qu'un attribut facultatif, saisi après coup depuis la page Compte.

Au premier essai de la plateforme, le porteur du projet a écarté ce modèle : sur les plateformes de l'État béninois, un compte se crée avec le seul NPI et un code à usage unique. Il demande le même parcours pour tous les rôles, avec le code envoyé sur WhatsApp par wapy.pro (ADR-0007), et la double authentification par un code WhatsApp plutôt que par une application TOTP. La vérification du couple NPI et numéro auprès de l'ANIP viendra quand le Ministère l'aura validée (convention X-Road, `docs/recherche/anip-npi-api.md`).

## Options étudiées

1. **Conserver deux parcours** (téléphone pour le terrain, mot de passe et TOTP pour les institutions) : écarté par le porteur du projet ; il s'éloigne des usages des services publics béninois et impose une application d'authentification aux agents du ministère.
2. **Mot de passe et code WhatsApp pour les institutions** : proposé, écarté par le porteur du projet au profit d'un parcours unique.
3. **NPI et code WhatsApp pour tous** : retenu.

## Décision

- **Un seul parcours, `/connexion`** : premier écran, le NPI et le numéro de téléphone relié ; second écran, le code à six chiffres reçu sur WhatsApp. Plus de mot de passe, plus de TOTP. `/connexion/institution`, `/connexion/institution/verification` et `/compte/securite` redirigent vers les écrans actuels.
- **Intention de connexion** : une action serveur (`prepareSignIn`) contrôle la forme du NPI et du numéro, puis dépose le NPI chiffré (AES-256-GCM, clé `NPI_ENCRYPTION_KEY`, données associées liées au numéro et à l'échéance) dans un cookie httpOnly de dix minutes (`src/lib/auth/sign-in-intent.ts`). Rien n'est lu en base à cet écran : il ne révèle jamais si un NPI est connu.
- **Contrôles dans better-auth** (`src/lib/auth/npi-sign-in.ts`) : l'envoi et la vérification du code sont refusés sans intention pour le même numéro ; une fois le code vérifié, donc la possession du numéro prouvée, un numéro inconnu ne crée un compte que si le NPI n'appartient à personne, et un compte existant doit présenter le NPI qui y est lié. Un compte sans NPI (créé avant cette décision) reçoit à sa première connexion celui qui est saisi, en attente de vérification (`PENDING`).
- **Sessions** : une session n'est reconnue (`resolveSession`) que pour un compte dont le NPI est lié. La durée institutionnelle de 12 heures (ADR-0010) est conservée.
- **Double authentification** : le NPI identifie la personne, le code WhatsApp prouve la possession du téléphone relié, à chaque connexion et pour tous les rôles. Le plugin `twoFactor`, `@paulmillr/qr` et `@node-rs/argon2` sont retirés.
- **Rôles institutionnels** : ils sont attribués par un administrateur à un compte identifié par son NPI (seed en démonstration). La gouvernance des règles d'alerte exige un compte dont le NPI est lié, en lieu et place de la double authentification TOTP.
- **Démonstration** : un NPI et un numéro fictifs par rôle (`src/lib/auth/demo-accounts.ts`), acceptant `OTP_DEMO_CODE` et affichés sous le formulaire hors production. Aucun message n'est envoyé à ces numéros.

## Conséquences

- Parcours identique pour tous, sans secret à retenir ni application à installer ; cohérent avec les services publics numériques du Bénin.
- **Risque accepté jusqu'à la vérification ANIP** : tant que le couple NPI et numéro n'est pas vérifié par l'ANIP, une personne qui connaît le NPI d'une autre et crée un compte la première avec son propre numéro l'occupe. Mesures : le NPI reste `PENDING` et le statut est visible ; un administrateur ne doit attribuer un rôle institutionnel qu'après avoir vérifié le NPI et le numéro de la personne ; l'adaptateur X-Road (port `IdentityVerificationProvider`) tranchera les conflits dès son ouverture.
- **Oracle limité** : un refus « NPI et numéro non reliés » n'est donné qu'après un code valide, donc à qui détient le numéro saisi ; l'envoi de code reste limité par adresse IP et par numéro (ADR-0010, B4) et par le quota wapy.pro (2 codes par heure et par destinataire).
- La sécurité du ministère repose désormais sur la possession du téléphone et de sa messagerie WhatsApp : un compte WhatsApp compromis compromet le compte BAIS. Une confirmation par code à la volée pour les actions les plus sensibles (révélation d'un NPI, attribution de rôle) reste à ajouter.
- Les clés `NPI_ENCRYPTION_KEY` et `NPI_HASH_KEY` deviennent indispensables à toute connexion.
