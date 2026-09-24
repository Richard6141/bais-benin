# ADR-0001 — Backend full-stack Next.js plutôt que NestJS séparé

- Statut : acceptée
- Date : 2026-09-24
- Décideurs : Architecte, Backend/Data, DevOps

## Contexte

Le brief autorise deux options : une architecture full-stack Next.js propre, ou NestJS si nécessaire. La plateforme doit être déployable sur Vercel, en Docker et sur un cloud public, avec une équipe réduite pendant le challenge et une trajectoire vers un système national.

## Décision

Un seul déploiement Next.js 16 (App Router, runtime Node.js) porte l'interface, les Server Actions et les routes REST `/api/v1`. La logique métier vit dans `src/modules/`, sans aucune dépendance à Next ou à React, derrière des services applicatifs et des ports.

## Conséquences

- Positives : un seul artefact à déployer et à sécuriser ; pas de duplication des schémas entre client et serveur ; Server Components pour la performance en faible débit ; démarrage rapide de l'équipe.
- Négatives : les tâches longues (ingestion météo, agrégats) ne doivent pas s'exécuter dans les requêtes web. Elles sont isolées dans un `worker` (conteneur ou cron) qui importe les mêmes modules.
- Réversibilité : si la charge nationale ou l'organisation l'exige, `src/modules/` s'extrait vers NestJS ou vers des services séparés sans réécriture, car aucune dépendance framework n'y est admise (règle ESLint de frontières).
