import crypto from "node:crypto";

/* -----------*/
/*  Password hashing   */
/* ------------- */

const SCRYPT_KEYLEN = 64;

/**
 * Hashes a plaintext password with a random per-user salt.
 * Returns a single string of the form "salt:hash" (both hex) so it's
 * easy to store in one database column.
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext password against a stored "salt:hash" string.
 * Uses a timing-safe comparison to avoid leaking info via response time.
 */
export function verifyPassword(password, stored) {
  const [salt, originalHash] = stored.split(":");
  if (!salt || !originalHash) return false;

  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const originalHashBuffer = Buffer.from(originalHash, "hex");

  if (hash.length !== originalHashBuffer.length) return false;
  return crypto.timingSafeEqual(hash, originalHashBuffer);
}

/* ---------------- */
/*  JSON Web Tokens (HS256, hand-rolled with node:crypto — no jsonwebtoken) */
/* --------------- */

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlToBuffer(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, "base64");
}

function sign(data, secret) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

/**
 * Issues a signed JWT (standard header.payload.signature format,
 * verifiable with any HS256-compatible library) containing the given
 * payload plus standard `iat`/`exp` claims.
 */
export function signToken(payload, secret, expiresInSeconds) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(fullPayload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies a JWT's signature and expiry. Returns the decoded payload
 * on success, or throws an Error describing why verification failed.
 */
export function verifyToken(token, secret) {
  if (typeof token !== "string") throw new Error("Token must be a string");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret);

  const sigBuffer = base64urlToBuffer(signature);
  const expectedBuffer = base64urlToBuffer(expectedSignature);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid signature");
  }

  const payload = JSON.parse(base64urlToBuffer(encodedPayload).toString("utf-8"));
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && now >= payload.exp) {
    throw new Error("Token expired");
  }

  return payload;
}