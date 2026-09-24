# 09 — Intégrations externes : wapy.pro, ANIP, météo, IA

> Rédigé par : Architecte logiciel et Expert cybersécurité.
> Règle commune : chaque intégration est un **port** (interface TypeScript dans `src/services/ports/`) avec au moins deux adaptateurs — le fournisseur réel et une version de test ou de simulation. L'application démarre et se démontre sans aucune intégration réelle.

## 1. wapy.pro

### Ce que nous avons constaté

wapy.pro, développé par le porteur du projet, est un assistant WhatsApp pour entreprises. Son espace développeurs propose une **passerelle HTTP d'envoi de messages WhatsApp** depuis le numéro de l'entreprise, destinée aux notifications transactionnelles (codes de vérification, confirmations, reçus), avec exemples Node.js, PHP et Python, comptes par e-mail ou Google, et activation après validation. Il n'expose pas de service d'identité (OAuth2 ou OIDC) ni de gestion d'utilisateurs tierce.

### Décision

- **Non retenu comme système d'authentification ni de gestion des utilisateurs.** Ce n'est pas sa fonction, et faire dépendre l'identité d'une plateforme nationale d'un service tiers irait contre l'exigence d'indépendance.
- **Retenu comme canal de messagerie WhatsApp**, ce qui est en réalité sa contribution la plus précieuse : au Bénin, WhatsApp est le canal le plus utilisé par les producteurs équipés d'un smartphone. Il portera :
  - les codes à usage unique de connexion ;
  - les alertes agricoles (stress hydrique, excès de pluie) ;
  - les confirmations d'enregistrement et de vérification d'exploitation ;
  - les mises en relation du marché.

### Architecture d'intégration

```ts
// src/services/ports/messaging-channel.ts
interface MessagingChannel {
  readonly id: 'wapy' | 'sms' | 'email' | 'console'
  send(message: OutboundMessage): Promise<Result<DeliveryReceipt, MessagingError>>
  supports(kind: MessageKind): boolean
}
```

- Adaptateur `services/messaging/wapy/` : client HTTP minimal, authentification par clé API en variable d'environnement, réessais avec repli exponentiel, respect des limitations de débit, journalisation des reçus (`Notification.provider_message_id`).
- Le module `notifications` choisit le canal selon les préférences de l'utilisateur et la disponibilité : WhatsApp d'abord, SMS ensuite, in-app toujours.
- Un webhook entrant (`/api/v1/webhooks/wapy`) est prévu pour les accusés de réception et, plus tard, pour des réponses simples (« OK » pour accuser réception d'une alerte). Il est vérifié par signature ou secret partagé.
- **Indépendance** : le remplacement de wapy.pro par l'API WhatsApp Business officielle ou par un autre agrégateur se fait en ajoutant un adaptateur, sans toucher au domaine.

### Piste future

Si wapy.pro expose un jour un fournisseur d'identité OIDC ou une gestion de comptes multi-applications, l'emplacement `services/identity/wapy-stub/` et le fournisseur OIDC générique d'Auth.js permettent de l'ajouter comme méthode de connexion optionnelle pour les acheteurs et les coopératives déjà clients de wapy.pro. Ce ne serait jamais la méthode unique.

## 2. ANIP et NPI

### Contexte

L'Agence Nationale d'Identification des Personnes gère le Registre national des personnes physiques et attribue le NPI (numéro personnel d'identification, 10 chiffres). Une API officielle de vérification d'identité n'est pas publiquement documentée à ce jour ; la plateforme doit être prête à s'y connecter sans refonte.

### Architecture

```ts
// src/services/ports/identity-verification-provider.ts
interface IdentityVerificationProvider {
  readonly id: 'anip' | 'anip-stub'
  verify(input: { npi: string; lastName: string; birthYear?: number }): Promise<Result<IdentityVerification, IdentityVerificationError>>
}
```

- V1 : adaptateur `anip-stub` qui applique un contrôle de format et renvoie des réponses déterministes, utile pour la démonstration et les tests.
- Futur : adaptateur `anip` (REST ou OIDC selon ce que publiera l'agence) ; la seule modification hors de l'adaptateur est une variable d'environnement.
- Le NPI n'est jamais exigé pour utiliser la plateforme ; il rehausse le niveau de confiance de l'identité (`npi_verified_at`) et permet de dédoublonner.
- Stockage : haché (HMAC) pour l'unicité et chiffré (AES-GCM) pour la restitution par un rôle habilité ; voir document 06.

## 3. Météo : Open-Meteo

- API publique sans clé, licence CC BY 4.0, prévisions à 16 jours et historique (ERA5) par coordonnées, débit suffisant pour 77 communes deux fois par jour.
- Port `WeatherProvider` avec adaptateurs `open-meteo` et `fixture` (séries réalistes générées par zone agro-écologique pour la démonstration hors réseau).
- Variables : température minimale et maximale, précipitations, évapotranspiration de référence, humidité du sol de surface, vent.
- Chaque observation stockée avec `source_id = OPEN_METEO`, `reliability = OFFICIAL` pour l'historique réanalysé et `ESTIMATED` pour les prévisions.
- Évolutions : Météo-Bénin (données de stations), CHIRPS pour les précipitations satellitaires.

## 4. Assistant IA

- Port `LlmProvider` et port `EmbeddingProvider`, implémentés via le Vercel AI SDK et une passerelle (AI Gateway) qui permet de changer de modèle par configuration. Modèle par défaut : le modèle (famille 5), modèle exact fixé par variable d'environnement ; adaptateur `fixture` pour les tests.
- **Garde-fous** : le modèle ne reçoit que le contexte autorisé pour l'utilisateur ; il doit citer des passages du corpus pour toute affirmation technique ; un scoring de confiance combine la similarité des passages, la couverture des citations et une auto-évaluation ; en dessous d'un seuil, la réponse est « je ne dispose pas d'une information fiable sur ce point » avec orientation vers un agent.
- Le modèle n'a jamais accès aux chiffres officiels agrégés pour les produire lui-même : les indicateurs viennent du module `analytics` et sont insérés tels quels, avec leur source.
- Toute conversation est journalisée (sans données personnelles inutiles) pour évaluation et amélioration du corpus.

## 5. Cartographie

- Fond de carte : tuiles OpenStreetMap via un fournisseur public respectant la politique d'usage en développement ; en production, tuiles vectorielles auto-hébergées (serveur Martin ou tuiles PMTiles statiques) à partir d'un extrait OSM du Bénin, pour la souveraineté et la performance.
- Géométries administratives : geoBoundaries (CC BY 4.0) pour ADM1 et ADM2, complétées par OSM.
- Géocodage inverse : Nominatim public en développement, instance dédiée ou table locale de villages en production.

## 6. Sources futures

| Source | Usage prévu | Point d'accroche |
|---|---|---|
| MAEP / DSA | Statistiques officielles de production, référentiels de cultures | `DataSource = MAEP_DSA`, import par lots dans `analytics` |
| INStaD | Population rurale, enquêtes agricoles | pondération du dataset, comparaisons |
| Copernicus Sentinel-2 | NDVI, détection de stress, vérification de parcelles | `RasterLayer`, port `RemoteSensingProvider` |
| IGN Bénin | Référentiel géographique national | remplacement des géométries geoBoundaries |
| Institutions financières | Historique de production consenti | API partenaires OAuth2 sur `/api/v1`, consentement par agriculteur |

## 7. Variables d'environnement prévues

`DATABASE_URL`, `AUTH_SECRET`, `NPI_HASH_KEY`, `NPI_ENCRYPTION_KEY`, `MESSAGING_PRIMARY_CHANNEL`, `WAPY_API_URL`, `WAPY_API_KEY`, `WAPY_WEBHOOK_SECRET`, `WEATHER_PROVIDER` (`open-meteo` ou `fixture`), `AI_PROVIDER` (`gateway` ou `fixture`), `AI_GATEWAY_API_KEY`, `AI_MODEL`, `IDENTITY_VERIFICATION_PROVIDER` (`anip-stub` ou `anip`), `TILES_BASE_URL`, `CRON_SECRET`. Toutes documentées dans `.env.example` et validées au démarrage.
