import crypto from "crypto";
import { sql } from "./db";

export interface CacheCheckResult {
  hit: boolean;
  response?: string;
  source?: "database_cache" | "instant_intent_match";
}

/**
 * Normalizes query string for reliable cache matching
 */
function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates deterministic hash for workspace + normalized query
 */
function hashQuery(workspaceId: string, normalizedText: string): string {
  return crypto
    .createHash("sha256")
    .update(`${workspaceId}:${normalizedText}`)
    .digest("hex");
}

/**
 * Checks if incoming query matches a high-confidence recurring FAQ intent
 * that can be answered immediately from workspace settings in < 15ms.
 */
export function matchInstantFAQIntent(params: {
  userQuery: string;
  businessName: string;
  bioContext?: string;
  catalogSummary?: string;
  ownerName?: string;
}): CacheCheckResult {
  const norm = normalizeQuery(params.userQuery);

  // 1. Account Details / Bank Information
  const isBankInquiry = /\b(account number|bank details|account details|how to pay|send account|bank account|pay to|payment details)\b/i.test(norm);
  if (isBankInquiry && params.bioContext) {
    const bankMatch = params.bioContext.match(/(?:bank|account|acct|gtb|zenith|access|uba|opay|palmpay|kuda)[:\s]+([^\n.]+)/i);
    if (bankMatch) {
      return {
        hit: true,
        source: "instant_intent_match",
        response: `Here are the official payment details for *${params.businessName}*:\n\n💳 *${bankMatch[0].trim()}*\n\nOnce paid, please send your payment receipt or screenshot right here for instant confirmation! 👍`,
      };
    }
  }

  // 2. Physical Location / Office Address
  const isLocationInquiry = /\b(where are you located|where is your office|office address|physical address|location|your store|where to find you)\b/i.test(norm);
  if (isLocationInquiry && params.bioContext) {
    const addressMatch = params.bioContext.match(/(?:located|office|address|store|hub|center)[:\s]+([^\n.]+)/i);
    if (addressMatch) {
      return {
        hit: true,
        source: "instant_intent_match",
        response: `📍 *Location & Office Address:*\n\n${params.businessName} is located at:\n*${addressMatch[0].trim()}*\n\nFeel free to stop by during business hours or ask if you need driving directions!`,
      };
    }
  }

  return { hit: false };
}

/**
 * Checks Neon Postgres database for an unexpired cached response to this query
 */
export async function getCachedFAQResponse(
  workspaceId: string,
  userQuery: string
): Promise<CacheCheckResult> {
  if (!sql) return { hit: false };

  const norm = normalizeQuery(userQuery);
  // Only cache queries that are questions or inquiries (length >= 6 chars)
  if (norm.length < 6 || norm.length > 200) {
    return { hit: false };
  }

  const queryHash = hashQuery(workspaceId, norm);

  try {
    const rows = await sql`
      SELECT cached_response, hit_count
      FROM workspace_faq_cache
      WHERE workspace_id = ${workspaceId}
        AND query_hash = ${queryHash}
        AND expires_at > NOW()
      LIMIT 1
    `;

    if (rows && rows.length > 0) {
      const cached = rows[0].cached_response;
      // Increment hit count asynchronously in background
      sql`
        UPDATE workspace_faq_cache
        SET hit_count = hit_count + 1
        WHERE workspace_id = ${workspaceId} AND query_hash = ${queryHash}
      `.catch(() => {});

      return {
        hit: true,
        response: cached,
        source: "database_cache",
      };
    }
  } catch (err) {
    console.warn("[FAQ Cache] Error reading cache:", err);
  }

  return { hit: false };
}

/**
 * Stores an AI response in Neon Postgres FAQ cache for subsequent users
 */
export async function setCachedFAQResponse(params: {
  workspaceId: string;
  userQuery: string;
  response: string;
  ttlHours?: number;
}): Promise<void> {
  if (!sql) return;

  const { workspaceId, userQuery, response, ttlHours = 4 } = params;
  const norm = normalizeQuery(userQuery);

  // Skip caching very short or very long conversational inputs
  if (norm.length < 6 || norm.length > 200) return;
  // Skip caching if response indicates error or refusal
  if (!response || response.length < 15 || /please contact human|error|try again later/i.test(response)) return;

  const queryHash = hashQuery(workspaceId, norm);
  const id = `faq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    await sql`
      INSERT INTO workspace_faq_cache (id, workspace_id, query_hash, user_query, cached_response, expires_at)
      VALUES (${id}, ${workspaceId}, ${queryHash}, ${norm}, ${response}, NOW() + (${ttlHours + " hours"})::interval)
      ON CONFLICT (id) DO NOTHING
    `;
  } catch (err) {
    console.warn("[FAQ Cache] Error writing cache:", err);
  }
}
