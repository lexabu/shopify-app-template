import type { LoaderFunctionArgs } from "react-router";
import { generateSuggestedQueries } from "../services/openai.server";
import { analyzeShopCatalog } from "../services/shopify-products.server";

/**
 * API endpoint to get contextual suggested queries for a shop's chat widget.
 * Generates fresh suggestions on every request.
 *
 * This route is accessed via Shopify's app proxy at:
 * https://{shop-domain}/apps/product-finder/chat/suggestions
 */

// Handle OPTIONS requests for CORS preflight
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    // Parse query parameters that Shopify adds to proxied requests
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop");

    if (!shopDomain) {
      return new Response(
        JSON.stringify({ error: "Missing shop parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const shop = shopDomain.trim();

    console.log("🔄 Generating fresh suggestions for shop:", shop);

    // Analyze shop catalog
    const catalogData = await analyzeShopCatalog(shop);

    // Generate suggestions using AI
    const suggestions = await generateSuggestedQueries(catalogData);

    if (!suggestions || suggestions.length === 0) {
      // Return default suggestions if AI fails
      const defaultSuggestions = [
        "Show me your best sellers",
        "I need a gift idea",
        "What's on sale?",
      ];

      return new Response(
        JSON.stringify({ queries: defaultSuggestions }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache", // No caching
          },
        }
      );
    }

    console.log("✅ Generated suggestions:", suggestions);

    return new Response(
      JSON.stringify({ queries: suggestions }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache", // No caching
        },
      }
    );
  } catch (error) {
    console.error("Error generating suggestions:", error);

    // Return default suggestions on error
    const defaultSuggestions = [
      "Show me your best sellers",
      "I need a gift idea",
      "What's on sale?",
    ];

    return new Response(
      JSON.stringify({ queries: defaultSuggestions }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache", // No caching
        },
      }
    );
  }
};
