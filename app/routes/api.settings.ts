import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import {
  getCustomContext,
  setCustomContext,
} from "../services/shopify-metafields.server";

/**
 * GET /api/settings
 * Fetch shop settings including custom context from Shopify Metafields
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Fetch custom context from Shopify Metafields
    const customContext = await getCustomContext(admin);

    // Get commission rate from database (still stored there)
    const shopRecord = await db.shop.upsert({
      where: { shop },
      update: {},
      create: {
        shop,
        shopDomain: shop,
        lastActiveAt: new Date(),
      },
      select: {
        commissionRate: true,
      },
    });

    return new Response(
      JSON.stringify({
        customContext: customContext || "",
        commissionRate: shopRecord.commissionRate,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching shop settings:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * PUT /api/settings
 * Update shop settings - saves custom context to Shopify Metafields
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  if (request.method !== "PUT") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { customContext } = body;

    // Validate customContext
    if (customContext !== undefined && typeof customContext !== "string") {
      return new Response(
        JSON.stringify({ error: "customContext must be a string" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate length (Shopify metafields support up to 5MB, but we limit to 2000 chars for UX)
    if (customContext && customContext.length > 2000) {
      return new Response(
        JSON.stringify({
          error: "customContext must be less than 2000 characters",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Save to Shopify Metafields
    await setCustomContext(admin, customContext || "");

    // Ensure shop record exists in database (for other fields like commission rate)
    await db.shop.upsert({
      where: { shop },
      update: {
        lastActiveAt: new Date(),
      },
      create: {
        shop,
        shopDomain: shop,
        lastActiveAt: new Date(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        customContext: customContext || "",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error updating shop settings:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
