/**
 * In-memory rate limiter for chat endpoints
 *
 * Limits:
 * - Per Shop: 30 requests/minute, 5,000 requests/day
 * - Per Session/Customer: 2 requests/minute (10 in dev), 15 requests/hour
 * - Per IP: 5 requests/minute, 30 requests/hour
 *
 * Tracking:
 * - Shop: minute, hour (for dashboard), day
 * - Session: minute, hour
 * - IP: minute, hour
 *
 * Development Mode:
 * Set RATE_LIMIT_DEV_MODE=true in .env to relax limits for testing
 */

// Check if we're in development mode (relaxed limits for testing)
const DEV_MODE = process.env.RATE_LIMIT_DEV_MODE === "true";

// Log mode on startup
if (DEV_MODE) {
  console.log("⚠️  Rate Limiter DEV MODE enabled - Relaxed limits for testing");
} else {
  console.log("✅ Rate Limiter PRODUCTION MODE - Strict limits enabled");
}

interface RateLimitEntry {
  count: number;
  resetAt: number; // timestamp in ms
}

interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  resetAt?: number;
  message?: string;
}

interface RejectionStats {
  shop_minute: number;
  shop_day: number;
  session_minute: number;
  session_hour: number;
  ip_minute: number;
  ip_hour: number;
  total: number;
  last_updated: number;
}

class RateLimiter {
  // Shop limits
  private shopMinute: Map<string, RateLimitEntry> = new Map();
  private shopHour: Map<string, RateLimitEntry> = new Map();
  private shopDay: Map<string, RateLimitEntry> = new Map();

  // Session/Customer limits
  private sessionMinute: Map<string, RateLimitEntry> = new Map();
  private sessionHour: Map<string, RateLimitEntry> = new Map();

  // IP-based limits
  private ipMinute: Map<string, RateLimitEntry> = new Map();
  private ipHour: Map<string, RateLimitEntry> = new Map();

  // Analytics tracking (resets daily)
  private aiQueries: Map<string, RateLimitEntry> = new Map();
  private basicQueries: Map<string, RateLimitEntry> = new Map();
  private fallbackUsed: Map<string, RateLimitEntry> = new Map();

  // Rate limit rejection tracking (per shop, resets daily)
  private rejections: Map<string, RejectionStats> = new Map();

  // Cleanup intervals
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Check rate limits for a shop, session/customer, and IP address
   */
  checkLimit(shopId: string, sessionId: string, ipAddress?: string): RateLimitResult {
    const now = Date.now();

    // Check shop limits first (affects all users of the shop)
    const shopMinuteCheck = this.checkShopMinuteLimit(shopId, now);
    if (!shopMinuteCheck.allowed) {
      this.trackRejection(shopId, "shop_minute");
      return shopMinuteCheck;
    }

    const shopDayCheck = this.checkShopDayLimit(shopId, now);
    if (!shopDayCheck.allowed) {
      this.trackRejection(shopId, "shop_day");
      return shopDayCheck;
    }

    // Check session/customer limits
    const sessionMinuteCheck = this.checkSessionMinuteLimit(sessionId, now);
    if (!sessionMinuteCheck.allowed) {
      this.trackRejection(shopId, "session_minute");
      return sessionMinuteCheck;
    }

    const sessionHourCheck = this.checkSessionHourLimit(sessionId, now);
    if (!sessionHourCheck.allowed) {
      this.trackRejection(shopId, "session_hour");
      return sessionHourCheck;
    }

    // Check IP-based limits if IP address is provided
    if (ipAddress) {
      const ipMinuteCheck = this.checkIpMinuteLimit(ipAddress, now);
      if (!ipMinuteCheck.allowed) {
        this.trackRejection(shopId, "ip_minute");
        return ipMinuteCheck;
      }

      const ipHourCheck = this.checkIpHourLimit(ipAddress, now);
      if (!ipHourCheck.allowed) {
        this.trackRejection(shopId, "ip_hour");
        return ipHourCheck;
      }
    }

    return { allowed: true };
  }

  /**
   * Record a successful request (increment counters)
   */
  recordRequest(shopId: string, sessionId: string, ipAddress?: string): void {
    const now = Date.now();

    // Increment shop counters
    this.increment(this.shopMinute, shopId, now, 60 * 1000); // 1 minute
    this.increment(this.shopHour, shopId, now, 60 * 60 * 1000); // 1 hour
    this.increment(this.shopDay, shopId, now, 24 * 60 * 60 * 1000); // 24 hours

    // Increment session counters
    this.increment(this.sessionMinute, sessionId, now, 60 * 1000); // 1 minute
    this.increment(this.sessionHour, sessionId, now, 60 * 60 * 1000); // 1 hour

    // Increment IP counters if IP address is provided
    if (ipAddress) {
      this.increment(this.ipMinute, ipAddress, now, 60 * 1000); // 1 minute
      this.increment(this.ipHour, ipAddress, now, 60 * 60 * 1000); // 1 hour
    }
  }

  private checkShopMinuteLimit(shopId: string, now: number): RateLimitResult {
    const limit = 30;
    const entry = this.shopMinute.get(shopId);

    if (!entry || now >= entry.resetAt) {
      return { allowed: true };
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        message: "Our service is experiencing high traffic. Please try again shortly.",
      };
    }

    return { allowed: true, remaining: limit - entry.count };
  }

  private checkShopDayLimit(shopId: string, now: number): RateLimitResult {
    const limit = 5000;
    const entry = this.shopDay.get(shopId);

    if (!entry || now >= entry.resetAt) {
      return { allowed: true };
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        message: "Our service is experiencing high traffic. Please try again shortly.",
      };
    }

    return { allowed: true, remaining: limit - entry.count };
  }

  private checkSessionMinuteLimit(sessionId: string, now: number): RateLimitResult {
    // Use higher limit in dev mode for easier testing
    const limit = DEV_MODE ? 10 : 2;
    const entry = this.sessionMinute.get(sessionId);

    if (!entry || now >= entry.resetAt) {
      return { allowed: true };
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        message: "You're sending messages too quickly. Please wait a moment before trying again.",
      };
    }

    return { allowed: true, remaining: limit - entry.count };
  }

  private checkSessionHourLimit(sessionId: string, now: number): RateLimitResult {
    const limit = 15;
    const entry = this.sessionHour.get(sessionId);

    if (!entry || now >= entry.resetAt) {
      return { allowed: true };
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        message: "You're sending messages too quickly. Please wait a moment before trying again.",
      };
    }

    return { allowed: true, remaining: limit - entry.count };
  }

  private checkIpMinuteLimit(ipAddress: string, now: number): RateLimitResult {
    const limit = 5;
    const entry = this.ipMinute.get(ipAddress);

    if (!entry || now >= entry.resetAt) {
      return { allowed: true };
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        message: "Too many requests from your location. Please wait a moment before trying again.",
      };
    }

    return { allowed: true, remaining: limit - entry.count };
  }

  private checkIpHourLimit(ipAddress: string, now: number): RateLimitResult {
    const limit = 30;
    const entry = this.ipHour.get(ipAddress);

    if (!entry || now >= entry.resetAt) {
      return { allowed: true };
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        message: "Too many requests from your location. Please wait a moment before trying again.",
      };
    }

    return { allowed: true, remaining: limit - entry.count };
  }

  private increment(map: Map<string, RateLimitEntry>, key: string, now: number, windowMs: number): void {
    const entry = map.get(key);

    if (!entry || now >= entry.resetAt) {
      // Create new entry or reset expired one
      map.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
    } else {
      // Increment existing entry
      entry.count++;
    }
  }

  private cleanup(): void {
    const now = Date.now();

    // Clean up expired entries to prevent memory leaks
    this.cleanupMap(this.shopMinute, now);
    this.cleanupMap(this.shopHour, now);
    this.cleanupMap(this.shopDay, now);
    this.cleanupMap(this.sessionMinute, now);
    this.cleanupMap(this.sessionHour, now);
    this.cleanupMap(this.ipMinute, now);
    this.cleanupMap(this.ipHour, now);

    // Clean up analytics (daily reset)
    this.cleanupMap(this.aiQueries, now);
    this.cleanupMap(this.basicQueries, now);
    this.cleanupMap(this.fallbackUsed, now);

    // Clean up rejection stats (daily reset)
    const windowMs = 24 * 60 * 60 * 1000;
    for (const [shopId, stats] of this.rejections.entries()) {
      if (now >= stats.last_updated + windowMs) {
        this.rejections.delete(shopId);
      }
    }
  }

  private cleanupMap(map: Map<string, RateLimitEntry>, now: number): void {
    for (const [key, entry] of map.entries()) {
      if (now >= entry.resetAt) {
        map.delete(key);
      }
    }
  }

  /**
   * Get current stats for a shop (useful for debugging/monitoring)
   */
  getShopStats(shopId: string): { minute: number; hour: number; day: number } {
    const now = Date.now();
    const minute = this.shopMinute.get(shopId);
    const hour = this.shopHour.get(shopId);
    const day = this.shopDay.get(shopId);

    return {
      minute: minute && now < minute.resetAt ? minute.count : 0,
      hour: hour && now < hour.resetAt ? hour.count : 0,
      day: day && now < day.resetAt ? day.count : 0,
    };
  }

  /**
   * Get current stats for a session (useful for debugging/monitoring)
   */
  getSessionStats(sessionId: string): { minute: number; hour: number } {
    const now = Date.now();
    const minute = this.sessionMinute.get(sessionId);
    const hour = this.sessionHour.get(sessionId);

    return {
      minute: minute && now < minute.resetAt ? minute.count : 0,
      hour: hour && now < hour.resetAt ? hour.count : 0,
    };
  }

  /**
   * Get current stats for an IP address (useful for debugging/monitoring)
   */
  getIpStats(ipAddress: string): { minute: number; hour: number } {
    const now = Date.now();
    const minute = this.ipMinute.get(ipAddress);
    const hour = this.ipHour.get(ipAddress);

    return {
      minute: minute && now < minute.resetAt ? minute.count : 0,
      hour: hour && now < hour.resetAt ? hour.count : 0,
    };
  }

  /**
   * Track an AI-powered query for analytics
   */
  trackAiQuery(shopId: string): void {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000; // 24 hours
    this.increment(this.aiQueries, shopId, now, windowMs);
  }

  /**
   * Track a basic (non-AI) query for analytics
   */
  trackBasicQuery(shopId: string): void {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000; // 24 hours
    this.increment(this.basicQueries, shopId, now, windowMs);
  }

  /**
   * Track when fallback to popular products is used
   */
  trackFallback(shopId: string): void {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000; // 24 hours
    this.increment(this.fallbackUsed, shopId, now, windowMs);
  }

  /**
   * Get analytics stats for a shop (daily totals)
   */
  getAnalyticsStats(shopId: string): {
    ai_queries: number;
    basic_queries: number;
    fallback_used: number;
  } {
    const now = Date.now();
    const ai = this.aiQueries.get(shopId);
    const basic = this.basicQueries.get(shopId);
    const fallback = this.fallbackUsed.get(shopId);

    return {
      ai_queries: ai && now < ai.resetAt ? ai.count : 0,
      basic_queries: basic && now < basic.resetAt ? basic.count : 0,
      fallback_used: fallback && now < fallback.resetAt ? fallback.count : 0,
    };
  }

  /**
   * Track a rate limit rejection
   */
  private trackRejection(
    shopId: string,
    type: "shop_minute" | "shop_day" | "session_minute" | "session_hour" | "ip_minute" | "ip_hour"
  ): void {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000; // 24 hours

    let stats = this.rejections.get(shopId);

    // Initialize or reset if expired
    if (!stats || now >= stats.last_updated + windowMs) {
      stats = {
        shop_minute: 0,
        shop_day: 0,
        session_minute: 0,
        session_hour: 0,
        ip_minute: 0,
        ip_hour: 0,
        total: 0,
        last_updated: now,
      };
      this.rejections.set(shopId, stats);
    }

    // Increment the specific type and total
    stats[type]++;
    stats.total++;
    stats.last_updated = now;
  }

  /**
   * Get rate limit rejection stats for a shop (last 24 hours)
   */
  getRejectionStats(shopId: string): RejectionStats {
    const now = Date.now();
    const stats = this.rejections.get(shopId);
    const windowMs = 24 * 60 * 60 * 1000;

    // Return stats if they exist and haven't expired
    if (stats && now < stats.last_updated + windowMs) {
      return stats;
    }

    // Return empty stats if none exist or expired
    return {
      shop_minute: 0,
      shop_day: 0,
      session_minute: 0,
      session_hour: 0,
      ip_minute: 0,
      ip_hour: 0,
      total: 0,
      last_updated: now,
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
