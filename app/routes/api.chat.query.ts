import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { extractKeywords, generateResponseText } from "../services/openai.server";
import { searchProducts, getPopularProducts } from "../services/shopify-admin.server";
import { rateLimiter } from "../services/rate-limiter.server";
import { getCustomContextByShop } from "../services/shopify-metafields.server";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// Common filler words to exclude from basic keyword extraction
const FILLER_WORDS = [
  "help", "me", "find", "looking", "for", "want", "need", "show",
  "get", "a", "an", "the", "some", "any", "can", "you", "i", "im",
  "i'm", "id", "i'd", "like", "something", "anything", "what", "where",
];

/**
 * Extract meaningful keywords from user message for basic search mode.
 * Filters out common filler words and returns up to 5 meaningful terms.
 */
function extractBasicKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, "")) // Remove punctuation
    .filter((word) => word.length > 2) // Min 3 characters
    .filter((word) => !FILLER_WORDS.includes(word))
    .slice(0, 5);
}

/**
 * Extract IP address from request headers.
 * Checks multiple headers in order of preference.
 */
function extractIpAddress(request: Request): string {
  // Check x-forwarded-for (can contain multiple IPs, first is the client)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[0];
  }

  // Check other common headers
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  // Fallback to unknown if no IP found
  return "unknown";
}

/**
 * Create a unique identifier combining IP address and User Agent.
 * This provides better rate limiting than IP alone (handles NAT/shared IPs)
 * while preventing simple User Agent spoofing attacks.
 */
function createIpIdentifier(request: Request): string {
  const ip = extractIpAddress(request);
  const userAgent = request.headers.get("user-agent") || "unknown";

  // Create a hash-like identifier to keep the key reasonably sized
  // Format: ip:first50chars_of_ua
  const uaShort = userAgent.substring(0, 50).replace(/[^a-zA-Z0-9]/g, "_");
  return `${ip}:${uaShort}`;
}

/**
 * Build Shopify search query from keywords.
 * Uses default search combined with specific field searches for better results.
 */
function buildSearchQuery(message: string, keywords: string[]) {
  const terms =
    keywords.length > 0
      ? keywords
      : extractBasicKeywords(message);

  if (terms.length === 0) {
    return "status:active";
  }

  // Clean terms for search
  const cleanTerms = terms
    .map((term) => term.replace(/["']/g, ""))
    .filter(Boolean);

  // Build combined search:
  // 1. Default search (searches multiple fields automatically)
  // 2. Specific field searches with wildcards for flexibility
  const defaultSearch = cleanTerms.join(" ");
  const fieldSearches = cleanTerms
    .map((term) => `title:${term}* OR tag:${term}* OR product_type:${term}* OR vendor:${term}*`)
    .join(" OR ");

  return `(${defaultSearch}) OR (${fieldSearches})`;
}

function buildCorsHeaders(request: Request, shopDomain: string) {
  const origin = request.headers.get("Origin");
  const allowOrigin =
    origin && origin.includes(shopDomain) ? origin : origin || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = request.method === "OPTIONS"
    ? null
    : ((await request.json()) as {
    shop_id?: string;
    customer_id?: string;
    session_id?: string;
    message?: string;
  });

  const shop = body?.shop_id?.trim() || "";
  const corsHeaders = buildCorsHeaders(request, shop);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const message = body?.message?.trim();
  const sessionId = body?.session_id?.trim();
  const customerId = body?.customer_id?.trim();

  if (!shop || !message || !sessionId) {
    return new Response("Missing required fields", {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Create IP identifier for rate limiting
  const ipIdentifier = createIpIdentifier(request);

  // Check rate limits (both session and IP-based)
  const rateLimitResult = rateLimiter.checkLimit(shop, sessionId, ipIdentifier);
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.resetAt
      ? Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
      : 60;

    return new Response(
      JSON.stringify({
        error: rateLimitResult.message,
        retry_after_seconds: retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          ...corsHeaders,
        },
      }
    );
  }

  // Record this request (tracks both session and IP)
  rateLimiter.recordRequest(shop, sessionId, ipIdentifier);

  try {
    // Fetch custom context from Shopify Metafields
    const customContext = (await getCustomContextByShop(shop)) || undefined;

    // Try to extract keywords using AI
    const keywords = await extractKeywords(message);
  const aiMode = keywords.length > 0;
  console.log(aiMode ? "🤖 AI Mode - Keywords:" : "🔍 Basic Mode - Keywords:", keywords);

  // Track analytics
  if (aiMode) {
    rateLimiter.trackAiQuery(shop);
  } else {
    rateLimiter.trackBasicQuery(shop);
  }

  // Build search query (will use basic extraction if AI failed)
  const searchQuery = buildSearchQuery(message, keywords);
  const searchTerms = keywords.length > 0 ? keywords : extractBasicKeywords(message);
  console.log("🔍 Search query:", searchQuery);

  // Search for products
  let products = await searchProducts(shop, searchQuery, 5);
  console.log("🔍 Products found:", products.length);

  // If no products found, fallback to popular products
  let fallbackUsed = false;
  if (products.length === 0) {
    console.log("⚠️  No products found, using popular products fallback");
    products = await getPopularProducts(shop, 5);
    fallbackUsed = true;
    rateLimiter.trackFallback(shop);
  }

  // Generate response text based on mode
  let responseText: string;

  // Handle truly empty state (no products even after fallback)
  if (products.length === 0) {
    responseText = "I'm sorry, but I couldn't find any products to recommend right now. This might be because your store doesn't have any active products yet, or there's a temporary issue. Please try again later or contact us for assistance.";
  } else if (aiMode && !fallbackUsed) {
    // AI Mode with direct matches
    const aiResponse = await generateResponseText(
      message,
      products.map((product) => ({
        title: product.title,
        url: `https://${shop}/products/${product.handle}`,
      })),
      customContext,
    );
    responseText = aiResponse || "Here are a few products that might be a great fit:";
  } else if (aiMode && fallbackUsed) {
    // AI Mode but no matches found, showing popular products
    responseText = "I couldn't find exact matches, but here are our popular products:";
  } else if (!aiMode && !fallbackUsed) {
    // Basic Mode with results
    responseText = `Found products matching: ${searchTerms.join(", ")}`;
  } else {
    // Basic Mode with fallback
    responseText = "No exact matches found. Here are our popular products:";
  }

  const trackingToken = crypto.randomUUID();

  await db.shop.upsert({
    where: { shop },
    update: { lastActiveAt: new Date() },
    create: {
      shop,
      shopDomain: shop,
      lastActiveAt: new Date(),
    },
  });

  await db.conversation.create({
    data: {
      shop,
      sessionId,
      customerId: customerId || null,
      message,
      responseText,
      productsShown: products.map((product) => product.id),
      trackingToken,
    },
  });

  const payload = {
    response_text: responseText,
    products: products.map((product, index) => ({
      id: product.id,
      title: product.title,
      price: product.priceRangeV2.minVariantPrice.amount,
      currency: product.priceRangeV2.minVariantPrice.currencyCode,
      image_url: product.featuredImage?.url || null,
      product_url: `https://${shop}/products/${product.handle}`,
      relevance_score: Math.max(1 - index * 0.1, 0.5),
    })),
    tracking_token: trackingToken,
    mode: aiMode ? "ai" : "basic",
    search_info: {
      keywords: searchTerms,
      fallback_used: fallbackUsed,
    },
  };

    const secureFlag = new URL(request.url).protocol === "https:" ? " Secure;" : "";

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `pf_chat_session=${trackingToken}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax;${secureFlag}`,
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Error processing chat query:", error);

    // Determine error message and status based on error type
    let errorMessage = "Failed to process request";
    let statusCode = 500;

    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes("Missing offline session")) {
        errorMessage = "Shop authentication error. Please reinstall the app.";
        statusCode = 401;
      } else if (error.message.includes("Shopify Admin API error")) {
        errorMessage = "Unable to search products. Please try again.";
        statusCode = 502;
      } else if (error.message.includes("ECONNREFUSED") || error.message.includes("ETIMEDOUT")) {
        errorMessage = "Service temporarily unavailable. Please try again.";
        statusCode = 503;
      } else if (error.message.includes("PrismaClient")) {
        errorMessage = "Database error. Please try again.";
        statusCode = 500;
      }

      // Log full error details for debugging
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        shop,
        sessionId,
      });
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: statusCode,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
};
