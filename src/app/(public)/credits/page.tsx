import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = { title: "Crédits photographiques" };

const manifestSchema = z.object({
  images: z.array(
    z.object({
      file: z.string(),
      alt: z.string(),
      credit: z.string(),
      tags: z.array(z.string()).optional(),
    }),
  ),
});

// Le manifeste est écrit par le script d'optimisation des images ; la page le lit
// à la demande pour que les crédits suivent toujours les fichiers réellement servis.
async function loadManifest() {
  try {
    const raw = await readFile(path.join(process.cwd(), "public/images/manifest.json"), "utf-8");
    return manifestSchema.parse(JSON.parse(raw)).images;
  } catch {
    return [];
  }
}

export default async function CreditsPage() {
  const images = await loadManifest();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <PageHeader
          title="Crédits photographiques"
          description="Les photographies de la plateforme sont publiées sous licence libre par leurs auteurs. Elles illustrent l'agriculture béninoise et ouest-africaine ; aucune ne représente une personne décrite dans les données."
        />
        {images.length === 0 ? (
          <p className="mt-8 text-muted-foreground">
            La liste des crédits sera publiée avec la banque d&apos;images.
          </p>
        ) : (
          <ul className="mt-8 divide-y">
            {images.map((image) => (
              <li
                key={image.file}
                className="grid gap-1 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6"
              >
                <span className="font-medium">{image.alt}</span>
                <span className="text-sm text-muted-foreground">{image.credit}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
