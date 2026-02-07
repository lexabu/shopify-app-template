import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { submitFeedback, FeedbackType } from "../services/feedback.server";
import { trackEvent, EventCategory, AnalyticsEvents } from "../services/analytics.server";

/**
 * POST /api/feedback
 * Submit user feedback
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const body = await request.json();
    const { type, message, rating, page } = body;

    // Validate required fields
    if (!type || !message) {
      return new Response(
        JSON.stringify({ error: "Type and message are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate type
    const validTypes = Object.values(FeedbackType);
    if (!validTypes.includes(type)) {
      return new Response(
        JSON.stringify({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate rating for NPS
    if (type === FeedbackType.NPS && (rating === undefined || rating < 0 || rating > 10)) {
      return new Response(
        JSON.stringify({ error: "NPS rating must be between 0 and 10" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Submit feedback
    const feedback = await submitFeedback({
      shop,
      type,
      message,
      rating,
      page,
      metadata: {
        userAgent: request.headers.get("user-agent"),
        submittedAt: new Date().toISOString(),
      },
    });

    // Track the feedback submission
    await trackEvent({
      shop,
      event: AnalyticsEvents.FEATURE_USED,
      category: EventCategory.FEEDBACK,
      action: "feedback_submitted",
      label: type,
      value: rating,
    });

    return new Response(
      JSON.stringify({ success: true, feedback }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error submitting feedback:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Failed to submit feedback", details: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
