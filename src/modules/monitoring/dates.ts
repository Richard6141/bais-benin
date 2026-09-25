// Dates du monitoring, toujours en heure du Bénin (Africa/Porto-Novo, UTC+1 sans heure d'été).

const benin = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Porto-Novo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Date du jour au Bénin, AAAA-MM-JJ. */
export function beninToday(now: Date = new Date()): string {
  return benin.format(now);
}

/** Décale une date AAAA-MM-JJ d'un nombre de jours. */
export function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

/** Date AAAA-MM-JJ d'un objet Date lu en base (colonne DATE, minuit UTC). */
export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
