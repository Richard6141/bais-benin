# ADR-0036 — Bilan alimentaire : vraisemblance, surfaces d'enquête imprécises et démonstration

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0033, ADR-0035

## Contexte

En ligne, les cinq communes pilotes affichaient de 438 % (Ouèssè) à 919 % (Ségbana) de couverture des besoins. Un décideur qui lit ces chiffres ne croit plus rien de la page.

La cause est la démonstration. Chaque commune y avait 30 % de ses terres en céréales, racines et tubercules, quelle que soit sa population. Ces communes sont peu peuplées (20 à 47 habitants au km²) : cela faisait 0,6 à 1,5 ha vivrier par habitant. Au niveau national, FAOSTAT 2024 compte 2,66 millions d'hectares de ces cultures pour 14,99 millions d'habitants (WorldPop 2026), soit **0,178 ha par habitant**. La même méthode sur la production nationale donne 161 % de couverture.

Avec des parts plausibles apparaît un second problème, réel celui-là. Dans une commune dont les cultures vivrières couvrent 3 à 10 % des terres, 120 points (ADR-0033) n'en voient que 1 à 10. La surface estimée varie alors de 25 à 70 % d'un tirage à l'autre.

## Décision

1. **Démonstration** : la surface vivrière de chaque commune d'enquête suit sa population, à raison de 0,178 ha par habitant, multipliée par un facteur de 0,5 à 1,5 propre à la commune. Elle se répartit comme au niveau national (maïs 66 %, manioc 11 %, sorgho 8 %, igname 8 %, riz 5 %, mil 2 %). Le reste du territoire se partage entre coton, autres cultures, jachère, eau, bâti, savane et forêt. La démonstration se refait seule par `pnpm db:demo:survey`, sans rejouer le seed.
2. **Seuil de vraisemblance : 300 %**. Au-delà de trois fois ses besoins, près du double du taux national, une commune rurale exportatrice est possible mais rare. Le statut reste affiché, mais passe « à confirmer » avec la raison « surface ou rendement à vérifier ».
3. **Surface d'enquête imprécise** : le bilan ne jette plus une surface d'enquête dont le CV dépasse 20 % (l'ADR-0035 l'exigeait). Il l'utilise avec sa marge, et la commune passe « à confirmer » avec la raison (« surface vivrière de l'enquête à 35 % près, 7 points vivriers sur 112 »).
4. **Sous 5 points vivriers**, l'estimation n'est que du bruit : la commune n'est pas évaluée, et la raison le dit (« Enquête : 2 points vivriers sur 113, trop peu pour une surface »).
5. Les raisons d'un « à confirmer » s'affichent dans le « ? » du statut : fourchette qui chevauche un seuil, culture sans surface, plus de 300 %, enquête imprécise.

## Proposition, à décider : taille de l'échantillon

Pour une surface vivrière à 20 % près, il faut environ `(1 − p) / (p × 0,2²)` points, divisé par le gain de la carte (1,2 à 1,5 ici), où `p` est la part vivrière de la commune. Cela fait environ 180 points quand `p` vaut 10 %, et environ 380 quand il vaut 5 %. Les 120 points de l'ADR-0033 suffisent pour les terres cultivées dans leur ensemble, pas pour les cultures vivrières des communes peu cultivées. Deux voies pour la campagne suivante :

- dimensionner chaque commune par sa part vivrière attendue (lue sur la carte), au prix de plus de visites d'agents ;
- ou tirer davantage de points là où la carte voit des cultures annuelles (strates par classe de la carte), ce qui demande la classe de la carte en chaque point de la base.

## Conséquences

- En démonstration : Tchaourou et Ségbana sont évaluées (environ 140 et 260 %, « à confirmer » pour imprécision de l'enquête). Bassila, Ouèssè et Tanguiéta ne le sont pas, faute de points vivriers, et la page le dit.
- Aucun chiffre ferme au-delà de 300 % ou sur une enquête imprécise.
- Sur le serveur, après fusion : `pnpm db:reference:population`, puis `pnpm db:demo:survey`, depuis l'image tools.
