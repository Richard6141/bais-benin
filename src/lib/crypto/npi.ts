import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Protection du NPI (docs/06 §4, docs/recherche/authentification-etape-3.md §7).
// - chiffrement AES-256-GCM, nonce aléatoire de 12 octets, tag de 16 octets ;
// - données associées (table, colonne, identifiant) : un texte chiffré ne peut pas être
//   déplacé d'une fiche à une autre ;
// - format stocké versionné « v1.<nonce>.<tag>.<chiffré> » en base64url pour permettre la
//   rotation de clé ;
// - index aveugle HMAC-SHA-256 avec une clé distincte, pour l'unicité et la recherche exacte.

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const CURRENT_KEY_VERSION = 1;

export interface NpiKeyring {
  encryptionKeys: ReadonlyMap<number, Buffer>;
  hashKey: Buffer;
}

export interface NpiContext {
  table: string;
  column: string;
  recordId: string;
}

function associatedData(context: NpiContext): Buffer {
  return Buffer.from(`${context.table}.${context.column}.${context.recordId}`, "utf8");
}

export function normalizeNpi(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function encryptNpi(npi: string, context: NpiContext, keyring: NpiKeyring): string {
  const key = keyring.encryptionKeys.get(CURRENT_KEY_VERSION);
  if (!key) throw new Error("Clé de chiffrement NPI courante absente");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(associatedData(context));
  const ciphertext = Buffer.concat([cipher.update(normalizeNpi(npi), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${CURRENT_KEY_VERSION}`,
    nonce.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptNpi(stored: string, context: NpiContext, keyring: NpiKeyring): string {
  const [versionPart, noncePart, tagPart, cipherPart] = stored.split(".");
  if (!versionPart || !noncePart || !tagPart || !cipherPart) {
    throw new Error("Format de NPI chiffré invalide");
  }
  const version = Number(versionPart.replace(/^v/, ""));
  const key = keyring.encryptionKeys.get(version);
  if (!key) throw new Error(`Clé de chiffrement NPI v${version} inconnue`);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(noncePart, "base64url"), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(associatedData(context));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function npiBlindIndex(npi: string, keyring: NpiKeyring): Buffer {
  return createHmac("sha256", keyring.hashKey).update(normalizeNpi(npi)).digest();
}

export function sameBlindIndex(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

// Affichage : seuls les deux derniers chiffres restent lisibles.
export function maskNpi(npi: string): string {
  const digits = normalizeNpi(npi);
  if (digits.length <= 2) return "••";
  const hidden = "•".repeat(digits.length - 2);
  return `${hidden}${digits.slice(-2)}`.replace(/(.{4})(?=.)/g, "$1 ");
}

export function keyringFromEnv(source: {
  NPI_ENCRYPTION_KEY?: string;
  NPI_HASH_KEY?: string;
}): NpiKeyring | null {
  if (!source.NPI_ENCRYPTION_KEY || !source.NPI_HASH_KEY) return null;
  return {
    encryptionKeys: new Map([
      [CURRENT_KEY_VERSION, Buffer.from(source.NPI_ENCRYPTION_KEY, "base64")],
    ]),
    hashKey: Buffer.from(source.NPI_HASH_KEY, "base64"),
  };
}
