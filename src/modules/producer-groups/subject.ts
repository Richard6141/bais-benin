import { createHash } from "node:crypto";

// Sujet d'une notification de message de groupe (ADR-0024). La file des messages n'accepte qu'un
// message par couple (type, sujet) et le sujet est un UUID : pour un message de groupe, chaque
// destinataire a donc son propre sujet, UUID v5 (RFC 9562) du producteur dans l'espace de noms du
// message. Déterministe : on retrouve la notification d'un membre sans table de plus, et un
// second passage sur le même message ne met rien en file deux fois.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidV5(name: string, namespace: string): string {
  if (!UUID.test(namespace)) throw new Error("Espace de noms UUID invalide");
  const hash = createHash("sha1")
    .update(Buffer.from(namespace.replaceAll("-", ""), "hex"))
    .update(name, "utf8")
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function groupMessageSubjectId(messageId: string, farmerId: string): string {
  return uuidV5(farmerId.toLowerCase(), messageId);
}
