import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchProductDetails } from "../services/shopify-products.server";

/**
 * GET /api/optimize/product/:productId
 * Fetch product details for display (without generating AI suggestions)
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    let { productId } = params;

    if (!productId) {
      return new Response(
        JSON.stringify({ error: "Product ID is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Reconstruct full GID if only numeric ID was provided
    if (!productId.startsWith("gid://")) {
      productId = `gid://shopify/Product/${productId}`;
    }

    // Fetch product details from Shopify
    const product = await fetchProductDetails(shop, productId);
    if (!product) {
      return new Response(
        JSON.stringify({ error: "Product not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        product: {
          id: product.id,
          title: product.title,
          handle: product.handle,
          description: product.description,
          descriptionHtml: product.descriptionHtml,
          tags: product.tags,
          productType: product.productType,
          vendor: product.vendor,
          seo: product.seo,
          featuredImage: product.featuredImage,
          images: product.images,
          collections: product.collections,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching product:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch product",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
