import type { LoaderFunctionArgs } from "react-router";
import { getGoldPrices } from "../services/gold-price.server";
import db from "../db.server";

/**
 * Build CORS headers for storefront requests.
 * Allows the shop's own domain to make cross-origin requests.
 */
function buildCorsHeaders(request: Request, shopDomain?: string) {
  const origin = request.headers.get("Origin");
  // Allow the shop's own domain, or fall back to the origin
  const allowOrigin =
    origin && shopDomain && origin.includes(shopDomain.replace(".myshopify.com", ""))
      ? origin
      : origin || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
}

/**
 * App Proxy handler.
 * Shopify proxies storefront requests from:
 *   https://{shop}.myshopify.com/apps/gold-ticker/*
 * to this route.
 *
 * Shopify adds query params: shop, logged_in_customer_id, timestamp, signature, etc.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(request, shopDomain || undefined),
    });
  }

  const corsHeaders = buildCorsHeaders(request, shopDomain || undefined);

  if (!shopDomain) {
    return new Response(JSON.stringify({ error: "Missing shop parameter" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }

  try {
    // Get shop settings (or defaults)
    const settings = await db.shopSettings.findUnique({
      where: { shop: shopDomain },
    });

    // Check if ticker is active
    if (settings && !settings.isActive) {
      return new Response(
        JSON.stringify({ isActive: false, prices: {} }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
            ...corsHeaders,
          },
        },
      );
    }

    // Fetch gold prices (cached internally with 5-min TTL)
    const priceData = await getGoldPrices();

    // Filter to only enabled karats
    const enabledKarats = (settings?.karats || "24,22,21,18,14")
      .split(",")
      .map((k) => k.trim());

    const filteredPrices: Record<string, unknown> = {};
    for (const karat of enabledKarats) {
      const key = `${karat}K`;
      if (priceData.prices[key]) {
        filteredPrices[key] = priceData.prices[key];
      }
    }

    const response = {
      spotPrice: priceData.spotPrice,
      prices: filteredPrices,
      fetchedAt: new Date(priceData.fetchedAt).toISOString(),
      source: priceData.source,
      settings: {
        colorScheme: settings?.colorScheme || "dark",
        bgColor: settings?.bgColor || "#1a1a2e",
        textColor: settings?.textColor || "#e8d44d",
        tickerSpeed: settings?.tickerSpeed || 50,
        position: settings?.position || "top",
        currencySymbol: settings?.currencySymbol || "$",
        isActive: true,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Gold price proxy error:", error);

    return new Response(
      JSON.stringify({
        error: "Unable to fetch gold prices",
        prices: {},
        fetchedAt: new Date().toISOString(),
        settings: { isActive: false },
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          ...corsHeaders,
        },
      },
    );
  }
}
