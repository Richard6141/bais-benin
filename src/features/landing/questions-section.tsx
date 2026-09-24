import Image from "next/image";
import { landingPhotos } from "@/features/landing/photos";

// Les questions que l'État pose aujourd'hui sans réponse rapide (docs/01 §6), et ce que
// la plateforme mobilise pour y répondre. Pas de numérotation : ce n'est pas une séquence.
const questions = [
  {
    question: "Combien de producteurs cultivent le maïs dans une commune donnée ?",
    answer: "Le registre relie chaque exploitation à sa commune et à ses cultures par campagne.",
  },
  {
    question: "Quelle superficie est réellement cultivée ?",
    answer:
      "Les parcelles sont relevées au GPS par les agents ; l'écart avec la surface déclarée est suivi.",
  },
  {
    question: "Quelles zones sont exposées à un déficit de pluie ?",
    answer:
      "La météo par commune alimente un moteur de règles qui déclenche les alertes hydriques.",
  },
  {
    question: "Quels producteurs ont besoin d'un accompagnement ?",
    answer:
      "Alertes actives, historique de rendement et statut de vérification désignent les priorités.",
  },
  {
    question: "Où trouver 40 tonnes de riz paddy vérifié ?",
    answer:
      "Le marché publie les récoltes des exploitations vérifiées, par produit, zone et volume.",
  },
  {
    question: "Où intervenir en premier ?",
    answer:
      "Le centre de pilotage classe les zones par gravité et par nombre d'exploitations touchées.",
  },
];

export function QuestionsSection() {
  return (
    <section aria-labelledby="questions-titre" className="border-b border-border/70">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:py-24">
        <div>
          <h2
            id="questions-titre"
            className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
          >
            Des réponses en quelques secondes aux questions qui prenaient des semaines
          </h2>
          <p className="mt-4 text-muted-foreground">
            Chaque chiffre affiché porte sa source, sa date et son niveau de fiabilité. Ce qui
            n&apos;a pas été vérifié sur le terrain est dit tel quel.
          </p>
          <div className="relative mt-8 aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
            <Image
              src={landingPhotos.maize.src}
              alt={landingPhotos.maize.alt}
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
        <dl className="divide-y">
          {questions.map((item) => (
            <div
              key={item.question}
              className="grid gap-2 py-5 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-6"
            >
              <dt className="font-medium text-balance">{item.question}</dt>
              <dd className="text-sm text-muted-foreground">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
