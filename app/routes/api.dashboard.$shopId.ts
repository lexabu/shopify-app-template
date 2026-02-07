import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { rateLimiter } from "../services/rate-limiter.server";

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const startDate = parseDate(url.searchParams.get("start_date"));
  const endDate = parseDate(url.searchParams.get("end_date"));

  const dateFilter =
    startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
      : {};

  // Get today's date range for "today" stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    conversationCount,
    conversionAggregate,
    topQueries,
    // Optimizer analytics
    totalSuggestionsGenerated,
    totalChangesApplied,
    changesAppliedToday,
    productsAnalyzed,
  ] = await Promise.all([
    db.conversation.count({ where: { shop, ...dateFilter } }),
    db.conversion.aggregate({
      where: { shop, ...dateFilter },
      _count: true,
      _sum: { orderTotal: true, commissionAmount: true },
    }),
    db.conversation.groupBy({
      by: ["message"],
      where: { shop, ...dateFilter },
      _count: { message: true },
      orderBy: { _count: { message: "desc" } },
      take: 5,
    }),
    // Total AI suggestions generated (all time)
    db.productOptimization.count({ where: { shop } }),
    // Total changes applied (all time)
    db.productOptimization.count({ where: { shop, status: "applied" } }),
    // Changes applied today
    db.productOptimization.count({
      where: {
        shop,
        status: "applied",
        appliedAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    // Total products analyzed
    db.productAnalysis.count({ where: { shop } }),
  ]);

  const conversions = conversionAggregate._count || 0;
  const attributedRevenue = Number(conversionAggregate._sum.orderTotal || 0);
  const commissionOwed = Number(conversionAggregate._sum.commissionAmount || 0);

  // Get current rate limit usage for this shop
  const rateLimitStats = rateLimiter.getShopStats(shop);

  // Get analytics stats for this shop
  const analyticsStats = rateLimiter.getAnalyticsStats(shop);

  // Get rate limit rejection stats for this shop
  const rejectionStats = rateLimiter.getRejectionStats(shop);

  const response = {
    conversations: conversationCount,
    conversions,
    conversion_rate:
      conversationCount > 0 ? conversions / conversationCount : 0,
    attributed_revenue: attributedRevenue,
    commission_owed: commissionOwed,
    top_queries: topQueries.map((entry) => entry.message),
    top_products: [],
    rate_limiting: {
      current_minute: rateLimitStats.minute,
      max_per_minute: 30,
      current_hour: rateLimitStats.hour,
      max_per_hour: 1800, // 30 per minute * 60 minutes
      current_day: rateLimitStats.day,
      max_per_day: 5000,
      percentage_used_minute: (rateLimitStats.minute / 30) * 100,
      percentage_used_hour: (rateLimitStats.hour / 1800) * 100,
      percentage_used_day: (rateLimitStats.day / 5000) * 100,
    },
    analytics: {
      ai_queries: analyticsStats.ai_queries,
      basic_queries: analyticsStats.basic_queries,
      fallback_used: analyticsStats.fallback_used,
      total_queries: analyticsStats.ai_queries + analyticsStats.basic_queries,
    },
    rate_limit_rejections: {
      total: rejectionStats.total,
      by_type: {
        shop_minute: rejectionStats.shop_minute,
        shop_day: rejectionStats.shop_day,
        session_minute: rejectionStats.session_minute,
        session_hour: rejectionStats.session_hour,
        ip_minute: rejectionStats.ip_minute,
        ip_hour: rejectionStats.ip_hour,
      },
      last_updated: rejectionStats.last_updated,
    },
    product_optimizer: {
      products_analyzed: productsAnalyzed,
      suggestions_generated: totalSuggestionsGenerated,
      changes_applied_total: totalChangesApplied,
      changes_applied_today: changesAppliedToday,
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
