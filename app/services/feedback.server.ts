import db from "../db.server";

export const FeedbackType = {
  BUG: "bug",
  FEATURE_REQUEST: "feature_request",
  GENERAL: "general",
  NPS: "nps",
} as const;

export const FeedbackStatus = {
  NEW: "new",
  REVIEWED: "reviewed",
  RESOLVED: "resolved",
  ARCHIVED: "archived",
} as const;

type SubmitFeedbackParams = {
  shop: string;
  type: string;
  message: string;
  rating?: number;
  page?: string;
  metadata?: Record<string, any>;
};

/**
 * Submit user feedback
 */
export async function submitFeedback({
  shop,
  type,
  message,
  rating,
  page,
  metadata,
}: SubmitFeedbackParams) {
  return db.feedback.create({
    data: {
      shop,
      type,
      message,
      rating,
      page,
      metadata: metadata || undefined,
      status: FeedbackStatus.NEW,
    },
  });
}

/**
 * Get feedback for a specific shop
 */
export async function getShopFeedback(shop: string) {
  return db.feedback.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get all feedback (for app owner)
 */
export async function getAllFeedback(options?: {
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const { type, status, limit = 50, offset = 0 } = options || {};

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;

  const [feedback, total] = await Promise.all([
    db.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.feedback.count({ where }),
  ]);

  return { feedback, total };
}

/**
 * Update feedback status
 */
export async function updateFeedbackStatus(id: string, status: string) {
  return db.feedback.update({
    where: { id },
    data: { status },
  });
}

/**
 * Get feedback summary statistics
 */
export async function getFeedbackSummary() {
  const [
    totalFeedback,
    byType,
    byStatus,
    averageNpsRating,
    recentFeedback,
  ] = await Promise.all([
    db.feedback.count(),

    db.feedback.groupBy({
      by: ["type"],
      _count: true,
    }),

    db.feedback.groupBy({
      by: ["status"],
      _count: true,
    }),

    db.feedback.aggregate({
      where: { type: FeedbackType.NPS, rating: { not: null } },
      _avg: { rating: true },
    }),

    db.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    totalFeedback,
    byType: byType.map((t) => ({ type: t.type, count: t._count })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
    averageNpsRating: averageNpsRating._avg.rating,
    recentFeedback,
  };
}
