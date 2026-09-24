/**
 * Identités fictives par aire linguistique (docs/08 §6.6).
 *
 * Les listes sont composées de prénoms et de patronymes fréquents dans chaque aire ; aucune
 * combinaison prénom + nom n'est copiée d'une personne identifiable, et toute ressemblance avec une
 * personne réelle serait fortuite. Les prénoms chrétiens et musulmans usuels sont mêlés aux prénoms
 * de langue locale, comme dans les registres réels. Les aires sont volontairement regroupées
 * (goun et mahi avec le fon, yom et lokpa avec le dendi, waama et biali avec l'otamari) : la
 * finesse sociolinguistique n'apporte rien à un jeu de démonstration.
 */

import type { Random, WeightedItem } from "./random";

export type LinguisticArea =
  "FON" | "YORUBA" | "BARIBA" | "DENDI" | "ADJA" | "OTAMARI" | "MINA" | "PEUL";

export type Gender = "M" | "F";

interface AreaNames {
  male: readonly string[];
  female: readonly string[];
  surnames: readonly string[];
}

const list = (text: string): readonly string[] => text.trim().split(/\s+/);

const AREA_NAMES: Record<LinguisticArea, AreaNames> = {
  FON: {
    male: list(`Kossi Kokou Koffi Comlan Codjo Dossou Sagbo Sènan Dansou Gbènou Kossivi Mahoutin
      Mahougnon Mawulé Sèdjro Sètondji Sèmako Sèvi Dédé Dominique Gildas Romuald Bonaventure
      Basile Clément Ephrem Firmin Gaston Hyppolite Innocent Jérôme Léon Modeste Narcisse Pascal`),
    female: list(`Ayaba Adjoa Afiavi Akouavi Abla Ama Dossi Sika Sènami Mawulolo Hounsi Adélaïde
      Bénédicte Célestine Delphine Edwige Félicité Georgette Honorine Judith Léontine Mireille
      Nadège Odile Pélagie Rosine Solange Thérèse Victoire Yolande Gisèle Huguette Léa Perpétue`),
    surnames: list(`Agossou Ahouansou Akpovi Assogba Azon Dossou Gbaguidi Gnansounou Hounkpatin
      Houngbédji Hounkpè Kpadonou Kpossou Lokossou Sossou Tossou Vodounon Zinsou Zannou Ahossi
      Dansou Dangbénon Gnonlonfoun Hounsa Agbo Ayihounton Boko Dégbé Gandonou Hlinvi Migan Nouatin
      Sagbo Tchibozo Yèhouénou Ahouandjinou Dagba Gnimagnon Hounnou Kinhou Sodokin Tokpo Zohoungbé`),
  },
  YORUBA: {
    male: list(`Adébayo Akin Ayodélé Babatundé Bamidélé Olabodé Olusègun Olawalé Kolawolé Oladélé
      Adéwalé Adéyémi Olufémi Tundé Ségun Kunlé Tayo Wolé Idowu Kèhindé Taïwo Ojo Rasaki Latif
      Wahab Ganiou Rafiou Moudjib Sikirou Abdoul Akanni Bissiriou Fataï Karimou Wassiou`),
    female: list(`Abiola Adéola Bolanlé Folaké Funmilayo Modupé Morénikè Omolara Oluwaseun Ronké
      Shadé Titilayo Yétoundé Bisi Kémi Tolani Wuraola Abosèdé Adétoun Aduké Ajokè Alaké Bunmi
      Dupé Fadékémi Ifé Iyabo Latifatou Ramatou Sikirath Zulikath Mouniratou Rafiatou Waliyatou`),
    surnames: list(`Adéyémi Adjibadé Adjibola Afolabi Akindélé Alabi Babalola Balogun Fagbémi Faladé
      Idohou Odjo Ogoubiyi Oké Olaniyan Oloudé Onifadé Oyédé Salami Shittou Tidjani Yèssoufou
      Adisa Akanni Bello Fassassi Lawani Makanjuola Odounlami Ogoudjobi Okounlola Sanni Ayéni
      Adédokoun Akintola Amoussa Bankolé Gbadamassi Ogoulola Olowo Oyélami Sanoussi Yaya`),
  },
  BARIBA: {
    male: list(`Bio Orou Sabi Séro Gounou Sika Woru Bani Boni Yérima Sidi Yarou Bako Nassirou
      Idrissou Sanni Zakari Issa Bouraïma Salifou Karim Moussa Saka Bagou Kora Sina Tamou Gani
      Souley Yaya Chabi Dramane Gado Lafia Mora`),
    female: list(`Gnon Sika Bona Baké Daki Nanan Batoko Yon Doko Aïssatou Adjaratou Fatoumata
      Hadiza Mariama Nafissatou Rakiatou Safiatou Salamatou Zénabou Awa Bintou Djamila Habiba
      Kadidja Latifa Mèmounatou Nassiratou Ramatou Sadia Sènabou Wassilatou Zouléha Assana Fati`),
    surnames: list(`Adam Bagoudou Baparapé Bio Boukari Chabi Dramane Gado Gounou Guéra Guidou Kora
      Kpérou Lafia Mama Mora N'Gobi Orou Sabi Séro Sika Sinatoko Sounon Tamou Tchané Woru Worou
      Yorou Zakari Zimé Zaki Yarou Bani Boni Gnanro Sèkè Sinaguè Tokoro Yérima`),
  },
  DENDI: {
    male: list(`Alassane Abdoulaye Amadou Boubacar Djibril Hamidou Harouna Idrissou Ibrahim Issaka
      Mamane Moussa Nouhoum Oumarou Salifou Seydou Souleymane Soumaïla Yacouba Zakari Zibo Garba
      Gado Halidou Issoufou Kassoum Mahamadou Nassirou Ousmane Sabi Daouda Chaïbou Abdou Hama`),
    female: list(`Aïcha Aminata Balkissa Fati Fatouma Hadiza Halima Haoua Kadi Mariama Nafissa
      Ramatou Rakia Safi Salamatou Saratou Zeinabou Zouéra Adama Bibata Djamila Habiba Hawa
      Maïmouna Mèmounatou Nana Oumou Rahamatou Roukaya Sakina Assia Farida Mounira Zalia`),
    surnames: list(`Abdou Alassane Amadou Assouma Baba Boubacar Chaïbou Daouda Djibo Garba Hamani
      Hama Harouna Idrissou Issifou Kassa Mamane Moussa Oumarou Salifou Sani Seydou Soumanou
      Tidjani Touré Yacouba Zakari Zibo Zimé Maïga Sidi Souley Alfa Bagana Dari Gomina Zato`),
  },
  ADJA: {
    male: list(`Agbéko Akakpo Amouzou Anani Assiongbon Dodji Edem Elom Folly Kodjo Koffi Kokou
      Komlan Kossi Kouami Kouassi Mawuli Mawussé Sédjro Sélom Sénam Yao Yaovi Yawo Ablam Edoh
      Kwamé Kuma Tété Kokouvi Kossivi Yawovi Fiacre Amévi Mensan`),
    female: list(`Abla Adjo Adjoa Afi Afiwa Akoko Akossiwa Akouvi Ama Améyo Amivi Ayélé Dédé Dzifa
      Enyonam Esi Essi Mawuena Sena Sika Yawa Yayra Abra Adzo Akpéné Ami Dzigbodi Efua Ayawa
      Sènami Mawusi Adjovi Afiavi Lolonyo Yawavi`),
    surnames: list(`Adoun Afanou Aholou Akakpo Amouzou Anani Attiogbé Ayité Dossou-Yovo Edoh Egbé
      Folly Gbédji Gnidéhou Hounkpè Kpodar Lawson Mensah Sodji Sodjinou Tchégnon Togbé Wotto Yovo
      Zohoun Dosseh Agbossou Amétépé Djossou Kpanou Sohou Tossa Adjaho Agbodjinou Codjia Gbédé
      Klouvi Kpakpo Sèhouéto Tokpanou`),
  },
  OTAMARI: {
    male: list(`N'Tcha Kouagou Sambiéni N'Dah Yaou N'Koué Kombiéni Tchandé Nambima Yantibossi Kanti
      Batchabi Tamè Kombétto Barthélémy Clément Denis Emmanuel Fulbert Gaston Innocent Julien
      Lucien Mathieu Nicolas Paul Raphaël Sylvain Théophile Bertin Cyriaque Fidèle Prosper Yves`),
    female: list(`Koumba Kombétto N'Tcha Yaoua Tchaba Sambiéna Adèle Agathe Bernadette Christine
      Clarisse Émilienne Estelle Florence Germaine Hélène Irène Josiane Justine Lucie Madeleine
      Marguerite Monique Nathalie Pascaline Rosalie Sabine Suzanne Véronique Viviane Yolande`),
    surnames: list(`Kouagou N'Tcha Sambiéni N'Dah Yaou N'Koué Kombiéni Tchandé Natta Nambima
      Yantibossi Kanti Batchabi Tamè Kombétto Kiansi Sanni Taïrou Tchaou Ouorou Tchabi Bawa Dassi
      Koukoui M'Po N'Dobi Natchaba Sambiénou Tchétchétchou Tibéri Yari Yorou Tanguiéta Namboni`),
  },
  MINA: {
    male: list(`Kokou Kossi Koffi Komi Koami Kwami Kodjo Dodji Edem Elom Folly Mawuli Sélom Sénam
      Yao Yaovi Anani Ayité Tété Ablam Edoh Kuma Agbéko Akakpo Amévi Kokouvi Kossivi Mawussé
      Yawovi Fiacre Mensan Kwadjo Sénou Yawo`),
    female: list(`Afi Ami Akoua Akossiwa Ayélé Dédé Abla Adjo Améyo Amivi Dzifa Enyonam Esi Essi
      Mawuena Sena Sika Yawa Akpéné Adzo Abra Efua Dzigbodi Yayra Ayaba Sènami Afiwa Lolonyo
      Adjovi Mawusi Ayawa Yawavi Afiavi Akouvi`),
    surnames: list(`Adjovi Akakpo Amégan Amoussou Anani Atchadé Ayivi Dossou-Yovo Gnimadi Houénou
      Kpodar Lawson Mensah Quenum Sodjinou Tossou Zinsou Hounkpè Aholou Djossou Agbodjan Agbessi
      Bossou Dégbé Fiogbé Gbédji Kuassi Sohou Tchégnon Zohoun Ayité Adjamagbo Ahouangansi Codjo
      Dossa Gnansounou Kouévi Sènou`),
  },
  PEUL: {
    male: list(`Amadou Boubacar Hamidou Ibrahim Issa Mamadou Oumarou Ousmane Saïdou Souleymane
      Yacouba Abdoulaye Alassane Bello Bouba Djibo Garba Hama Harouna Idrissou Issoufou Moussa
      Nouhoum Sambo Seydou Sidi Soumaïla Tidjani Yéro Aliou Boureïma Demba Hassane Modibo`),
    female: list(`Aïssatou Adama Aminata Bintou Fatoumata Habiba Hadiza Halimatou Haoua Kadidjatou
      Mariama Maïmouna Nafissatou Oumou Rakiatou Ramatou Safiatou Salamatou Zeinabou Djénéba
      Fadimatou Hawa Inna Kadi Mèmounatou Nana Rahamatou Roukaya Saratou Assiatou Dado Hindou`),
    surnames: list(`Bâ Barry Bello Bouba Dicko Diallo Dia Djibo Hamadou Mamadou Sambo Sow Yéro
      Boukari Alassane Amadou Garba Hama Issa Moussa Oumarou Ousmane Saïdou Seydou Souley Tidjani
      Yacouba Zakari Djaouga Gambo Gorko Lawal Ndiaye Sanda Yérima`),
  },
};

/**
 * Aires linguistiques par département, pondérées selon la répartition usuelle des langues. Chaque
 * département mélange plusieurs aires avec une dominante : un registre réel n'est jamais homogène.
 */
export const LINGUISTIC_AREAS_BY_DEPARTEMENT: Record<
  string,
  readonly WeightedItem<LinguisticArea>[]
> = {
  "BJ-AL": [
    { value: "BARIBA", weight: 0.45 },
    { value: "DENDI", weight: 0.35 },
    { value: "PEUL", weight: 0.2 },
  ],
  "BJ-AK": [
    { value: "OTAMARI", weight: 0.65 },
    { value: "BARIBA", weight: 0.2 },
    { value: "PEUL", weight: 0.15 },
  ],
  "BJ-AQ": [
    { value: "FON", weight: 0.85 },
    { value: "ADJA", weight: 0.1 },
    { value: "YORUBA", weight: 0.05 },
  ],
  "BJ-BO": [
    { value: "BARIBA", weight: 0.65 },
    { value: "PEUL", weight: 0.2 },
    { value: "DENDI", weight: 0.1 },
    { value: "YORUBA", weight: 0.05 },
  ],
  "BJ-CO": [
    { value: "FON", weight: 0.65 },
    { value: "YORUBA", weight: 0.35 },
  ],
  "BJ-KO": [
    { value: "ADJA", weight: 0.9 },
    { value: "FON", weight: 0.1 },
  ],
  "BJ-DO": [
    { value: "DENDI", weight: 0.6 },
    { value: "OTAMARI", weight: 0.2 },
    { value: "PEUL", weight: 0.2 },
  ],
  "BJ-LI": [
    { value: "FON", weight: 0.7 },
    { value: "YORUBA", weight: 0.1 },
    { value: "ADJA", weight: 0.1 },
    { value: "MINA", weight: 0.1 },
  ],
  "BJ-MO": [
    { value: "MINA", weight: 0.6 },
    { value: "ADJA", weight: 0.35 },
    { value: "FON", weight: 0.05 },
  ],
  "BJ-OU": [
    { value: "FON", weight: 0.6 },
    { value: "YORUBA", weight: 0.35 },
    { value: "MINA", weight: 0.05 },
  ],
  "BJ-PL": [
    { value: "YORUBA", weight: 0.75 },
    { value: "FON", weight: 0.25 },
  ],
  "BJ-ZO": [
    { value: "FON", weight: 0.9 },
    { value: "YORUBA", weight: 0.1 },
  ],
};

/** Répartition de repli pour un département inconnu du mapping. */
const DEFAULT_AREAS: readonly WeightedItem<LinguisticArea>[] = [{ value: "FON", weight: 1 }];

export function pickLinguisticArea(random: Random, departementCode: string): LinguisticArea {
  return random.weightedPick(LINGUISTIC_AREAS_BY_DEPARTEMENT[departementCode] ?? DEFAULT_AREAS);
}

export interface PersonName {
  firstName: string;
  lastName: string;
}

export function pickPersonName(random: Random, area: LinguisticArea, gender: Gender): PersonName {
  const names = AREA_NAMES[area];
  return {
    firstName: random.pick(gender === "M" ? names.male : names.female),
    lastName: random.pick(names.surnames),
  };
}
