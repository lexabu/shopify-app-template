import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getAnalyzedProducts,
  getOptimizationSummary,
} from "../services/product-optimizer-queue.server";

/**
 * GET /api/optimize/products
 * Get analyzed products with optional filters
 *
 * Query params:
 * - minScore: minimum optimization score (0-100)
 * - maxScore: maximum optimization score (0-100)
 * - limit: number of products to return (default 50)
 * - offset: pagination offset (default 0)
 * - sortBy: "score" | "issues" | "recent" (default "score")
 * - includeSummary: include summary stats (default false)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Parse query parameters
    const url = new URL(request.url);
    const minScore = parseInt(url.searchParams.get("minScore") || "0");
    const maxScore = parseInt(url.searchParams.get("maxScore") || "100");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const sortBy = (url.searchParams.get("sortBy") || "score") as
      | "score"
      | "issues"
      | "recent";
    const includeSummary = url.searchParams.get("includeSummary") === "true";

    // Fetch products
    const result = await getAnalyzedProducts(shop, {
      minScore,
      maxScore,
      limit,
      offset,
      sortBy,
    });

    // Optionally fetch summary stats
    let summary = null;
    if (includeSummary) {
      summary = await getOptimizationSummary(shop);
    }

    return new Response(
      JSON.stringify({
        ...result,
        summary,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching analyzed products:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch analyzed products",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
