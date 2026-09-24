# Authentification et identité — parcours écran par écran

- Étape : 3 (authentification), préparation.
- Public : équipe front. Ce document décrit les écrans ; les décisions techniques sont dans docs/06 §2, ADR-0003 (Auth.js, OTP, identifiants institutionnels), ADR-0007 (wapy.pro canal WhatsApp) et docs/recherche/anip-npi-api.md (NPI).
- Statut : proposition, à valider avant implémentation.

## 0. Règles transversales

Ces règles s'appliquent à tous les écrans qui suivent ; elles ne sont pas répétées.

| Règle | Application |
|---|---|
| Formulaires courts | Trois champs au plus par écran ; au-delà, on découpe en étapes. Une étape se valide et se sauvegarde seule. |
| Récupération automatique | Tout ce que l'appareil ou la plateforme connaît est prérempli : numéro (autofill `tel`, WebOTP pour le code), position (commune depuis le GPS), contact du carnet d'adresses, données déjà saisies par un agent. L'utilisateur confirme, il ne ressaisit pas. |
| Un bouton principal | Un seul bouton plein par écran, pleine largeur sur mobile, 56 px sur l'espace agriculteur, 44 px ailleurs. Les actions secondaires sont des liens texte. |
| Première utilisation guidée | Un repère d'aide (`CoachMark`) par écran nouveau, ignorable, jamais réaffiché une fois compris. Un parcours d'accueil de 3 à 4 écrans par rôle, ignorable, relançable depuis le menu. |
| Hors connexion | Les écrans d'authentification qui exigent le réseau l'annoncent avant la saisie (`OfflineBanner`) et gardent la saisie en local. Les écrans d'enrôlement par l'agent fonctionnent entièrement hors ligne. |
| Erreurs | Messages en français courant, sous le champ, avec l'action pour corriger. Jamais « erreur inconnue ». Les messages liés à la sécurité sont neutres (voir §4). |
| Accessibilité | Cibles 44 px minimum, libellés visibles (pas de texte indicatif seul), contraste AA, ordre de focus logique, `aria-describedby` sur chaque erreur. Chaque écran de l'espace agriculteur prévoit un bouton « Écouter » qui lit le titre et la consigne (synthèse vocale du navigateur, français ; les langues nationales viendront avec des enregistrements). |
| NPI | Jamais exigé pour utiliser la plateforme. Saisi une fois, validé localement (chiffres, longueur paramétrée à 13, non bloquante), stocké chiffré, affiché masqué, vérifié plus tard par l'ANIP via X-Road quand la convention existera. Statut visible à l'utilisateur. |
| Langue et ton | Vouvoiement, phrases courtes, aucun terme administratif sur l'espace agriculteur (« votre numéro », pas « identifiant »). |

## 1. Personas et contextes

| Persona | Contexte d'usage | Conséquences pour les écrans |
|---|---|---|
| **Adjoa, agricultrice, Couffo** | Lit peu le français, téléphone Android d'entrée de gamme partagé avec le ménage, WhatsApp installé, réseau 2G ou 3G intermittent, souvent en plein soleil. | Connexion par téléphone et code, pictogrammes et audio, un écran = une action, pas de mot de passe, déconnexion facile car téléphone partagé, session longue mais révocable par l'agent. |
| **Sabi, agent de terrain ATDA, Borgou** | Android milieu de gamme, souvent hors ligne pendant les visites, dix à trente enrôlements par jour, gants ou mains sales. | Enrôlement multi-étapes hors ligne avec reprise, saisie minimale, capture QR et photo, grandes cibles, actions en bas d'écran (une main). |
| **Mireille, gestionnaire de coopérative, Zou** | Ordinateur partagé au siège et téléphone personnel, e-mail professionnel, gère 300 membres. | Compte institutionnel e-mail + mot de passe, TOTP facultatif, import de la liste des membres, sessions de 12 h. |
| **Kolawolé, acheteur, Plateau** | Téléphone et ordinateur, cherche des offres, contacte des producteurs via la plateforme. | Compte institutionnel léger, vérification d'entreprise différée, jamais accès aux numéros directs. |
| **Rachidatou, agent communal, Djougou** | Poste de la mairie, connexion partagée, valide les agents et consulte les agrégats de sa commune. | Compte institutionnel, TOTP obligatoire (`COMMUNE_ADMIN`), invitation par le ministère. |
| **Éric, analyste ministère, Cotonou** | Poste de travail, écran large, données nationales, mode projection. | E-mail + mot de passe + TOTP obligatoire pour les administrateurs, session 12 h, thème sombre disponible, révélation du NPI journalisée avec justification (`MINISTRY_ADMIN` seulement). |

## 2. Parcours

Convention des tableaux : **Champs** liste ce que l'utilisateur voit à saisir ; **Automatique** ce qui est prérempli ou déduit ; **Bouton** le bouton principal unique ; **Erreurs** les messages affichés ; **Hors ligne** le comportement sans réseau ; **Aide** le repère de première utilisation.

### 2.a Première connexion d'un agriculteur (téléphone + code WhatsApp)

Point d'entrée : lien reçu par WhatsApp après enrôlement par un agent, ou bouton « Me connecter » de l'accueil, ou QR code sur l'affiche de la coopérative.

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Aide |
|---|---|---|---|---|---|---|---|
| A1 Numéro | Obtenir le numéro de téléphone | 1 : numéro (`PhoneField`, indicatif +229 fixe, 10 chiffres attendus, clavier numérique) | Numéro proposé par l'autofill `tel` du navigateur ; si l'ouverture vient d'un lien WhatsApp personnalisé, le numéro est prérempli et masqué (`•• •• 45 67`), l'utilisateur confirme seulement. | « Recevoir mon code » | « Ce numéro doit avoir 10 chiffres et commencer par 01 » ; « Ce numéro n'est pas encore enregistré. Demandez à votre agent ou à votre coopérative. » (uniquement si la politique de neutralité le permet, voir §4 ; sinon message générique « Si ce numéro est connu, un code va arriver ») | Bandeau « Pas de réseau : la connexion a besoin d'internet » ; le numéro saisi est gardé ; le bouton reste actif et réessaie au retour du réseau. | Repère sur le champ : « Le numéro sur lequel vous recevez WhatsApp ». Bouton « Écouter ». |
| A2 Code | Saisir le code à 6 chiffres | 1 : code (`OtpInput`, 6 cases, clavier numérique, coller accepté) | WebOTP (`autocomplete="one-time-code"`) remplit le code depuis le SMS de repli ; pour WhatsApp, le message contient le code et un lien de retour qui préremplit le code. | « Valider » (activé à 6 chiffres, validation automatique possible) | « Code incorrect. Il vous reste N essais. » ; « Ce code a expiré. Demandez-en un nouveau. » ; après verrouillage : « Trop d'essais. Réessayez dans 15 minutes ou contactez votre agent. » | Idem A1. | Texte sous les cases : « Le code est arrivé sur WhatsApp (numéro BAIS). » Lien « Je n'ai pas reçu le code » visible après 20 s. |
| A2' Non reçu | Basculer de canal | 0 | Compteur d'envois, canal déjà utilisé. | « Recevoir par SMS » (ou « Renvoyer sur WhatsApp » si le SMS a déjà été tenté) | « Nouvel envoi possible dans 60 s ». Après 3 envois : « Contactez votre agent ou appelez le numéro d'aide. » avec numéro cliquable. | Idem. | Explique en une phrase que le SMS peut prendre une minute. |
| A3 Bienvenue | Confirmer l'identité connue et poser la langue | 1 : langue préférée (choix parmi 3 boutons : français, fon, bariba ; liste selon le département) | Prénom, nom et commune affichés (issus de l'enrôlement). Langue proposée selon la commune (`LINGUISTIC_AREAS_BY_DEPARTEMENT`). | « C'est bien moi » | Lien « Ce n'est pas moi » qui déconnecte et propose de contacter l'agent. | Fonctionne (données du jeton). | Démarre le parcours d'accueil 2.f. |
| A4 Téléphone partagé | Protéger le compte sur un appareil partagé | 1 : choix « Ce téléphone est à moi » / « Je le partage » (deux grands boutons) | Rien. | Le choix est le bouton. | — | Fonctionne. | Repère : « Si vous partagez ce téléphone, nous vous demanderons votre code à chaque ouverture. » |

Effets du choix A4 : « à moi » donne une session de 30 jours glissants ; « je le partage » donne une session de 24 h et un bouton « Quitter » permanent en haut de l'espace agriculteur.

### 2.b Enrôlement d'un agriculteur par un agent (multi-étapes, hors ligne)

Point d'entrée : espace agent, bouton « Enregistrer un producteur ». Chaque étape est sauvegardée localement (Dexie, outbox) ; la liste « Enrôlements en cours » permet la reprise. Un `StepperForm` affiche « Étape 2 sur 6 » et permet de revenir en arrière.

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Aide |
|---|---|---|---|---|---|---|---|
| B1 Où | Rattacher à une commune et un village | 1 : village ou quartier (recherche dans la liste locale) ; commune affichée, modifiable par un lien | Position GPS → commune détectée (`pointInPolygon` sur les géométries embarquées) avec précision affichée ; villages de la commune proposés en premier ; dernière commune utilisée si le GPS est refusé. | « Continuer » | « Position imprécise (250 m) : vérifiez la commune. » ; « Hors de vos communes affectées : demandez une affectation à votre superviseur. » | Totalement : géométries et listes de villages embarquées. | Repère : « La commune vient de votre position. Corrigez-la si besoin. » |
| B2 Qui | Identité minimale | 3 : prénom, nom, sexe (deux boutons) | Aire linguistique proposée pour l'orthographe assistée (suggestions de prénoms locaux au fil de la frappe, `names.ts` en phase 1) ; casse normalisée. | « Continuer » | « Le prénom est nécessaire. » ; doublon probable : « Un producteur du même nom existe à N km : est-ce la même personne ? » avec « Oui, ouvrir » / « Non, c'est quelqu'un d'autre ». | Détection de doublon sur le cache local de la commune. | Repère sur le nom : « Écrivez comme sur la pièce d'identité si elle existe. » |
| B3 Contact | Téléphone qui recevra le code | 1 : numéro (`PhoneField`) ; case « Numéro d'un proche » | Import depuis le carnet de contacts du téléphone de l'agent (API Contact Picker, Android Chrome) ; sinon saisie. Détection d'un numéro déjà utilisé. | « Continuer » | « Ce numéro est déjà lié à un autre producteur : choisissez « Numéro d'un proche » ou vérifiez. » ; format. | Fonctionne ; l'unicité globale est revérifiée à la synchronisation, avec un conflit remonté à l'agent. | Repère : « Sans numéro, le producteur pourra tout de même être enregistré ; il se connectera plus tard. » (le numéro est facultatif à cette étape, le lien « Pas de téléphone » saute l'étape). |
| B4 Pièce d'identité | Rehausser la confiance, sans bloquer | 1 : NPI (`NationalIdField`, 13 chiffres, facultatif) | Scan du QR code du CIP ou du CNPI (caméra) qui préremplit le NPI et joint la capture ; année de naissance lue si présente. | « Continuer » | « Un NPI a 13 chiffres. Vérifiez sur la carte. » (non bloquant : lien « Continuer quand même ») | Fonctionne ; la vérification ANIP est différée (statut « En attente »). | Repère : « Facultatif. Le NPI évite les doublons et servira pour les programmes d'appui. » Lien « Retrouver son NPI (ANIP) ». |
| B5 Exploitation | Localiser l'exploitation | 1 : position (carte centrée sur le GPS, marqueur déplaçable) ; superficie déclarée avec unité (champ + choix ha / « nombre de kantis » converti) | Position = GPS courant ; précision affichée ; superficie proposée vide. | « Continuer » | « Précision GPS faible : rapprochez-vous d'un espace dégagé ou déplacez le point. » | Fonctionne (tuiles hors ligne de la commune). | Repère : « Placez le point au centre des parcelles. Les contours viendront à la visite terrain. » |
| B6 Consentement et récapitulatif | Consentement éclairé et création | 1 : case « Le producteur accepte l'enregistrement et l'envoi de messages » ; bouton « Lire le texte au producteur » (audio) | Récapitulatif des cinq étapes, statut `DECLARED`, agent et date. | « Enregistrer » | « Le consentement est nécessaire pour enregistrer. » | L'enregistrement part dans l'outbox ; badge « À synchroniser ». | Repère : « Le producteur recevra un message WhatsApp de bienvenue avec son lien de connexion dès la synchronisation. » |
| B7 Fait | Confirmer et enchaîner | 0 | Code du producteur, lien de connexion, QR à montrer. | « Enregistrer un autre producteur » ; lien « Voir la fiche » | — | Fonctionne. | — |

Le compte créé n'a pas d'e-mail, pas de mot de passe : identifiant = numéro de téléphone (ou aucun, si « Pas de téléphone » ; dans ce cas la connexion se fera lors d'une visite ultérieure avec un numéro, ou via le téléphone d'un proche déclaré à B3).

### 2.c Connexion institutionnelle (e-mail + mot de passe + TOTP) et activation par invitation

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Aide |
|---|---|---|---|---|---|---|---|
| C0 Invitation | Activer un compte créé par un administrateur | 0 (lien signé reçu par e-mail, valable 7 jours) | E-mail, rôle et périmètre affichés en lecture. | « Activer mon compte » | « Ce lien a expiré : demandez une nouvelle invitation à [nom de l'émetteur]. » | Non disponible (message clair). | — |
| C1 Mot de passe | Choisir un mot de passe | 2 : mot de passe, confirmation (affichage possible) | Indicateur de robustesse ; refus des mots de passe compromis (vérification k-anonymisée) ; gestionnaire de mots de passe reconnu (`autocomplete="new-password"`). | « Continuer » | « 12 caractères minimum. » ; « Ce mot de passe figure dans des fuites connues : choisissez-en un autre. » ; « Les deux saisies diffèrent. » | Non disponible. | Une phrase : « Une phrase de plusieurs mots est plus sûre et plus facile à retenir qu'une suite de symboles. » |
| C2 TOTP | Activer la double authentification | 1 : code à 6 chiffres | QR code + clé en clair ; lien direct `otpauth://` sur mobile ; obligatoire pour `COMMUNE_ADMIN`, `MINISTRY_ADMIN`, `PLATFORM_ADMIN`, proposé et ignorable pour les autres (lien « Plus tard »). | « Vérifier et activer » | « Code incorrect : vérifiez l'heure de votre téléphone. » | Non disponible. | Repère : « Installez une application d'authentification (Aegis, Google Authenticator, Microsoft Authenticator) puis scannez. » |
| C3 Codes de secours | Éviter le blocage | 0 | 8 codes générés, à télécharger ou imprimer ; case « Je les ai mis en lieu sûr ». | « Terminer » | — | — | — |
| C4 Connexion | Se connecter | 2 : e-mail, mot de passe | E-mail mémorisé par le navigateur ; lien « Mot de passe oublié ». | « Se connecter » | Message unique : « E-mail ou mot de passe incorrect. » | Non disponible. | — |
| C5 Deuxième facteur | Vérifier le TOTP | 1 : code | `autocomplete="one-time-code"`. Lien « Utiliser un code de secours ». | « Valider » | « Code incorrect. » ; après 5 essais : verrouillage 15 min. | — | — |
| C6 Appareil de confiance | Réduire la friction sur poste personnel | 1 : case « Ne plus demander le code sur cet appareil pendant 30 jours » (décochée par défaut, indisponible sur les rôles d'administration) | — | « Continuer » | — | — | Une phrase : « Ne cochez pas sur un poste partagé. » |

Sessions : 12 h pour tous les rôles institutionnels (docs/06 §2), rappel 10 minutes avant expiration avec prolongation en un clic si l'utilisateur est actif.

### 2.d Ajout et vérification du NPI

Accessible depuis « Mon compte » (agriculteur), depuis la fiche producteur (agent) et depuis B4 à l'enrôlement.

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Aide |
|---|---|---|---|---|---|---|---|
| D1 Saisie | Enregistrer le NPI | 1 : NPI (`NationalIdField` : chiffres seulement, groupes de 4-4-5 à l'affichage, clavier numérique) ; sélecteur NPI / NPIR (résident étranger) | Scan du QR du CIP ou CNPI (agent) ; sinon saisie. | « Enregistrer » | « Un NPI a 13 chiffres ; vous en avez saisi 12. » (non bloquant tant que la longueur n'est pas confirmée officiellement : lien « Enregistrer quand même ») ; « Ce NPI est déjà rattaché à un autre compte : contactez votre agent. » (unicité par empreinte HMAC). | Enregistré localement, envoyé à la synchronisation. | Repère : « Le NPI figure sur votre carte d'identité ou votre certificat CNPI. Il n'est jamais affiché en entier. » Lien « Je ne connais pas mon NPI » → aide ANIP (retrouver-npi, numéro vert 7054). |
| D2 Statut | Montrer l'état | 0 | Badge : « En attente de vérification ANIP » (`watch`), « Vérifié par l'ANIP le JJ/MM/AAAA » (`success`), « Non concordant » (`critical`, avec « Voir avec votre agent »), « Vérifié sur pièce par l'agent » (`info`, quand l'agent a contrôlé visuellement le titre via l'application ANIP BJ). Affichage masqué : `•••• •••• •4567`. | « Modifier » (lien) | — | Affiche le dernier statut connu. | Une phrase : « La vérification automatique par l'ANIP sera activée dès la convention signée ; en attendant, votre agent peut vérifier la pièce. » |
| D3 Révélation (ministère) | Voir un NPI complet | 1 : justification (texte court, obligatoire) | Rôle `MINISTRY_ADMIN`, MFA déjà passée dans la session, sinon C5 est rejoué. | « Afficher pendant 60 s » | « Justification requise (10 caractères minimum). » | Non disponible. | Bandeau : « Cet accès est journalisé. » |

Le statut « Non concordant » ne bloque jamais l'usage de la plateforme ; il abaisse le niveau de confiance de l'identité et crée une tâche pour l'agent.

### 2.e Récupération d'accès (téléphone perdu, changement de numéro)

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Aide |
|---|---|---|---|---|---|---|---|
| E1 Choix | Orienter | 0 (deux grands boutons : « J'ai un nouveau numéro » / « J'ai perdu mon téléphone ») | — | Le choix est le bouton. | — | Fonctionne. | — |
| E2 Nouveau numéro (agriculteur seul) | Demander le changement | 2 : ancien numéro (si connu), nouveau numéro | Le nouveau numéro est celui de l'appareil (autofill). | « Demander le changement » | Format ; « Le nouveau numéro est déjà utilisé. » | Enregistré et envoyé au retour du réseau. | Une phrase : « Votre agent ou votre coopérative confirmera le changement ; vous recevrez un message sur le nouveau numéro. » |
| E3 Validation par l'agent | Confirmer l'identité en personne | 1 : case « J'ai vérifié l'identité du producteur » ; choix de la méthode (pièce d'identité, reconnaissance par la coopérative, NPI concordant) | Demande listée dans « Tâches » de l'agent avec ancien et nouveau numéro masqués ; fiche producteur en regard. | « Confirmer le nouveau numéro » | « Sélectionnez la méthode de vérification. » | Fonctionne ; la confirmation part dans l'outbox et révoque les anciennes sessions à la synchronisation. | Repère : « Cette action déconnecte l'ancien téléphone. » |
| E4 Confirmation | Clore | 0 | Message WhatsApp envoyé au nouveau numéro avec lien de connexion (A1 prérempli). | « Retour » | — | — | — |
| E5 Téléphone perdu (institution) | Réinitialiser le mot de passe | 1 : e-mail | Lien signé envoyé par e-mail (15 min) ; message identique que l'e-mail existe ou non. | « Envoyer le lien » | « Si cette adresse existe, un lien vient d'être envoyé. » | Non disponible. | — |
| E6 TOTP perdu (institution) | Recouvrer sans TOTP | 1 : code de secours | — | « Valider » | « Code de secours invalide ou déjà utilisé. » ; sans codes : « Contactez votre administrateur, qui réinitialisera le second facteur après vérification. » | — | — |

Un agent peut aussi déclencher E3 sans demande préalable (producteur venu le voir avec un nouveau téléphone) depuis la fiche producteur : bouton « Changer le numéro ».

### 2.f Accueil de première utilisation par rôle (3 à 4 écrans, ignorables)

Affiché une fois après la première connexion ; « Passer » disponible sur chaque écran ; relançable depuis « Aide ». Chaque écran : un pictogramme ou une capture, un titre de 5 mots au plus, une phrase, un bouton « Suivant », bouton « Écouter » sur l'espace agriculteur.

| Rôle | Écran 1 | Écran 2 | Écran 3 | Écran 4 |
|---|---|---|---|---|
| Agriculteur | « Voici votre exploitation » (carte, pictogrammes de cultures) | « Vos alertes arrivent ici et sur WhatsApp » | « Déclarez votre récolte en 3 étapes » (bouton d'essai) | « Besoin d'aide ? Votre agent : [nom, bouton d'appel] » |
| Agent terrain | « Tout fonctionne sans réseau » (bandeau, outbox) | « Enregistrer un producteur en 6 étapes » | « Vérifier une exploitation : tracer la parcelle » | « Vos tâches du jour » |
| Gestionnaire de coopérative | « Vos membres » (import CSV, invitation) | « Publier une offre groupée » | « Demandes d'achat » | — |
| Acheteur | « Trouver des offres par culture et zone » | « Contacter via la plateforme, jamais en direct » | « Suivre vos demandes » | — |
| Agent communal | « Votre commune en chiffres, avec leur source » | « Valider les agents » | « Alertes locales » | — |
| Analyste et administrateur ministère | « Chaque chiffre porte sa source » | « Filtres nationaux et export » | « Accès sensibles journalisés » | « Mode projection (thème sombre) » |

Les coach marks ponctuels (un par écran nouveau, ancré sur un élément) complètent ce parcours ; ils s'effacent au premier tap et ne reviennent pas (préférence stockée côté serveur pour suivre l'utilisateur d'un appareil à l'autre).

## 3. Modèle d'états

### 3.1 Compte

```
PENDING ──(activation : premier OTP validé ou invitation acceptée)──▶ ACTIVE
ACTIVE ──(suspension par un administrateur, motif journalisé)──▶ SUSPENDED
SUSPENDED ──(levée, motif journalisé)──▶ ACTIVE
ACTIVE ──(demande de l'utilisateur ou inactivité de 24 mois, après préavis)──▶ CLOSED
```

| État | Ce que voit l'utilisateur | Connexion |
|---|---|---|
| `PENDING` | Rien encore ; l'agent voit « En attente de première connexion » sur la fiche. | Autorisée (elle provoque l'activation). |
| `ACTIVE` | Usage normal. | Autorisée. |
| `SUSPENDED` | « Votre compte est suspendu. Contactez [agent ou administrateur]. » sans détail du motif à l'écran. | Refusée, sessions révoquées. |
| `CLOSED` | « Ce compte est fermé. » | Refusée ; données conservées selon docs/06 §4. |

Le niveau de confiance de l'identité est indépendant de l'état du compte : `DECLARED` (numéro seul), `AGENT_VERIFIED` (agent a vu la personne), `NPI_PENDING`, `NPI_VERIFIED`, `NPI_MISMATCH`. Il s'affiche par `ReliabilityBadge` sur les fiches.

### 3.2 Sessions

| Rôle | Durée | Renouvellement | Fin anticipée |
|---|---|---|---|
| `FARMER` (téléphone personnel) | 30 jours glissants | À chaque ouverture active, rotation du jeton | « Quitter » ; révocation par l'agent (E3) ou l'administrateur ; changement de numéro |
| `FARMER` (téléphone partagé, A4) | 24 h | Aucun : nouveau code à chaque jour | « Quitter » toujours visible |
| `FIELD_AGENT`, `AGENT_SUPERVISOR` | 30 jours glissants, liée à l'appareil | Idem | Révocation de l'appareil par le superviseur |
| `COOPERATIVE_MANAGER`, `BUYER`, `COMMUNE_ADMIN`, `MINISTRY_*`, `PLATFORM_ADMIN` | 12 h | Prolongation en un clic 10 minutes avant expiration | Déconnexion ; changement de mot de passe ; révocation par l'administrateur |

La liste « Mes appareils connectés » (Mon compte) affiche appareil, date, commune approximative, et permet la déconnexion à distance.

## 4. Règles anti-abus visibles dans l'interface

| Mesure | Comportement | Message |
|---|---|---|
| Code OTP | 6 chiffres, 5 minutes, 5 essais par code | « Code incorrect. Il vous reste N essais. » |
| Verrouillage progressif | Après 5 échecs : 15 min ; puis 1 h ; puis 24 h, par numéro et par appareil ; l'agent peut lever le verrou depuis la fiche | « Trop d'essais. Réessayez dans 15 minutes ou contactez votre agent. » avec compte à rebours |
| Renvoi de code | 60 s entre deux envois, 3 envois par heure, 10 par jour | « Nouvel envoi possible dans 42 s » |
| Énumération des comptes | Réponse identique que le numéro ou l'e-mail existe ou non, sauf sur l'espace agriculteur lorsque l'agent est identifié dans le contexte (lien d'enrôlement), où le message « pas encore enregistré » est autorisé car il n'apprend rien à un tiers | « Si ce numéro est connu, un code arrive. » / « Si cette adresse existe, un lien vient d'être envoyé. » |
| Mot de passe | 12 caractères minimum, liste de compromission, pas de règles de composition | « Ce mot de passe figure dans des fuites connues. » |
| TOTP | Fenêtre ±1 pas, 5 essais puis 15 min | « Code incorrect : vérifiez l'heure de votre téléphone. » |
| Nouvel appareil (institution) | Notification e-mail « Nouvelle connexion depuis [navigateur, ville approximative] » avec lien « Ce n'était pas moi » qui révoque et force le changement de mot de passe | — |
| Changement de numéro | Toujours validé par un humain (agent, coopérative) ; ancien numéro notifié quand il est joignable | « Votre numéro a été changé par [agent]. Si ce n'est pas vous, appelez le [numéro d'aide]. » |
| Accès aux NPI | MFA récente (moins de 10 min), justification, journal consultable par `PLATFORM_ADMIN` | Bandeau « Cet accès est journalisé. » |

Les compteurs sont réinitialisés par le succès, jamais affichés au-delà du nombre d'essais restants, et aucun message ne distingue « numéro inconnu » de « code faux » hors du cas prévu.

## 5. Composants

### 5.1 À réutiliser (docs/modules/design-system.md)

| Composant | Usage dans ces parcours |
|---|---|
| `Button` (`h-14 w-full` sur l'espace agriculteur) | Bouton principal de chaque écran |
| `Input`, `Label`, `Form` (react-hook-form + Zod) | Tous les champs ; le schéma Zod est partagé avec l'action serveur |
| `Checkbox` | Consentement (B6), appareil de confiance (C6), codes de secours (C3), validation par l'agent (E3) |
| `RadioGroup` ou deux `Button` `outline` | Sexe (B2), téléphone partagé (A4), méthode de vérification (E3) |
| `Select` | Sélecteur NPI / NPIR (D1) |
| `Alert` (`info`, `watch`, `critical`) | Verrouillage, expiration, statut ANIP |
| `Badge` (`success`, `watch`, `critical`, `info`) et `ReliabilityBadge` | Statut du NPI (D2), niveau de confiance de l'identité |
| `Sheet` `side="bottom"` | Aide ANIP, « Je n'ai pas reçu le code » (A2'), choix de méthode (E3) sur mobile |
| `Dialog` | Révélation du NPI (D3), confirmation de révocation d'appareil (espace institutionnel uniquement) |
| `OfflineBanner` | Tous les écrans ; message spécifique sur A1, A2, C* |
| `EmptyState` | « Aucun enrôlement en cours », « Aucun appareil connecté » |
| `Skeleton` | Chargement de la fiche (A3) |
| `PageHeader` | Titres des écrans institutionnels |
| `CropGlyph`, `Monogram` | Parcours d'accueil |
| `Card` | Récapitulatif (B6), codes de secours (C3) |

### 5.2 À créer

| Composant | Rôle | Points d'attention |
|---|---|---|
| `PhoneField` | Champ téléphone béninois : indicatif `+229` fixe et non modifiable, 10 chiffres groupés `01 XX XX XX XX`, `inputMode="tel"`, `autocomplete="tel-national"`, normalisation E.164 en sortie | Refuser les lettres, accepter le collage avec espaces ou `+229`, masquage partiel en lecture |
| `OtpInput` | Six cases liées, `autocomplete="one-time-code"` sur un champ unique masqué (WebOTP), collage d'un code entier, validation automatique à la 6e case | Une seule cible de focus au clavier ; annonce du nombre d'essais restants par `aria-live` |
| `NationalIdField` | NPI ou NPIR, chiffres seulement, groupes 4-4-5, longueur paramétrée (`IDENTITY_NPI_LENGTH`), avertissement non bloquant, bouton « Scanner le QR » (agent) | Jamais de masque d'affichage dans le champ de saisie ; masquage à la lecture seulement |
| `StepperForm` | Assistant multi-étapes : indicateur « Étape n sur N », retour arrière, sauvegarde par étape (Dexie), reprise, récapitulatif final | Une étape = un schéma Zod ; état d'étape « à synchroniser » |
| `CoachMark` | Repère de première utilisation ancré sur un élément : texte court, bouton « Compris », fermeture au tap ; préférence stockée par utilisateur et par clé d'écran | Ne jamais masquer le bouton principal ; un seul repère visible à la fois ; respect de `prefers-reduced-motion` |
| `OnboardingCarousel` | Parcours d'accueil : 3 à 4 écrans, « Passer », « Suivant », pagination par points | Pas de balayage obligatoire ; boutons visibles |
| `ListenButton` | Lecture audio du titre et de la consigne (Web Speech API, `fr-FR`) avec repli silencieux si l'API est absente | Icône + libellé « Écouter » ; état « Lecture… » |
| `GpsPrecisionHint` | Précision de la position en mètres, couleur et texte, bouton « Actualiser » | Existe peut-être déjà dans l'espace agent (docs/modules/design-system.md §4.6) ; à réutiliser si c'est le cas |
| `CountdownText` | Compte à rebours accessible pour les verrouillages et les renvois de code | `aria-live="polite"`, mise à jour toutes les secondes sans re-focus |
| `SessionExpiryNotice` | Rappel 10 minutes avant la fin d'une session institutionnelle avec prolongation en un clic | `role="status"`, jamais modal |
| `DeviceList` | Appareils connectés avec déconnexion à distance | Lignes à 44 px, action de révocation avec confirmation |

## 6. Points à trancher avant implémentation

- Longueur du NPI : 13 chiffres selon la seule source disponible ; docs/09 §2 dit encore 10. Aligner docs/09 et rendre la longueur paramétrable, non bloquante, jusqu'à confirmation sur des NPI réels.
- Politique de neutralité sur A1 : autoriser ou non « numéro pas encore enregistré » dans le contexte d'un lien d'enrôlement (proposition : oui, uniquement dans ce contexte).
- Langues nationales pour l'audio : synthèse vocale française en phase 1 ; enregistrements en fon, bariba, dendi, yoruba à planifier avec les ATDA.
- Contact Picker (B3) : disponible sur Chrome Android seulement ; le repli est la saisie manuelle, rien de plus à prévoir.
