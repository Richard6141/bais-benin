# Registre des exploitations — parcours écran par écran

- Étape : 5 (registre et hors-ligne), préparation.
- Public : équipe front. Les décisions techniques sont dans docs/02 (module `registry`, `sync`), docs/04 (modèle de données, §10 `SyncCommand`), ADR-0005 (Serwist, Dexie, outbox). Le format reprend celui de docs/modules/authentification-parcours-ux.md ; les règles transversales de son §0 (trois champs par écran, un bouton principal, récupération automatique, aide de première utilisation, cibles 44 px, messages en français) s'appliquent sans être répétées.
- Statut : proposition, à valider avant implémentation.

## 0. Règles propres au registre

| Règle | Application |
|---|---|
| Hors connexion d'abord | Tous les parcours de l'agent fonctionnent sans réseau, du premier écran au dernier. Le réseau n'est requis que pour la synchronisation et le premier téléchargement du référentiel (parcours F). Aucun écran n'affiche « pas de connexion » comme une erreur : il affiche ce qui sera synchronisé plus tard. |
| Brouillon permanent | Chaque champ validé est écrit dans Dexie (`drafts`) avant tout passage à l'écran suivant. Fermer l'application, perdre le réseau ou changer de producteur ne perd jamais une saisie. La liste « En cours » permet la reprise. |
| Une main, en bas | Sur l'espace agent, les actions sont en bas d'écran (`Sheet` `side="bottom"`, bouton principal fixé au bas), le pouce ne remonte jamais au-dessus de la moitié de l'écran pour valider. |
| Provenance visible | Chaque valeur récupérée automatiquement porte une origine lisible (« depuis votre position », « depuis le tracé », « saisi par le producteur ») et un lien « Modifier ». La fiabilité affichée (`ReliabilityBadge`) découle de l'origine : `DECLARED` pour une saisie, `FIELD_VERIFIED` pour un relevé GPS ou une visite. |
| Contrôles non bloquants | Un écart déclaré / mesuré, un doublon probable, un NPI de longueur inattendue sont signalés en clair et enregistrés ; ils ne bloquent jamais l'enregistrement. Seuls manquent-de-consentement et absence de commune bloquent. |
| Unités locales | Les quantités sont saisies dans l'unité que le producteur utilise (sac de 100 kg, bassine, tas, régime, kilogramme, tonne) ; la conversion en kilogrammes est calculée et affichée, jamais exigée. |
| Indicateur de synchronisation | Toujours visible sur l'espace agent : nombre d'éléments en attente, dernière synchronisation, état (à jour, en attente, en cours, erreur). Un tap ouvre la file. |

## 1. Personas concernés

Les personas sont ceux de docs/modules/authentification-parcours-ux.md §1 : Sabi (agent de terrain, Android milieu de gamme, souvent hors ligne, dix à trente enregistrements par jour) pour les parcours A, B, D, F ; Adjoa (agricultrice peu lettrée, téléphone partagé) pour C et E ; Rachidatou (agent communal) consulte E en lecture.

## 2. Parcours

Convention des tableaux : **Champs** ce que l'utilisateur saisit ; **Automatique** ce qui est prérempli ou déduit et son origine ; **Bouton** le bouton principal unique ; **Erreurs** les messages ; **Hors ligne** ce qui change sans réseau ; **Composants** existants à réutiliser (`ui/`, `forms/`, `data-display/`, `feedback/`) puis à créer, marqués « à créer ».

### 2.A Enregistrement d'une exploitation par l'agent (hors connexion)

Point d'entrée : espace agent, bouton « Enregistrer une exploitation », ou fiche producteur existante → « Ajouter une exploitation ». `StepIndicator` affiche six étapes ; le retour arrière est toujours possible ; « Enregistrer et finir plus tard » est disponible à chaque étape.

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Composants |
|---|---|---|---|---|---|---|---|
| A1 Producteur | Rattacher l'exploitation à un producteur | 1 : recherche producteur (nom ou numéro) ; ou bouton « Nouveau producteur » qui ouvre le parcours d'enrôlement (auth §2.b, écrans B2 à B4) | Liste des producteurs de la commune depuis le cache local (`referentiel.farmers`) ; derniers producteurs vus en premier ; numéro via `PhoneField` avec Contact Picker si nouveau. | « Continuer » | « Aucun producteur trouvé : créez-le. » | Recherche locale seule ; un producteur créé hors ligne porte un identifiant client et une pastille « à synchroniser ». | `Input`, `Command` (recherche), `PhoneField`, `Badge` ; à créer : `EntityPicker` (liste locale filtrable, résultat récent en tête) |
| A2 Position du siège | Localiser l'exploitation et déduire commune, arrondissement, village | 1 : village (liste filtrée) ; commune et arrondissement affichés, modifiables par lien | Position GPS (`Geolocation`, haute précision) → commune et arrondissement par point-dans-polygone sur les géométries embarquées (`referentiel.territory`), en ligne via `/api/v1/territory/locate?lng&lat` si le cache manque ; villages de l'arrondissement proposés en premier ; précision affichée (`GpsPrecisionHint`). | « Continuer » | « Position imprécise (250 m) : vérifiez la commune. » ; « Hors de vos communes affectées : demandez une affectation à votre superviseur. » ; sans GPS : « Position indisponible : choisissez la commune. » | Totalement local ; l'arrondissement peut rester vide si sa géométrie manque, l'agent choisit dans la liste. | `Select`, `Alert` `watch` ; à créer : `GpsPrecisionHint`, `LocationPicker` (carte MapLibre hors ligne, marqueur déplaçable) |
| A3 Type et taille | Caractériser l'exploitation | 3 : superficie totale (nombre + unité : hectare, « kanti », « plateau » selon la commune), mode de faire-valoir (propriétaire, locataire, familial : trois boutons), irrigation (aucune, manuelle, goutte-à-goutte, inondation) | Unité locale proposée selon la commune (`referentiel.units`) ; si des parcelles ont déjà été tracées (A4), superficie = somme des surfaces calculées, origine « depuis le tracé ». | « Continuer » | « Indiquez la superficie ou tracez une parcelle à l'étape suivante. » ; « 120 ha est très élevé pour une exploitation familiale : confirmez. » (non bloquant) | Local. | `Input` `inputMode="decimal"`, `Select`, `RadioGroup` en grands boutons ; à créer : `UnitAmountField` (nombre + unité + équivalent affiché) |
| A4 Parcelles | Décrire une ou plusieurs parcelles | 0 à l'écran : liste des parcelles ajoutées, bouton « Ajouter une parcelle » qui ouvre le parcours B ; lien « Sans parcelle pour l'instant » | Surface calculée et méthode (marche GPS, dessin, déclarée) reprises de B ; cultures proposées à l'écran B4. | « Continuer » | « La somme des parcelles (4,2 ha) dépasse la superficie déclarée (3 ha) : corrigez ou gardez. » (non bloquant, `Alert` `watch`) | Local. | `Card`, `Badge`, `ReliabilityBadge`, `EmptyState` ; à créer : `ParcelList` (ligne = nom, surface, méthode, cultures) |
| A5 Cultures de la campagne | Déclarer ce qui est cultivé, par parcelle ou pour toute l'exploitation | 1 : cultures (multi-sélection de pictogrammes, 1 à 3 par parcelle) ; sous-saison (grande saison, petite saison, contre-saison) | Cultures proposées dans l'ordre des systèmes dominants de la zone agro-écologique de la commune et de la sous-saison en cours (`referentiel.crops`, `AGRO_ECOLOGICAL_ZONES`, `SEASON_TEMPLATES`) ; campagne = campagne ouverte ; sous-saison déduite du mois. | « Continuer » | « Choisissez au moins une culture ou passez. » ; « Le coton n'est pas habituel dans cette zone : confirmez. » (non bloquant, alimente les contrôles qualité) | Local. | `CropGlyph` 48 px, `Badge` ; à créer : `CropPicker` (grille de pictogrammes, cultures de la zone d'abord, « Autres » repliées) |
| A6 Consentement et récapitulatif | Créer l'exploitation | 1 : case de consentement (déjà donné à l'enrôlement → préremplie et verrouillée avec la date) ; bouton « Lire au producteur » | Récapitulatif complet avec origine de chaque valeur ; statut `DECLARED` ; agent, date, position. | « Enregistrer » | « Le consentement est nécessaire. » | La commande `farm.create` (et `parcel.create`, `cropSeason.declare`) entre dans `outbox` ; l'exploitation apparaît immédiatement dans la liste locale avec la pastille « à synchroniser ». | `Card`, `Checkbox`, `ReliabilityBadge`, `SourceCaption` ; à créer : `ListenButton`, `SyncStatusChip` |
| A7 Fait | Enchaîner | 0 | Code d'exploitation provisoire (`BJ-<DEP>-<COM>-` + suffixe client, remplacé par le code serveur à la synchronisation, l'ancien reste alias). | « Enregistrer une autre exploitation » ; liens « Voir la fiche », « Planifier la visite » | — | Local. | `Button`, `Card` |

Reprise : la liste « En cours » (espace agent, onglet Registre) affiche les brouillons avec producteur, étape atteinte, date ; un tap reprend à l'étape suivante. Un brouillon de plus de 30 jours est signalé, jamais supprimé automatiquement.

Résolution de conflit simple (au retour de synchronisation) : si le serveur renvoie `CONFLICT` sur `farm.update` (l'exploitation a été modifiée ailleurs), l'agent voit un écran à deux colonnes « Votre saisie » / « Version enregistrée », champ par champ, avec pour chaque champ un bouton « Garder la mienne » ou « Prendre celle-là » ; la règle par défaut applique ADR-0005 (la vérification terrain l'emporte, sinon la dernière écriture) et l'écran ne s'ouvre que pour les champs divergents. Les créations (`*.create`) ne créent jamais de conflit : l'identifiant client est unique.

### 2.B Tracé de parcelle

Ouvert depuis A4 ou depuis la fiche exploitation (« Ajouter une parcelle », « Relever le contour »). Trois méthodes, présentées comme trois grands boutons sur B1, chacune conduisant à B4.

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Composants |
|---|---|---|---|---|---|---|---|
| B1 Méthode | Choisir comment relever | 0 : trois boutons « Marcher le contour », « Dessiner sur la carte », « Indiquer la superficie seulement » | Méthode conseillée selon la précision GPS courante (< 10 m : marche ; sinon dessin) et selon les tuiles disponibles hors ligne. | Le choix est le bouton. | — | Local. | `Button` `h-14` × 3, `GpsPrecisionHint` |
| B2a Marche GPS | Relever en marchant | 0 : bouton « Marquer ce coin », liste des coins relevés (précision, suppression) | L'agent fait le tour du champ et appuie sur « Marquer ce coin » à chaque angle ; chaque appui moyenne 4 s de lectures GPS pour amortir le bruit du signal ; surface estimée localement (projection équirectangulaire + formule du lacet) et comparée à la déclaration dès 3 coins. | « Terminer le relevé » (actif à partir de 3 coins) | « Position indisponible : sortez à découvert et réessayez. » (mêmes messages que `LocationPicker`) | Totalement local ; le contour part comme `parcel.geometry.set` (`captureMethod: GPS_WALK`) à la prochaine synchronisation ; verrou optimiste sur `expectedVersion`. | `SurveyForm`, `GpsPrecisionHint` (`src/features/registry/parcel-survey/`) |
| B2b Dessin sur carte | Poser les sommets au doigt | 0 : tap pour poser un sommet, glisser pour déplacer, boutons « Annuler le dernier », « Fermer le contour » | Carte centrée sur le siège (A2) avec tuiles en cache ; surface affichée à chaque sommet ; magnétisme sur les sommets des parcelles voisines à moins de 5 m. | « Valider le contour » (actif à partir de 3 sommets) | « Le contour se croise : déplacez le sommet en rouge. » | Tuiles du cache seulement ; hors de la zone téléchargée, fond gris quadrillé et message « Fond de carte non téléchargé, le tracé reste possible ». | à créer : `MapDrawPolygon` (MapLibre + mode dessin maison, pas de dépendance lourde), boutons flottants 56 px en bas |
| B2c Superficie seule | Déclarer sans relevé | 2 : superficie (nombre + unité locale), position approximative (bouton « Ma position » ou carte) | Position = GPS courant ou siège de l'exploitation ; `capture_method = DECLARED_ONLY`, `centroid` renseigné, `geom` vide. | « Enregistrer » | « Indiquez une superficie supérieure à 0. » | Local. | `UnitAmountField`, `LocationPicker` |
| B3 Contrôle | Comparer déclaré et mesuré | 1 : superficie déclarée par le producteur (préremplie si connue) | Surface calculée depuis le tracé ; écart en % ; `gps_accuracy_m` moyenne ; si écart > 20 % : `Alert` `watch` « Écart de 34 % entre la surface déclarée (2 ha) et la surface mesurée (1,3 ha) » avec deux boutons « Garder la déclaration » / « Prendre la mesure ». | « Continuer » | Jamais bloquant ; l'écart est enregistré et alimente `mv_data_quality`. | Local. | `Alert`, `StatTile` (deux tuiles : déclarée, mesurée), `ReliabilityBadge` |
| B4 Nom et cultures | Nommer et préremplir les cultures | 3 : nom court de la parcelle (« Champ du bas »), cultures (`CropPicker`), sol (facultatif : sableux, argileux, latérite) | Nom proposé « Parcelle 1, 2… » ; cultures proposées comme en A5. | « Ajouter la parcelle » | — | Local ; commande `parcel.create` avec la géométrie en GeoJSON. | `Input`, `CropPicker`, `Select` |

Précision d'un tracé : la surface est calculée localement avec la même formule que `ringAreaHa` du générateur (projection locale, lacet), pour que l'agent voie la valeur que le serveur enregistrera à ± 0,5 %.

### 2.C Déclaration de récolte

Par l'agriculteur (espace agriculteur, bouton « Déclarer ma récolte », 56 px, thème clair, audio) ou par l'agent depuis la fiche d'un producteur (« Déclarer une récolte pour ce producteur »). Trois questions, trois écrans, un bouton chacun.

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Composants |
|---|---|---|---|---|---|---|---|
| C1 Quelle culture ? | Choisir la culture récoltée | 1 : culture (pictogrammes 48 px) | Seules les cultures déclarées sur les parcelles du producteur pour la campagne en cours sont proposées, dans l'ordre des dates de récolte attendues (`calendar.harvest`) ; si une seule culture, écran sauté. Parcelle demandée seulement s'il y en a plusieurs avec cette culture. | « C'est celle-ci » | « Aucune culture déclarée cette campagne : demandez à votre agent d'ajouter vos cultures. » | Local (cache du producteur, ou données du jeton). | `CropPicker`, `ListenButton` |
| C2 Combien ? | Saisir la quantité | 2 : quantité (grand clavier numérique), unité (boutons : sac de 100 kg, bassine, tas, régime, kg) | Unité par défaut = `tradeUnit` de la culture ; équivalent en kg affiché sous le champ (« ≈ 800 kg ») avec le facteur de conversion indicatif ; rendement implicite comparé au rendement indicatif : « c'est 3 fois plus que d'habitude pour 1 ha, vérifiez » (non bloquant). | « Continuer » | « Indiquez une quantité. » | Local ; commande `harvest.declare`. | `UnitAmountField` en grand format, `Alert` `info` |
| C3 Qualité et pertes (facultatif) | Qualifier | 2 : pertes (aucune / un peu / beaucoup : trois boutons avec pictogrammes), cause si pertes (sécheresse, inondation, ravageurs, stockage, autre) | Rien. Lien « Passer » très visible. | « Enregistrer ma récolte » | — | Local. | `RadioGroup` en grands boutons |
| C4 Merci | Confirmer | 0 | Résumé en une phrase et en audio : « Maïs, 8 sacs de 100 kg, parcelle du bas, campagne 2025-2026. » ; message WhatsApp de confirmation envoyé à la synchronisation. | « Retour à mon exploitation » | — | « Sera envoyé dès que le réseau revient » avec `SyncStatusChip`. | `Card`, `SyncStatusChip` |

Version agent : mêmes écrans, avec en plus le choix du producteur (A1) en tête et la mention `declared_by = AGENT` ; l'agent peut saisir plusieurs récoltes à la suite (« Déclarer une autre récolte »).

### 2.D File de vérification de l'agent

Espace agent, onglet « À vérifier ». Liste des exploitations `DECLARED` de ses communes affectées, priorisée.

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Composants |
|---|---|---|---|---|---|---|---|
| D1 File | Choisir la prochaine visite | 0 : filtres par village et par priorité (`Tabs` : « Prioritaires », « Proches », « Toutes ») | Priorité calculée localement : écart déclaré / mesuré > 20 %, doublon probable, superficie > 10 ha, ancienneté > 60 jours, demande de changement de numéro en attente ; distance depuis la position courante ; regroupement par village pour organiser une tournée. | Tap sur une ligne | « Aucune exploitation à vérifier dans vos communes. » (`EmptyState`) | Liste depuis le cache ; mise à jour à la synchronisation. | `Tabs`, `Table` ou liste de `Card`, `Badge` (motif de priorité), `EmptyState` ; à créer : `PriorityBadge` |
| D2 Préparer la visite | Voir ce qui est à contrôler | 0 | Fiche résumée (E1) avec les points à vérifier en tête : « Superficie déclarée 3 ha, aucun tracé », « Numéro à confirmer ». Bouton « Itinéraire » (ouvre l'application de cartes du téléphone). | « Commencer la visite » | — | Local. | `Card`, `Alert` `info`, `ReliabilityBadge` |
| D3 Visite | Contrôler sur place | 3 au plus par sous-écran : (a) identité confirmée (oui / non), (b) parcelles : « Relever le contour » (parcours B) ou « Confirmer la position » ; (c) photo facultative (siège, parcelle, pièce d'identité) | Position GPS et heure enregistrées à l'ouverture ; photo compressée (1600 px, ≤ 300 Ko) et stockée dans `attachments` locales ; méthode `FIELD_VISIT`. | « Valider la visite » | « Confirmez l'identité du producteur avant de valider. » ; « Vous êtes à 4 km de l'exploitation déclarée : la position de la visite sera enregistrée, le siège peut être corrigé. » | Local ; commandes `verification.record` puis `farm.update` (statut) et `attachment.upload` (envoyée en dernier, sur Wi-Fi ou réseau mobile selon la préférence). | `Checkbox`, `Sheet` bas, `Button` ; à créer : `PhotoCapture` (caméra, aperçu, compression), `VisitChecklist` |
| D4 Résultat | Clore | 1 : issue (confirmée, corrigée, rejetée) et note courte si corrigée ou rejetée | Statut d'exploitation → `FIELD_VERIFIED` si confirmée ou corrigée avec relevé ; `AGENT_VERIFIED` si confirmée sans relevé ; `DISPUTED` si rejetée. | « Terminer » | « Une note est nécessaire pour un rejet. » | Local. | `RadioGroup`, `Textarea`, `ReliabilityBadge` |

### 2.E Fiche exploitation et historique

Deux rendus d'un même contenu : espace agriculteur (une colonne, chiffres très grands, pictogrammes, audio, pas d'onglets) et espace agent (onglets, actions).

| Écran | Objectif | Contenu | Automatique | Actions | Hors ligne | Composants |
|---|---|---|---|---|---|---|
| E1 Résumé | Voir l'essentiel | Nom du producteur, code, commune et village, superficie déclarée et mesurée avec `ReliabilityBadge`, cultures de la campagne en pictogrammes, dernière récolte, alertes actives, statut de synchronisation | Carte statique du siège et des parcelles (image des tuiles en cache, pas de carte interactive sur l'espace agriculteur). | Agriculteur : « Déclarer ma récolte », « Mes alertes ». Agent : « Modifier », « Ajouter une parcelle », « Déclarer une récolte », « Planifier une visite », « Changer le numéro ». | Fiche complète depuis le cache ; les modifications en attente sont marquées. | `StatTile` × 3, `CropGlyph`, `ReliabilityBadge`, `SourceCaption`, `Badge`, `SyncStatusChip` ; à créer : `StaticMapThumbnail` |
| E2 Parcelles (agent : onglet ; agriculteur : section) | Lister les parcelles | Nom, surface déclarée et mesurée, méthode de relevé, cultures, précision GPS | Tri par surface. | « Relever le contour », « Modifier les cultures » | Local. | `ParcelList`, `MapDrawPolygon` en lecture |
| E3 Historique par campagne | Relire les campagnes | Sélecteur de campagne ; par campagne : cultures, superficies, récoltes déclarées (quantité, unité, équivalent kg), vérifications, événements (`FarmEvent`) en fil chronologique | Campagne ouverte par défaut ; comparaison avec la campagne précédente en un chiffre (« +12 % de maïs »). | — | Trois dernières campagnes en cache ; au-delà, en ligne seulement avec message. | `Tabs` (agent) ou `Select` (agriculteur), `Table` (agent) ou liste de `Card`, `StatTile` avec tendance, `SourceCaption` ; à créer : `EventTimeline` |
| E4 Activité et synchronisation (agent) | Voir ce qui est parti ou en attente | Commandes de l'exploitation dans `outbox` avec état, dernière erreur, bouton « Réessayer » | — | « Réessayer », « Voir le conflit » | Local. | `Table`, `Badge`, `Alert` `critical` ; à créer : `OutboxList` |

### 2.F Premier lancement de la PWA agent

Après la première connexion de l'agent (auth §2.a) et avant le parcours d'accueil de son rôle (auth §2.f). Requiert le réseau ; recommandé en Wi-Fi.

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Composants |
|---|---|---|---|---|---|---|---|
| F1 Vos communes | Choisir ce qui sera disponible sans réseau | 1 : communes à télécharger (cases précochées) | Communes affectées à l'agent précochées ; taille estimée par commune (référentiel + géométries + tuiles jusqu'au zoom 14 + producteurs connus), total affiché ; réseau détecté (Wi-Fi, 4G, 2G) et durée estimée. | « Télécharger (38 Mo) » | « Espace insuffisant : libérez 60 Mo ou retirez une commune. » | Sans réseau : « Connectez-vous une fois pour préparer le hors-ligne » ; l'application reste utilisable en lecture des données du jeton. | `Checkbox`, `Card`, `Badge` ; à créer : `DownloadPlanner` |
| F2 Téléchargement | Suivre et expliquer | 0 | Barre de progression par bloc (référentiel, cartes, producteurs) ; reprise automatique après coupure ; explication en trois cartes défilantes : « Tout fonctionne sans réseau », « Vos saisies partent seules au retour du réseau », « Le badge en haut vous dit ce qui est en attente ». | « Continuer » (actif à la fin) ; « Continuer sans les cartes » après le bloc référentiel | « Téléchargement interrompu : il reprendra automatiquement. » | Reprise à la connexion suivante. | `Skeleton`, `Alert` `info` ; à créer : `DownloadProgress` |
| F3 Prêt | Vérifier et démarrer | 0 | Contrôle automatique : coupe le réseau virtuellement (mode avion simulé) et ouvre un écran de test « Cherchez un village de votre commune » pour montrer que la recherche fonctionne hors ligne. | « Commencer » | — | Local. | `Input`, `Command`, `Card` |

Le référentiel est versionné (`referentiel.meta.version`) ; à chaque synchronisation, le serveur renvoie la version courante et l'application télécharge le différentiel en arrière-plan.

## 3. Composants

### 3.1 Existants à réutiliser

`Button` (56 px sur l'espace agriculteur, 44 px sur l'espace agent), `Input`, `Select`, `Checkbox`, `RadioGroup`, `Form` (react-hook-form et Zod, un schéma par écran), `Card`, `Sheet` `side="bottom"`, `Tabs` (agent seulement), `Table` (agent seulement), `Badge`, `Alert` (`info`, `watch`, `critical`), `Skeleton`, `EmptyState`, `OfflineBanner`, `StatTile`, `ReliabilityBadge`, `SourceCaption`, `CropGlyph`, `PhoneField`, `OtpInput` (changement de numéro), `StepIndicator`, `CountdownText`.

### 3.2 À créer

| Composant | Rôle | Points d'attention |
|---|---|---|
| `EntityPicker` | Recherche locale dans une liste Dexie (producteurs, villages) avec récents en tête | Recherche insensible aux accents ; résultat sélectionnable au clavier |
| `LocationPicker` | Carte MapLibre hors ligne avec marqueur déplaçable et bouton « Ma position » | Fond gris quadrillé hors zone téléchargée ; ne bloque jamais |
| `GpsPrecisionHint` | Précision en mètres, couleur et texte, bouton « Actualiser » | `aria-live="polite"` ; seuils 10 / 25 m |
| `UnitAmountField` | Nombre + unité locale + équivalent (kg ou ha) affiché | Clavier numérique ; facteurs de conversion depuis `referentiel.units` |
| `CropPicker` | Grille de pictogrammes, cultures de la zone d'abord, multi-sélection bornée | 48 px, libellé sous chaque pictogramme, « Autres » replié |
| `ParcelList` | Liste de parcelles avec surface, méthode, cultures | Lignes de 56 px, action « Relever » |
| `GpsWalkRecorder` | Relevé par marche : carte, points, distance, surface, précision, pause | Écriture du brouillon toutes les 10 s ; `Wake Lock` ; sons désactivables |
| `MapDrawPolygon` | Dessin de polygone sur MapLibre : poser, déplacer, annuler, fermer | Détection d'auto-intersection ; magnétisme sur voisins ; boutons flottants 56 px |
| `PhotoCapture` | Caméra, aperçu, compression 1600 px ≤ 300 Ko, stockage local | Pas de visage imposé ; suppression avant envoi possible |
| `VisitChecklist` | Liste de contrôles d'une visite, chaque item validable d'une main | État persistant dans le brouillon |
| `PriorityBadge` | Motif de priorité en un mot | Couleur + texte |
| `SyncStatusChip` | Pastille d'état de synchronisation (à jour, N en attente, en cours, erreur) | Toujours visible sur l'espace agent ; tap → `OutboxList` |
| `OutboxList` | Commandes en attente avec état, erreur, « Réessayer », « Voir le conflit » | Erreur lisible en français, jamais de trace technique |
| `ConflictResolver` | Deux colonnes champ par champ, « Garder la mienne » / « Prendre celle-là » | N'affiche que les champs divergents ; règle ADR-0005 par défaut |
| `StaticMapThumbnail` | Image du siège et des parcelles depuis les tuiles en cache | Pas d'interaction sur l'espace agriculteur |
| `EventTimeline` | Fil chronologique des `FarmEvent` | Une ligne par événement, date relative puis absolue |
| `DownloadPlanner`, `DownloadProgress` | Choix des communes à embarquer, suivi du téléchargement par bloc | Taille et durée estimées ; reprise automatique |
| `ListenButton` | Lecture audio du titre et de la consigne | Repris de la spécification d'authentification |

## 4. Modèle de données local (Dexie)

Base `bais-agent`, chiffrée applicativement (clé dérivée de la session, effacée à la déconnexion), une base par utilisateur connecté.

| Table | Clé | Index | Contenu |
|---|---|---|---|
| `drafts` | `id` (UUIDv7 client) | `kind`, `updatedAt`, `farmerId`, `farmId` | Brouillons de parcours : `kind` (`FARM_ENROLMENT`, `PARCEL_CAPTURE`, `HARVEST_DECLARATION`, `FIELD_VISIT`), `step` atteint, `data` (état du formulaire, points GPS, photos en référence), `createdAt`, `updatedAt`, `status` (`IN_PROGRESS`, `SUBMITTED`, `ABANDONED`) |
| `outbox` | `id` (UUIDv7 client) | `status`, `clientCreatedAt`, `sequence` | Commandes à envoyer (voir §5) : `type`, `payload`, `idempotencyKey`, `clientCreatedAt`, `sequence` (ordre d'envoi), `dependsOn` (identifiants de commandes précédentes), `status` (`PENDING`, `SENDING`, `APPLIED`, `DUPLICATE`, `REJECTED`, `CONFLICT`), `attempts`, `lastError`, `serverResult` |
| `attachments` | `id` | `ownerId`, `status` | Photos en attente : `blob`, `mime`, `sha256`, `capturedAt`, `gpsPoint`, `ownerType`, `ownerId`, `status` (`PENDING`, `UPLOADED`) |
| `entities.farmers` | `id` | `communeCode`, `phone`, `displayName` | Producteurs connus de l'agent (communes affectées), avec `syncState` (`SYNCED`, `LOCAL_ONLY`, `MODIFIED`) |
| `entities.farms` | `id` | `farmerId`, `communeCode`, `verificationStatus`, `updatedAt` | Exploitations avec parcelles imbriquées (`parcels[]`), cultures de la campagne, dernière récolte, `syncState`, `version` serveur |
| `entities.events` | `id` | `farmId`, `occurredAt` | `FarmEvent` des trois dernières campagnes |
| `referentiel.meta` | `key` | — | `version`, `downloadedAt`, `communes[]`, `campaign` ouverte, `seasonTemplates` |
| `referentiel.territory` | `code` | `kind`, `parentCode` | Communes, arrondissements, villages des communes embarquées, géométries simplifiées (GeoJSON) pour le point-dans-polygone |
| `referentiel.crops` | `code` | `category` | Référentiel des cultures avec zones, calendrier, unité, rendement indicatif |
| `referentiel.units` | `code` | `communeCode` | Unités locales et facteurs de conversion vers le kilogramme ou l'hectare |
| `referentiel.zones` | `code` | — | Zones agro-écologiques et rattachement des communes |
| `tiles` | `key` (`z/x/y`) | `communeCode` | Tuiles vectorielles des communes embarquées, jusqu'au zoom 14 (gérées par Serwist, référencées ici pour le calcul de taille) |

Règles : `drafts` et `outbox` ne sont jamais purgés automatiquement tant qu'une commande n'est pas `APPLIED` ou `DUPLICATE` ; les entrées `APPLIED` sont conservées 7 jours pour l'affichage de l'historique de synchronisation ; les `attachments` `UPLOADED` sont supprimés dès confirmation.

## 5. Contrat de la commande de synchronisation

Cohérent avec docs/04 §10 (`SyncCommand`) et ADR-0005. Envoi par lots ordonnés vers `POST /api/v1/sync`, au plus 50 commandes par lot, dans l'ordre de `sequence`.

```ts
/** Une commande de l'outbox, telle qu'envoyée au serveur. */
export interface SyncCommand<TType extends SyncCommandType = SyncCommandType> {
  /** Identifiant client, UUIDv7, aussi utilisé comme clé d'idempotence. */
  id: string;
  type: TType;
  /** Charge utile validée par le schéma Zod propre au type. */
  payload: SyncPayload[TType];
  /** Unique par commande ; le serveur rejoue une clé déjà vue en renvoyant le premier résultat. */
  idempotencyKey: string;
  /** Horodatage de création côté client, ISO 8601 avec fuseau. */
  clientCreatedAt: string;
  /** Appareil émetteur, lié au compte agent (docs/06 §2). */
  deviceId: string;
  /** Commandes qui doivent être appliquées avant celle-ci (créations parentes). */
  dependsOn?: string[];
  /** Version serveur connue de l'entité modifiée ; sert à détecter les conflits sur les mises à jour. */
  expectedVersion?: number;
}

export type SyncCommandType =
  | "farmer.create"
  | "farmer.update"
  | "farmer.phoneChange"
  | "farm.create"
  | "farm.update"
  | "parcel.create"
  | "parcel.update"
  | "parcel.geometry.set"
  | "cropSeason.declare"
  | "harvest.declare"
  | "verification.record"
  | "attachment.upload";

/** Enveloppe de réponse, une entrée par commande envoyée, dans le même ordre. */
export interface SyncResult {
  id: string;
  outcome: "APPLIED" | "DUPLICATE" | "REJECTED" | "CONFLICT";
  /** État canonique renvoyé après application (identifiants et codes serveur, version). */
  entity?: { type: string; id: string; code?: string; version: number };
  /** Erreur lisible en français et code stable pour l'interface. */
  error?: { code: string; message: string; field?: string };
  /** Pour CONFLICT : la version serveur des champs divergents. */
  conflict?: { serverVersion: number; fields: Record<string, unknown> };
}
```

Charges utiles principales (`SyncPayload`) :

| Type | Charge utile | Notes |
|---|---|---|
| `farmer.create` | `{ id, firstName, lastName, gender, birthYear?, phone?, secondaryPhone?, communeCode, villageCode?, nationalId?: { kind, value }, consentAt, linguisticArea? }` | `id` = UUIDv7 client, réutilisé par `farm.create` ; le NPI est chiffré au repos côté client comme côté serveur |
| `farm.create` | `{ id, farmerId, communeCode, arrondissementCode?, villageCode?, location: [lng, lat], locationAccuracyM?, declaredAreaHa, areaUnit, tenure, irrigation, consentAt }` | `dependsOn: [farmer.create.id]` si le producteur est nouveau |
| `parcel.create` | `{ id, farmId, name, declaredAreaHa?, geometry?: GeoJSON.Polygon, centroid: [lng, lat], captureMethod, gpsAccuracyM?, gpsTrack?: [lng, lat, accuracyM, at][], soilType? }` | `dependsOn: [farm.create.id]` ; la surface calculée est recalculée par le serveur (PostGIS) et renvoyée |
| `parcel.geometry.set` | `{ parcelId, geometry, captureMethod, gpsAccuracyM, expectedVersion }` | Remplace un contour ; conflit si `expectedVersion` dépassé |
| `cropSeason.declare` | `{ id, parcelId, cropCode, campaignCode, seasonCode, areaHa? }` | Unique (parcelle, culture, campagne, sous-saison) : un doublon renvoie `DUPLICATE` |
| `harvest.declare` | `{ id, cropSeasonId, declaredQuantity, unitCode, declaredOn, declaredBy: "FARMER" \| "AGENT", lossesPct?, lossCause?, priceHintFcfaPerKg? }` | `quantity_kg` calculé par le serveur avec le facteur de l'unité |
| `verification.record` | `{ id, farmId, parcelId?, kind: "FIELD_VISIT", outcome, notes?, visitedAt, gpsPoint, identityConfirmed, attachmentIds? }` | Fait passer le statut de l'exploitation ; `dependsOn` les `parcel.geometry.set` de la visite |
| `attachment.upload` | multipart : métadonnées `{ id, ownerType, ownerId, kind, sha256, capturedAt, gpsPoint? }` + fichier | Envoyée en dernier et séparément (taille) ; le serveur vérifie `sha256` |
| `farmer.phoneChange` | `{ farmerId, newPhone, verifiedBy: "AGENT", method, expectedVersion }` | Déclenche la révocation des sessions du producteur (auth §2.e) |

Comportement client :

- Un lot est envoyé quand le réseau revient (`online`), toutes les 5 minutes en arrière-plan quand il y a des commandes `PENDING`, et à la demande depuis `SyncStatusChip`.
- `REJECTED` : la commande passe en erreur, la saisie reste dans le brouillon, l'agent voit le message (« Superficie invalide : 0 ha ») et corrige ; les commandes qui en dépendent restent `PENDING`.
- `CONFLICT` : ouverture de `ConflictResolver` ; la résolution produit une nouvelle commande `*.update` avec `expectedVersion` = version serveur.
- `DUPLICATE` : traité comme `APPLIED` (le serveur renvoie le résultat de la première application).
- Après `APPLIED`, les identifiants et codes serveur remplacent les valeurs provisoires dans `entities.*`, les anciens identifiants clients restent en alias pour les brouillons ouverts.

## 6. Points à trancher avant implémentation

- Facteurs de conversion des unités locales par commune (`referentiel.units`) : source (enquête ATDA) et niveau `ESTIMATED` à afficher.
- Zoom maximal des tuiles embarquées (14 proposé) et taille cible par commune (< 40 Mo) ; à mesurer avec les tuiles réelles de l'étape 4.
- Seuils GPS (5 m entre points, 15 m de précision acceptée, 8 m de fermeture) : à valider sur le terrain avec deux téléphones d'entrée de gamme.
- Photo de visite : stockage local chiffré ou non (poids), durée de conservation avant envoi, envoi en 2G ou attente du Wi-Fi.
- `arrondissement` : les géométries manquent pour une partie des communes (docs/08 §2.2) ; le champ reste facultatif tant qu'elles ne sont pas chargées.
