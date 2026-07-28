import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("AUTH_SECRET은 24자 이상의 긴 임의 문자열로 설정해 주세요.");
  }
  return secret;
}

export function createPublicToken(): string {
  return randomBytes(24).toString("base64url");
}

export function signPayload(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getAuthSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string): T | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", getAuthSecret())
    .update(encoded)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
    if (typeof parsed.exp === "number" && parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hashPin(pin: string): string {
  return createHmac("sha256", getAuthSecret()).update(`report-pin:${pin}`).digest("hex");
}

export function verifyPin(pin: string, storedHash: string | null): boolean {
  if (!storedHash) return true;
  const a = Buffer.from(hashPin(pin), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashUserPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const derived = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${derived}`;
}

export function verifyUserPassword(password: string, storedHash: string): boolean {
  const [scheme, salt, expectedText] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !expectedText) return false;
  try {
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedText, "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
