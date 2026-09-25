import { describe, expect, it, vi } from "vitest";

// C4 : hashIp est maintenant un HMAC à clé (AUDIT_IP_HASH_KEY), plus un simple sha256 — une
// IPv4 tient sur 32 bits, un hachage non salé se retourne entièrement par table précalculée.

const mockEnv = vi.hoisted(() => ({ AUDIT_IP_HASH_KEY: undefined as string | undefined }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => mockEnv }));
vi.mock("@/database/client", () => ({ prisma: {} }));

const { hashIp } = await import("./service");

describe("hashIp", () => {
  it("est déterministe pour une même clé et une même adresse", () => {
    mockEnv.AUDIT_IP_HASH_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(hashIp("203.0.113.42")).toBe(hashIp("203.0.113.42"));
  });

  it("des clés différentes donnent des hachages différents pour la même adresse", () => {
    mockEnv.AUDIT_IP_HASH_KEY = Buffer.alloc(32, 1).toString("base64");
    const withKeyA = hashIp("203.0.113.42");
    mockEnv.AUDIT_IP_HASH_KEY = Buffer.alloc(32, 2).toString("base64");
    const withKeyB = hashIp("203.0.113.42");
    expect(withKeyA).not.toBe(withKeyB);
  });

  it("ne lève pas si AUDIT_IP_HASH_KEY est absent (filet de secours en développement)", () => {
    mockEnv.AUDIT_IP_HASH_KEY = undefined;
    expect(() => hashIp("203.0.113.42")).not.toThrow();
  });
});
