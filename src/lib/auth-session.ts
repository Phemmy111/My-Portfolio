import crypto from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "obey_auth_session";
const SESSION_SECRET = process.env.CLERK_SECRET_KEY || process.env.ADMIN_SECRET || "obey_super_secret_session_key_2026";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface AuthSessionData {
  phone?: string;
  email?: string;
  workspaceSlug?: string;
  ownerName?: string;
  plan?: string;
  createdAt: number;
}

/**
 * Sign session payload with HMAC-SHA256
 */
export function signSession(data: AuthSessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const hmac = crypto.createHmac("sha256", SESSION_SECRET);
  hmac.update(payload);
  const signature = hmac.digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verify and decode session token
 */
export function verifySession(token: string): AuthSessionData | null {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;

    const hmac = crypto.createHmac("sha256", SESSION_SECRET);
    hmac.update(payload);
    const expected = hmac.digest("base64url");

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      const json = Buffer.from(payload, "base64url").toString("utf8");
      const data: AuthSessionData = JSON.parse(json);
      // Check expiration (30 days)
      if (Date.now() - data.createdAt > SESSION_MAX_AGE * 1000) {
        return null;
      }
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read current session from cookies in Server Components / Route Handlers
 */
export async function getAuthSession(): Promise<AuthSessionData | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifySession(token);
  } catch {
    return null;
  }
}

/**
 * Set session cookie
 */
export async function setAuthSession(data: AuthSessionData) {
  const token = signSession(data);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * Remove session cookie (logout)
 */
export async function clearAuthSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
