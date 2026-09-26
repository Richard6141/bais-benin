import { ruleSchema, type Rule, type RuleSpec } from "./definition";

// Règles d'alerte par défaut pour le Bénin. Tous les seuils sont INDICATIFS, À VALIDER AVEC
// L'ATDA et l'INRAB avant diffusion aux producteurs. Repères utilisés :
// - jour sec : moins de 1 mm (convention FAO et agrométéorologie sahélienne) ;
// - poche de sécheresse : 10 jours secs consécutifs après semis compromettent la levée du maïs,
//   du sorgho et du niébé (FAO, Crop Water Information ; fiches techniques INRAB) ;
// - stress sévère : 15 jours secs et un bilan pluie moins ET0 inférieur à −40 mm sur 10 jours,
//   soit une ET0 de 4 à 5 mm/j non compensée (FAO-56) ;
// - inondation : plus de 120 mm en 3 jours ou 100 mm en un jour saturent les sols de bas-fond
//   (seuils d'alerte usuels des services météorologiques ouest-africains) ;
// - chaleur à la floraison du maïs : au-delà de 35 °C, le pollen perd sa viabilité (FAO, CIMMYT) ;
//   seuil retenu 38 °C en maximum et 36 °C en moyenne sur 3 jours ;
// - chenille légionnaire d'automne (Spodoptera frugiperda) : pullulations favorisées par une
//   reprise des pluies après une période sèche, sur maïs jeune, nuits chaudes (FAO, programme
//   FAW ; observations INRAB) ;
// - fortes pluies prévues : 80 mm en 3 jours justifient de différer semis et épandages ;
// - épidémie probable (ADR-0015) : 3 exploitations distinctes signalant le même problème à moins
//   de 5 km en 7 jours, valeurs de départ de la feuille de route, à ajuster avec l'ATDA et les
//   services vétérinaires une fois les premiers signalements reçus.

const specs: RuleSpec[] = [
  {
    code: "WATER_STRESS_EARLY_V1",
    version: 1,
    name: "Poche de sécheresse après semis",
    description:
      "Au moins 10 jours secs consécutifs et moins de 5 mm de pluie en 10 jours alors que des cultures sont semées ou en croissance.",
    severity: "WARNING",
    category: "WATER_STRESS",
    cooldownHours: 72,
    definition: {
      all: [
        { indicator: "crop_stage_in", value: ["SOWN", "GROWING"] },
        { indicator: "dry_days_consecutive", op: ">=", value: 10 },
        { indicator: "rain_sum_10d", op: "<", value: 5 },
      ],
    },
    messageFr:
      "{commune} : {dry_days_consecutive} jours sans pluie utile ({rain_sum_10d} mm en 10 jours). Les semis récents risquent de ne pas lever.",
    messageShort:
      "BAIS {commune} : {dry_days_consecutive} jours sans pluie. Semis en danger, paillez et attendez 20 mm de pluie avant de ressemer.",
    adviceFr:
      "Paillez les jeunes plants, retardez les nouveaux semis jusqu'à une pluie d'au moins 20 mm et ne mettez pas d'engrais sur sol sec.",
  },
  {
    code: "WATER_STRESS_SEVERE_V1",
    version: 1,
    name: "Stress hydrique sévère",
    description:
      "Au moins 15 jours secs consécutifs et un bilan pluie moins évapotranspiration inférieur à −40 mm sur 10 jours, cultures en place.",
    severity: "CRITICAL",
    category: "WATER_STRESS",
    cooldownHours: 72,
    definition: {
      all: [
        { indicator: "crop_stage_in", value: ["SOWN", "GROWING"] },
        { indicator: "dry_days_consecutive", op: ">=", value: 15 },
        { indicator: "water_balance_10d", op: "<", value: -40 },
      ],
    },
    messageFr:
      "{commune} : stress hydrique sévère, {dry_days_consecutive} jours secs et un déficit de {water_balance_10d} mm sur 10 jours. Des pertes de rendement sont probables.",
    messageShort:
      "BAIS {commune} : sécheresse sévère, {dry_days_consecutive} jours secs. Irriguez si possible, protégez les jeunes plants, contactez votre agent.",
    adviceFr:
      "Irriguez en priorité les parcelles semées, paillez, suspendez les engrais et signalez les parcelles perdues à votre agent pour un ressemis.",
  },
  {
    code: "FLOOD_RISK_V1",
    version: 1,
    name: "Excès de pluie, risque d'inondation",
    description: "Plus de 120 mm en 3 jours, ou plus de 100 mm en une seule journée.",
    severity: "WARNING",
    category: "FLOOD",
    cooldownHours: 48,
    definition: {
      any: [
        { indicator: "rain_sum_3d", op: ">=", value: 120 },
        { indicator: "rain_max_1d", op: ">=", value: 100 },
      ],
    },
    messageFr:
      "{commune} : {rain_sum_3d} mm de pluie en 3 jours. Les bas-fonds et les parcelles proches des cours d'eau risquent d'être inondés.",
    messageShort:
      "BAIS {commune} : {rain_sum_3d} mm en 3 jours, risque d'inondation. Dégagez les rigoles, mettez les récoltes stockées à l'abri.",
    adviceFr:
      "Curez les rigoles de drainage, surélevez les récoltes stockées et évitez de traverser les bas-fonds inondés.",
  },
  {
    code: "HEAT_MAIZE_FLOWERING_V1",
    version: 1,
    name: "Vague de chaleur sur maïs en croissance",
    description:
      "Maximum d'au moins 38 °C et moyenne des maximales d'au moins 36 °C sur 3 jours, maïs en croissance (période de floraison).",
    severity: "WARNING",
    category: "HEAT",
    cooldownHours: 72,
    definition: {
      all: [
        { indicator: "crop_in", value: ["MAIZE"] },
        // Floraison : stade déclaré par l'agent ; la croissance couvre les parcelles sans stade précis.
        { indicator: "crop_stage_in", value: ["GROWING", "FLOWERING"] },
        { indicator: "temp_max_max_3d", op: ">=", value: 38 },
        { indicator: "temp_max_avg_3d", op: ">=", value: 36 },
      ],
    },
    messageFr:
      "{commune} : jusqu'à {temp_max_max_3d} °C ces trois derniers jours. Au moment de la floraison, le maïs peut perdre une partie de ses grains.",
    messageShort:
      "BAIS {commune} : {temp_max_max_3d} °C, chaleur sur le maïs en fleur. Arrosez tôt le matin si possible, surveillez la formation des épis.",
    adviceFr:
      "Arrosez tôt le matin ou en soirée si vous le pouvez, ne désherbez pas en pleine chaleur et surveillez la formation des épis.",
  },
  {
    code: "HEAVY_RAIN_FORECAST_V1",
    version: 1,
    name: "Fortes pluies prévues",
    description: "Au moins 80 mm de pluie prévus sur les 3 prochains jours.",
    severity: "WATCH",
    category: "FLOOD",
    cooldownHours: 24,
    definition: { indicator: "forecast_rain_sum_3d", op: ">=", value: 80 },
    messageFr:
      "{commune} : {forecast_rain_sum_3d} mm de pluie sont prévus sur les trois prochains jours. Différez les épandages et protégez les récoltes.",
    messageShort:
      "BAIS {commune} : {forecast_rain_sum_3d} mm de pluie prévus en 3 jours. Reportez engrais et traitements, abritez vos récoltes.",
    adviceFr:
      "Reportez engrais et traitements (ils seraient lessivés), rentrez les récoltes qui sèchent et dégagez les rigoles.",
  },
  {
    code: "PEST_FALL_ARMYWORM_V1",
    version: 1,
    name: "Conditions favorables à la chenille légionnaire",
    description:
      "Reprise des pluies (au moins 15 mm en 7 jours) après un mois sec (moins de 60 mm en 30 jours), nuits chaudes, maïs semé ou en croissance.",
    severity: "WATCH",
    category: "PEST",
    cooldownHours: 168,
    definition: {
      all: [
        { indicator: "crop_in", value: ["MAIZE"] },
        { indicator: "crop_stage_in", value: ["SOWN", "GROWING"] },
        { indicator: "rain_sum_7d", op: ">=", value: 15 },
        { indicator: "rain_sum_30d", op: "<", value: 60 },
        { indicator: "temp_min_avg_3d", op: ">=", value: 20 },
      ],
    },
    messageFr:
      "{commune} : les pluies reprennent ({rain_sum_7d} mm en 7 jours) après une période sèche. Ces conditions favorisent la chenille légionnaire sur le maïs.",
    messageShort:
      "BAIS {commune} : risque de chenille légionnaire sur le maïs. Inspectez les cornets des jeunes plants cette semaine.",
    adviceFr:
      "Inspectez chaque semaine 20 plants par parcelle, cherchez les feuilles trouées et la sciure dans le cornet, prévenez votre agent avant tout traitement.",
  },
  {
    code: "PEST_OUTBREAK_V1",
    version: 1,
    name: "Épidémie probable de ravageurs",
    description:
      "Au moins 3 exploitations distinctes signalent des ravageurs à moins de 5 km les unes des autres en 7 jours. Épidémie probable, à confirmer sur place par l'agent.",
    severity: "WARNING",
    category: "PEST",
    cooldownHours: 72,
    definition: {
      all: [
        {
          indicator: "report_cluster",
          params: { type: "PEST", radiusKm: 5, days: 7 },
          op: ">=",
          value: 3,
        },
      ],
    },
    messageFr:
      "{commune} : {report_cluster} exploitations signalent des ravageurs à moins de {radius_km} km en {days} jours. Épidémie probable, en attente de confirmation par l'agent.",
    messageShort:
      "BAIS {commune} : ravageurs signalés par plusieurs exploitations proches. Inspectez vos parcelles et signalez ce que vous voyez.",
    adviceFr:
      "Inspectez vos parcelles dès aujourd'hui et signalez ce que vous voyez dans BAIS. N'appliquez aucun produit sans l'avis de l'agent : il vient confirmer et conseiller le bon traitement.",
  },
  {
    code: "CROP_DISEASE_OUTBREAK_V1",
    version: 1,
    name: "Épidémie probable de maladie des cultures",
    description:
      "Au moins 3 exploitations distinctes signalent une maladie des cultures à moins de 5 km les unes des autres en 7 jours. Épidémie probable, à confirmer sur place par l'agent.",
    severity: "WARNING",
    category: "CROP_DISEASE",
    cooldownHours: 72,
    definition: {
      all: [
        {
          indicator: "report_cluster",
          params: { type: "CROP_DISEASE", radiusKm: 5, days: 7 },
          op: ">=",
          value: 3,
        },
      ],
    },
    messageFr:
      "{commune} : {report_cluster} exploitations signalent une maladie des cultures à moins de {radius_km} km en {days} jours. Épidémie probable, en attente de confirmation par l'agent.",
    messageShort:
      "BAIS {commune} : maladie des cultures signalée par plusieurs exploitations proches. Inspectez vos parcelles.",
    adviceFr:
      "Inspectez vos parcelles, arrachez et brûlez les plants très atteints hors du champ, lavez vos outils entre deux parcelles et signalez ce que vous voyez. L'agent vient confirmer.",
  },
  {
    code: "ANIMAL_DISEASE_OUTBREAK_V1",
    version: 1,
    name: "Épidémie probable de maladie animale",
    description:
      "Au moins 3 exploitations distinctes signalent une maladie animale à moins de 5 km les unes des autres en 7 jours. Épidémie probable, à confirmer sur place par l'agent.",
    severity: "WARNING",
    category: "ANIMAL_DISEASE",
    cooldownHours: 72,
    definition: {
      all: [
        {
          indicator: "report_cluster",
          params: { type: "ANIMAL_DISEASE", radiusKm: 5, days: 7 },
          op: ">=",
          value: 3,
        },
      ],
    },
    messageFr:
      "{commune} : {report_cluster} exploitations signalent une maladie animale à moins de {radius_km} km en {days} jours. Épidémie probable, en attente de confirmation par l'agent.",
    messageShort:
      "BAIS {commune} : maladie animale signalée par plusieurs élevages proches. Isolez les bêtes malades, ne les vendez pas.",
    adviceFr:
      "Isolez les animaux malades, ne vendez et ne déplacez aucun animal malade, ne consommez pas la viande d'un animal mort de maladie et prévenez l'agent ou le vétérinaire.",
  },
];

export const DEFAULT_RULES: readonly Rule[] = specs.map((spec) => ruleSchema.parse(spec));

export function findDefaultRule(code: string): Rule | undefined {
  return DEFAULT_RULES.find((rule) => rule.code === code);
}
