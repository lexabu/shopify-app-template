import db from "../db.server";

const ADMIN_API_VERSION = "2026-04";

/**
 * Retry a function with exponential backoff.
 * Used for transient API failures.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Only retry on transient errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryable =
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("429") ||
        errorMessage.includes("500") ||
        errorMessage.includes("502") ||
        errorMessage.includes("503") ||
        errorMessage.includes("504");

      if (!isRetryable) {
        break;
      }

      // Calculate exponential backoff delay
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(
        `Shopify API retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function normalizeShopDomain(shop: string) {
  const cleaned = shop.replace(/^https?:\/\//, "").trim();
  return cleaned.replace(/\/$/, "");
}

async function getOfflineAccessToken(shop: string) {
  const shopDomain = normalizeShopDomain(shop);
  const session = await db.session.findFirst({
    where: { shop: shopDomain, isOnline: false },
    orderBy: { expires: "desc" },
  });

  if (!session) {
    throw new Response("Missing offline session", { status: 401 });
  }

  return { shopDomain, accessToken: session.accessToken };
}

export async function shopifyAdminGraphql<T>(
  shop: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const { shopDomain, accessToken } = await getOfflineAccessToken(shop);

  const makeRequest = async () => {
    const response = await fetch(
      `https://${shopDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );

    if (!response.ok) {
      throw new Error(`Shopify Admin API error: ${response.status}`);
    }

    const json = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(json.errors.map((err) => err.message).join(", "));
    }

    if (!json.data) {
      throw new Error("Shopify Admin API returned no data");
    }

    return json.data;
  };

  // Retry on transient failures (network errors, rate limits, server errors)
  return await retryWithBackoff(makeRequest, 3, 1000);
}

export async function searchProducts(shop: string, query: string, first = 6) {
  const data = await shopifyAdminGraphql<{
    products: {
      nodes: Array<{
        id: string;
        title: string;
        handle: string;
        tags: string[];
        productType: string;
        featuredImage: { url: string; altText: string | null } | null;
        priceRangeV2: {
          minVariantPrice: { amount: string; currencyCode: string };
        };
      }>;
    };
  }>(
    shop,
    `#graphql
      query ProductSearch($first: Int!, $query: String!) {
        products(first: $first, query: $query) {
          nodes {
            id
            title
            handle
            tags
            productType
            featuredImage {
              url
              altText
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }
    `,
    { first, query },
  );

  return data.products.nodes;
}

/**
 * Get popular/best-selling products as fallback when search returns no results.
 * Returns active products sorted by best-selling (or updated date as proxy).
 */
export async function getPopularProducts(shop: string, first = 5) {
  const data = await shopifyAdminGraphql<{
    products: {
      nodes: Array<{
        id: string;
        title: string;
        handle: string;
        tags: string[];
        productType: string;
        featuredImage: { url: string; altText: string | null } | null;
        priceRangeV2: {
          minVariantPrice: { amount: string; currencyCode: string };
        };
      }>;
    };
  }>(
    shop,
    `#graphql
      query PopularProducts($first: Int!) {
        products(first: $first, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            title
            handle
            tags
            productType
            featuredImage {
              url
              altText
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }
    `,
    { first },
  );

  return data.products.nodes;
}
