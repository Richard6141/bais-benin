// Seuls les chemins internes sont acceptés comme destination après connexion :
// une URL absolue ou protocolaire ouvrirait une redirection vers un site tiers.
export function safeNextPath(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return undefined;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("://"))
    return undefined;
  return candidate;
}
