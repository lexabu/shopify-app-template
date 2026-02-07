import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchProductDetails } from "../services/shopify-products.server";
import {
  analyzeProductImage,
  generateTitleSuggestions,
  generateDescriptionSuggestion,
  generateTagsSuggestions,
  generateSEOMetadata,
} from "../services/openai.server";
import { getCustomContextByShop } from "../services/shopify-metafields.server";
import db from "../db.server";
import { trackEvent, EventCategory, AnalyticsEvents } from "../services/analytics.server";

/**
 * POST /api/optimize/suggestions/:productId
 * Generate AI-powered suggestions for a product
 * Uses Vision API to analyze images and generate comprehensive suggestions
 */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

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

    // Get custom context from shop settings
    const customContext = await getCustomContextByShop(shop);

    // Get common tags from store (top 50 most used tags)
    const tagCounts = await db.productAnalysis.findMany({
      where: { shop },
      select: { productId: true },
    });

    // Extract common tags from existing products
    // Note: This is a simplified version - in production you'd want to query actual product tags
    const commonTags: string[] = [
      "winter",
      "snowboard",
      "premium",
      "collection",
    ];

    // Analyze product image if available
    let imageAnalysis = null;
    if (product.featuredImage?.url) {
      console.log("Analyzing product image with Vision API...");
      imageAnalysis = await analyzeProductImage(product.featuredImage.url);
    }

    // Generate all suggestions in parallel for efficiency
    console.log("Generating AI suggestions for product:", product.title);

    const [titleSuggestions, descriptionSuggestion, tagsSuggestions, seoMetadata] =
      await Promise.all([
        generateTitleSuggestions(
          {
            title: product.title,
            description: product.description,
            tags: product.tags,
            productType: product.productType,
            vendor: product.vendor,
          },
          customContext || undefined,
          imageAnalysis,
          [] // patterns - could be extracted from top products
        ),
        generateDescriptionSuggestion(
          {
            title: product.title,
            description: product.description,
            tags: product.tags,
            productType: product.productType,
            vendor: product.vendor,
          },
          customContext || undefined,
          imageAnalysis
        ),
        generateTagsSuggestions(
          {
            title: product.title,
            description: product.description,
            tags: product.tags,
            productType: product.productType,
          },
          customContext || undefined,
          imageAnalysis,
          commonTags
        ),
        generateSEOMetadata(
          {
            title: product.title,
            description: product.description,
            tags: product.tags,
            productType: product.productType,
          },
          customContext || undefined
        ),
      ]);

    // Build suggestions object
    const suggestions = {
      title: titleSuggestions?.suggestions || [],
      description: descriptionSuggestion
        ? {
            content: descriptionSuggestion.description,
            improvements: descriptionSuggestion.key_improvements,
          }
        : null,
      tags: tagsSuggestions
        ? {
            add: tagsSuggestions.suggested_tags,
            remove: tagsSuggestions.tags_to_remove,
            reasoning: tagsSuggestions.reasoning,
          }
        : null,
      seo: seoMetadata
        ? {
            metaTitle: seoMetadata.meta_title,
            metaDescription: seoMetadata.meta_description,
            reasoning: seoMetadata.reasoning,
          }
        : null,
      imageAnalysis: imageAnalysis
        ? {
            attributes: imageAnalysis.attributes,
            keywords: imageAnalysis.keywords,
          }
        : null,
    };

    // Store original product data
    const originalData = {
      title: product.title,
      description: product.description,
      tags: product.tags,
      seo: product.seo,
    };

    // Store suggestions in database (upsert)
    await db.productOptimization.upsert({
      where: {
        shop_productId: {
          shop,
          productId: product.id,
        },
      },
      update: {
        suggestions,
        originalData,
        status: "pending",
      },
      create: {
        shop,
        productId: product.id,
        suggestions,
        originalData,
        status: "pending",
      },
    });

    console.log("✅ AI suggestions generated successfully");

    // Track the event
    await trackEvent({
      shop,
      event: AnalyticsEvents.OPTIMIZER_SUGGESTIONS_GENERATED,
      category: EventCategory.OPTIMIZER,
      action: "generate_suggestions",
      label: product.title,
      metadata: {
        productId: product.id,
        hasTitleSuggestions: (titleSuggestions?.suggestions?.length ?? 0) > 0,
        hasDescriptionSuggestion: !!descriptionSuggestion,
        hasTagsSuggestions: !!tagsSuggestions,
        hasSeoMetadata: !!seoMetadata,
        hasImageAnalysis: !!imageAnalysis,
      },
    });

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
        suggestions,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating suggestions:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to generate suggestions",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
