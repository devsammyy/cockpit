import * as crypto from "crypto";

const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const ALGORITHM = "sha512";

/**
 * Hash a plain-text password using timing-safe PBKDF2.
 */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, ALGORITHM, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Verify a plain-text password against a hashed password string.
 */
export function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const parts = storedHash.split(":");
    const salt = parts[0];
    const hash = parts[1];

    if (!salt || !hash) {
      return resolve(false);
    }

    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, ALGORITHM, (err, derivedKey) => {
      if (err) return reject(err);
      const inputHashBuffer = Buffer.from(derivedKey.toString("hex"), "hex");
      const storedHashBuffer = Buffer.from(hash, "hex");

      if (inputHashBuffer.length !== storedHashBuffer.length) {
        return resolve(false);
      }

      resolve(crypto.timingSafeEqual(inputHashBuffer, storedHashBuffer));
    });
  });
}
