import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { trackEvent } from "../services/analytics.server";

/**
 * POST /api/analytics/track
 * Track an analytics event from the client
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const body = await request.json();
    const { event, category, action, label, value, metadata, sessionId } = body;

    // Validate required fields
    if (!event || !category) {
      return new Response(
        JSON.stringify({ error: "Event and category are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Track the event
    await trackEvent({
      shop,
      event,
      category,
      action,
      label,
      value,
      metadata,
      sessionId,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error tracking event:", error);
    // Don't return error to client - analytics should fail silently
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};
