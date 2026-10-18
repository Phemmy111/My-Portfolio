/**
 * High-Performance In-Memory Sliding-Window Rate Limiter & Anti-Spam Guard
 * Prevents deliberate spamming, bot loops, and token exhaustion across multi-tenant WhatsApp bots.
 */

interface RateLimitRecord {
  timestamps: number[];
  warningSentAt?: number;
}

// In-memory sliding window cache
const windowCache = new Map<string, RateLimitRecord>();

// Clean up stale entries every 3 minutes to keep memory footprint near zero
let cleanupInterval: NodeJS.Timeout | null = null;
function ensureCleanupSchedule() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of windowCache.entries()) {
      // Remove records whose newest timestamp is older than 2 minutes
      const newest = record.timestamps[record.timestamps.length - 1];
      if (!newest || now - newest > 120_000) {
        windowCache.delete(key);
      }
    }
  }, 180_000);
  if (cleanupInterval.unref) cleanupInterval.unref();
}

export interface SpamCheckResult {
  allowed: boolean;
  sendWarning: boolean;
  warningMessage?: string;
  retryAfterSeconds: number;
}

/**
 * Checks sliding window message rate for a specific phone number within a workspace.
 *
 * Defaults:
 * - Window: 25 seconds
 * - Max allowed messages: 7 messages
 * - Cooldown warning debounce: 40 seconds (warns only once per spam burst)
 */
export function checkCustomerSpamRateLimit(params: {
  workspaceId: string;
  phone: string;
  maxMessages?: number;
  windowSeconds?: number;
  businessName?: string;
}): SpamCheckResult {
  ensureCleanupSchedule();

  const {
    workspaceId,
    phone,
    maxMessages = 7,
    windowSeconds = 25,
    businessName = "our team",
  } = params;

  const cleanPhone = phone.replace(/\D/g, "");
  const key = `${workspaceId}:${cleanPhone}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  let record = windowCache.get(key);
  if (!record) {
    record = { timestamps: [] };
    windowCache.set(key, record);
  }

  // Filter out timestamps outside the active sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  // If under limit, record current timestamp and allow
  if (record.timestamps.length < maxMessages) {
    record.timestamps.push(now);
    return {
      allowed: true,
      sendWarning: false,
      retryAfterSeconds: 0,
    };
  }

  // Over limit! Calculate retry cooldown
  const oldestInWindow = record.timestamps[0];
  const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));

  // Determine if we should send a warning notice or silently drop to prevent echo spam
  const lastWarningAge = record.warningSentAt ? now - record.warningSentAt : Infinity;
  const shouldSendWarning = lastWarningAge > 40_000; // Only warn once every 40s

  if (shouldSendWarning) {
    record.warningSentAt = now;
  }

  const warningMessage =
    `⏳ *Please wait a moment!*\n\n` +
    `You are sending messages very quickly. Please give ${businessName}'s assistant a few seconds to finish responding before sending your next message! 🙏`;

  return {
    allowed: false,
    sendWarning: shouldSendWarning,
    warningMessage,
    retryAfterSeconds,
  };
}

/**
 * Manually reset rate limit for a specific phone number (e.g. after manual unblock).
 */
export function resetRateLimitForPhone(workspaceId: string, phone: string) {
  const cleanPhone = phone.replace(/\D/g, "");
  windowCache.delete(`${workspaceId}:${cleanPhone}`);
}
