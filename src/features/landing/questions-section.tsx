import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

interface Question {
  question: string;
  answer: string;
  href: Route;
  link: string;
}

// Les questions que l'État pose aujourd'hui sans réponse rapide (docs/01 §6), chacune avec l'écran
// qui y répond. Pas de numérotation : ce n'est pas une séquence. Seule la dernière réponse est
// réservée au ministère, et le lien le dit.
const questions: Question[] = [
  {
    question: "Combien de producteurs cultivent le maïs dans chaque commune ?",
    answer: "Le registre relie chaque exploitation à sa commune et à ses cultures par campagne.",
    href: "/carte?cropCode=MAIZE" as Route,
    link: "Voir le maïs sur la carte",
  },
  {
    question: "Quelle superficie est cultivée, et où ?",
    answer:
      "Les parcelles sont relevées au GPS par les agents ; l'écart avec la surface déclarée est suivi.",
    href: "/carte?metric=declaredAreaHa" as Route,
    link: "Voir les surfaces par commune",
  },
  {
    question: "Où brûle-t-il en ce moment ?",
    answer:
      "Les feux vus par les satellites de la NASA arrivent toutes les 30 minutes, avec leur puissance.",
    href: "/carte?feux=24h" as Route,
    link: "Voir les feux des dernières 24 heures",
  },
  {
    question: "Comment se porte la végétation ce mois-ci ?",
    answer: "Les images Sentinel-2 montrent la vigueur des cultures, mois par mois, sans nuages.",
    href: "/carte?ciel=ndvi" as Route,
    link: "Voir la végétation",
  },
  {
    question: "Qui sont les meilleurs producteurs de la campagne ?",
    answer:
      "Le ministère publie un palmarès établi sur les récoltes vérifiées, avec l'accord des lauréats.",
    href: "/palmares",
    link: "Voir le palmarès",
  },
  {
    question: "Où intervenir en premier ?",
    answer:
      "Alertes, demandes d'aide et vérifications en attente désignent les communes prioritaires.",
    href: "/connexion?profil=ministere" as Route,
    link: "Réservé au ministère : se connecter",
  },
];

export function QuestionsSection() {
  return (
    <section aria-labelledby="questions-titre">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="questions-titre" className="border-b pb-3 text-xl sm:text-2xl">
          Questions auxquelles la plateforme répond
        </h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Chaque chiffre affiché porte sa source, sa date et son niveau de fiabilité. Ce qui
          n&apos;a pas été vérifié sur le terrain est dit tel quel.
        </p>
        <dl className="mt-6 divide-y border-y">
          {questions.map((item) => (
            <div
              key={item.question}
              className="grid gap-2 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6"
            >
              <dt className="font-semibold text-heading">{item.question}</dt>
              <dd className="flex flex-col items-start gap-1.5">
                <span className="text-muted-foreground">{item.answer}</span>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0"
                >
                  {item.link}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
