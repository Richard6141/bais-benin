import { describe, expect, it } from "vitest";
import { clientAddressFrom, matchesProxy } from "./client-address";

describe("adresse du client", () => {
  it("ignore X-Forwarded-For sans relais de confiance configuré", () => {
    expect(clientAddressFrom("203.0.113.9", [])).toBeNull();
  });

  it("retire les relais de confiance de la droite de la chaîne", () => {
    expect(clientAddressFrom("198.51.100.4, 203.0.113.9, 10.0.0.2", ["10.0.0.0/8"])).toBe(
      "203.0.113.9",
    );
    expect(clientAddressFrom("203.0.113.9, 172.18.0.5", ["172.18.0.5"])).toBe("203.0.113.9");
  });

  it("ne remonte pas au-delà du premier relais qui n'est pas de confiance", () => {
    // Un client qui écrit lui-même un faux X-Forwarded-For ne peut pas choisir son adresse.
    expect(clientAddressFrom("1.2.3.4, 203.0.113.9, 10.0.0.2", ["10.0.0.0/8"])).toBe("203.0.113.9");
  });

  it("reconnaît les plages CIDR IPv4 et les adresses exactes", () => {
    expect(matchesProxy("10.20.30.40", ["10.0.0.0/8"])).toBe(true);
    expect(matchesProxy("11.0.0.1", ["10.0.0.0/8"])).toBe(false);
    expect(matchesProxy("::1", ["::1"])).toBe(true);
    expect(matchesProxy("10.0.0.1", ["pas-une-plage/8"])).toBe(false);
  });
});
