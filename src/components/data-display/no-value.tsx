// Case vide d'un tableau (donnée absente, non mesurée ou non calculée) : « n.d. », convention des
// tableaux statistiques, remplace le tiret cadratin que la charte exclut du texte affiché.
export function NoValue() {
  return (
    <span className="text-muted-foreground">
      <abbr title="non disponible" className="no-underline">
        n.d.
      </abbr>
    </span>
  );
}
