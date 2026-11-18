import "server-only";

import { createCipheriv, createDecipheriv } from "node:crypto";

function getAlgorithm(secret: string): {
  algorithm: "aes-128-ecb" | "aes-192-ecb" | "aes-256-ecb";
  key: Buffer;
} {
  if (!secret) {
    throw new Error("RENPHO_ENCRYPTION_SECRET is missing.");
  }

  const key = Buffer.from(secret, "utf8");

  if (![16, 24, 32].includes(key.length)) {
    throw new Error(
      `Invalid Renpho encryption key length: expected 16, 24, or 32 UTF-8 bytes; received ${key.length}.`,
    );
  }

  return {
    algorithm: `aes-${key.length * 8}-ecb` as
      | "aes-128-ecb"
      | "aes-192-ecb"
      | "aes-256-ecb",
    key,
  };
}

/**
 * Renpho uses AES in ECB mode with PKCS7 padding and Base64 transport.
 * Keep this module server-only: the encryption secret must never reach a browser.
 */
export function encryptRenpho(plainText: string, secret: string): string {
  if (!plainText) {
    throw new Error("Cannot encrypt an empty Renpho payload.");
  }

  const { algorithm, key } = getAlgorithm(secret);
  const cipher = createCipheriv(algorithm, key, null);
  cipher.setAutoPadding(true);

  return Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]).toString("base64");
}

export function decryptRenpho(
  encryptedBase64: string,
  secret: string,
): string {
  if (!encryptedBase64) {
    throw new Error("Cannot decrypt an empty Renpho response.");
  }

  const { algorithm, key } = getAlgorithm(secret);
  const encrypted = Buffer.from(encryptedBase64, "base64");

  if (encrypted.length === 0 || encrypted.length % 16 !== 0) {
    throw new Error("Renpho response is not valid AES ciphertext.");
  }

  const decipher = createDecipheriv(algorithm, key, null);
  decipher.setAutoPadding(true);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptRenphoJson(
  value: unknown,
  secret: string,
): string {
  return encryptRenpho(JSON.stringify(value), secret);
}

export function decryptRenphoJson<T>(
  encryptedBase64: string,
  secret: string,
): T {
  const plainText = decryptRenpho(encryptedBase64, secret);

  try {
    return JSON.parse(plainText) as T;
  } catch {
    throw new Error("Renpho returned decrypted data that is not valid JSON.");
  }
}
