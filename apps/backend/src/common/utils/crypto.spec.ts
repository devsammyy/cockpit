import { hashPassword, verifyPassword } from "./crypto";

describe("Password Cryptography Utility", () => {
  it("hashes password and verifies it successfully", async () => {
    const hash = await hashPassword("super-secret-password-123");
    expect(hash).toContain(":");

    const isValid = await verifyPassword("super-secret-password-123", hash);
    expect(isValid).toBe(true);
  });

  it("fails verification for wrong passwords", async () => {
    const hash = await hashPassword("super-secret-password-123");
    const isValid = await verifyPassword("wrong-password", hash);
    expect(isValid).toBe(false);
  });

  it("fails verification for malformed hashes", async () => {
    const isValid = await verifyPassword("some-password", "invalidhashshape");
    expect(isValid).toBe(false);
  });
});
