import db from "../db.server";

/**
 * Analytics event categories
 */
export const EventCategory = {
  NAVIGATION: "navigation",
  OPTIMIZER: "optimizer",
  CHAT: "chat",
  SETTINGS: "settings",
  DASHBOARD: "dashboard",
  FEEDBACK: "feedback",
} as const;

/**
 * Common analytics events
 */
export const AnalyticsEvents = {
  // Navigation
  PAGE_VIEW: "page_view",

  // Optimizer
  OPTIMIZER_SCAN_STARTED: "optimizer_scan_started",
  OPTIMIZER_SCAN_COMPLETED: "optimizer_scan_completed",
  OPTIMIZER_PRODUCT_VIEWED: "optimizer_product_viewed",
  OPTIMIZER_SUGGESTIONS_GENERATED: "optimizer_suggestions_generated",
  OPTIMIZER_CHANGES_APPLIED: "optimizer_changes_applied",
  OPTIMIZER_CHANGES_SKIPPED: "optimizer_changes_skipped",

  // Chat
  CHAT_MESSAGE_SENT: "chat_message_sent",
  CHAT_PRODUCT_CLICKED: "chat_product_clicked",

  // Settings
  SETTINGS_UPDATED: "settings_updated",
  CUSTOM_CONTEXT_UPDATED: "custom_context_updated",

  // Dashboard
  DASHBOARD_VIEWED: "dashboard_viewed",

  // Feature usage
  FEATURE_USED: "feature_used",
  BUTTON_CLICKED: "button_clicked",
  ERROR_OCCURRED: "error_occurred",
} as const;

type TrackEventParams = {
  shop: string;
  event: string;
  category: string;
  action?: string;
  label?: string;
  value?: number;
  metadata?: Record<string, any>;
  sessionId?: string;
};

/**
 * Track an analytics event
 */
export async function trackEvent({
  shop,
  event,
  category,
  action,
  label,
  value,
  metadata,
  sessionId,
}: TrackEventParams): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: {
        shop,
        event,
        category,
        action,
        label,
        value,
        metadata: metadata || undefined,
        sessionId,
      },
    });
  } catch (error) {
    // Don't let analytics errors break the app
    console.error("Failed to track analytics event:", error);
  }
}

/**
 * Track a page view
 */
export async function trackPageView(
  shop: string,
  page: string,
  sessionId?: string
): Promise<void> {
  await trackEvent({
    shop,
    event: AnalyticsEvents.PAGE_VIEW,
    category: EventCategory.NAVIGATION,
    label: page,
    sessionId,
  });
}

/**
 * Track feature usage
 */
export async function trackFeatureUsage(
  shop: string,
  feature: string,
  action?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await trackEvent({
    shop,
    event: AnalyticsEvents.FEATURE_USED,
    category: feature,
    action,
    metadata,
  });
}

/**
 * Track an error
 */
export async function trackError(
  shop: string,
  errorType: string,
  errorMessage: string,
  metadata?: Record<string, any>
): Promise<void> {
  await trackEvent({
    shop,
    event: AnalyticsEvents.ERROR_OCCURRED,
    category: "error",
    action: errorType,
    label: errorMessage,
    metadata,
  });
}

/**
 * Get analytics summary for a shop
 */
export async function getShopAnalytics(shop: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [
    totalEvents,
    eventsByCategory,
    eventsByDay,
    topEvents,
    recentErrors,
  ] = await Promise.all([
    // Total events
    db.analyticsEvent.count({
      where: { shop, createdAt: { gte: startDate } },
    }),

    // Events by category
    db.analyticsEvent.groupBy({
      by: ["category"],
      where: { shop, createdAt: { gte: startDate } },
      _count: true,
    }),

    // Events by day (for charts)
    db.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as count
      FROM AnalyticsEvent
      WHERE shop = ${shop} AND createdAt >= ${startDate.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    ` as Promise<Array<{ date: string; count: number }>>,

    // Top events
    db.analyticsEvent.groupBy({
      by: ["event"],
      where: { shop, createdAt: { gte: startDate } },
      _count: true,
      orderBy: { _count: { event: "desc" } },
      take: 10,
    }),

    // Recent errors
    db.analyticsEvent.findMany({
      where: {
        shop,
        event: AnalyticsEvents.ERROR_OCCURRED,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    totalEvents,
    eventsByCategory: eventsByCategory.map((e) => ({
      category: e.category,
      count: e._count,
    })),
    eventsByDay,
    topEvents: topEvents.map((e) => ({
      event: e.event,
      count: e._count,
    })),
    recentErrors,
  };
}

/**
 * Get aggregated analytics across all shops (for app owner)
 */
export async function getGlobalAnalytics(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [
    totalEvents,
    uniqueShops,
    eventsByCategory,
    topEvents,
    activeShops,
    eventsByDay,
  ] = await Promise.all([
    // Total events
    db.analyticsEvent.count({
      where: { createdAt: { gte: startDate } },
    }),

    // Unique shops with activity
    db.analyticsEvent.groupBy({
      by: ["shop"],
      where: { createdAt: { gte: startDate } },
    }),

    // Events by category
    db.analyticsEvent.groupBy({
      by: ["category"],
      where: { createdAt: { gte: startDate } },
      _count: true,
      orderBy: { _count: { category: "desc" } },
    }),

    // Top events across all shops
    db.analyticsEvent.groupBy({
      by: ["event"],
      where: { createdAt: { gte: startDate } },
      _count: true,
      orderBy: { _count: { event: "desc" } },
      take: 20,
    }),

    // Most active shops
    db.analyticsEvent.groupBy({
      by: ["shop"],
      where: { createdAt: { gte: startDate } },
      _count: true,
      orderBy: { _count: { shop: "desc" } },
      take: 10,
    }),

    // Events by day
    db.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as count
      FROM AnalyticsEvent
      WHERE createdAt >= ${startDate.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    ` as Promise<Array<{ date: string; count: number }>>,
  ]);

  return {
    totalEvents,
    uniqueShopsCount: uniqueShops.length,
    eventsByCategory: eventsByCategory.map((e) => ({
      category: e.category,
      count: e._count,
    })),
    topEvents: topEvents.map((e) => ({
      event: e.event,
      count: e._count,
    })),
    activeShops: activeShops.map((s) => ({
      shop: s.shop,
      eventCount: s._count,
    })),
    eventsByDay,
  };
}
