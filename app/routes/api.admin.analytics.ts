import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getGlobalAnalytics } from "../services/analytics.server";
import { getFeedbackSummary, getAllFeedback } from "../services/feedback.server";

/**
 * GET /api/admin/analytics
 * Get global analytics data for app owner
 * Protected by secret key - only accessible with correct ADMIN_SECRET
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);

  // Check for admin secret key
  const adminSecret = process.env.ADMIN_SECRET;
  const providedKey = url.searchParams.get("key");

  if (!adminSecret || providedKey !== adminSecret) {
    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const includeFeedback = url.searchParams.get("feedback") === "true";

  try {
    const [analytics, feedbackData] = await Promise.all([
      getGlobalAnalytics(days),
      includeFeedback ? getFeedbackSummary() : null,
    ]);

    return new Response(
      JSON.stringify({
        analytics,
        feedback: feedbackData,
        period: `Last ${days} days`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching admin analytics:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch analytics" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
