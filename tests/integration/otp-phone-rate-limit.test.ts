import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { checkPhoneOtpRateLimit } from "@/lib/auth/otp-phone-rate-limit";

// B4 : limite par numéro de téléphone sur l'envoi de code à usage unique, indépendante de la
// limite par IP configurée dans auth.ts. Fenêtre fixe : 5 codes par numéro sur 15 minutes.

const PHONE = "+22901000099";

describe("checkPhoneOtpRateLimit", () => {
  afterEach(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: `otp-phone:${PHONE}` } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("autorise jusqu'au plafond puis refuse dans la même fenêtre", async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      expect(await checkPhoneOtpRateLimit(PHONE, now)).toBe(true);
    }
    expect(await checkPhoneOtpRateLimit(PHONE, now)).toBe(false);
    // Toujours refusé un peu plus tard, tant que la fenêtre de 15 minutes n'est pas écoulée.
    expect(await checkPhoneOtpRateLimit(PHONE, now + 60_000)).toBe(false);
  });

  it("réinitialise le compteur une fois la fenêtre écoulée", async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      expect(await checkPhoneOtpRateLimit(PHONE, now)).toBe(true);
    }
    expect(await checkPhoneOtpRateLimit(PHONE, now)).toBe(false);
    expect(await checkPhoneOtpRateLimit(PHONE, now + 15 * 60 * 1000 + 1)).toBe(true);
  });

  it("compte séparément deux numéros différents", async () => {
    const otherPhone = "+22901000098";
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      expect(await checkPhoneOtpRateLimit(PHONE, now)).toBe(true);
    }
    expect(await checkPhoneOtpRateLimit(PHONE, now)).toBe(false);
    expect(await checkPhoneOtpRateLimit(otherPhone, now)).toBe(true);
    await prisma.rateLimit.deleteMany({ where: { key: `otp-phone:${otherPhone}` } });
  });
});
