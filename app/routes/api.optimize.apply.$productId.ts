import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { updateProductFields } from "../services/shopify-products.server";
import db from "../db.server";
import { trackEvent, EventCategory, AnalyticsEvents } from "../services/analytics.server";

/**
 * POST /api/optimize/apply/:productId
 * Apply approved AI suggestions to a product in Shopify
 * Tracks changes in database for history/analytics
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

    // Parse request body
    const body = await request.json();
    const {
      title,
      description,
      tags,
      seo,
    }: {
      title?: string;
      description?: string;
      tags?: { add: string[]; remove: string[]; current: string[] };
      seo?: { metaTitle?: string; metaDescription?: string };
    } = body;

    // Build updates object for Shopify
    const updates: {
      title?: string;
      descriptionHtml?: string;
      tags?: string[];
      seo?: {
        title?: string;
        description?: string;
      };
    } = {};

    const appliedChanges: Record<string, any> = {};

    // Apply title change
    if (title) {
      updates.title = title;
      appliedChanges.title = title;
    }

    // Apply description change
    if (description) {
      updates.descriptionHtml = description;
      appliedChanges.description = description;
    }

    // Apply tags changes
    if (tags) {
      const currentTags = tags.current || [];
      const tagsToAdd = tags.add || [];
      const tagsToRemove = tags.remove || [];

      // Remove tags to remove, add tags to add
      const finalTags = [
        ...currentTags.filter((tag) => !tagsToRemove.includes(tag)),
        ...tagsToAdd,
      ];

      // Remove duplicates
      const uniqueTags = Array.from(new Set(finalTags));

      updates.tags = uniqueTags;
      appliedChanges.tags = {
        added: tagsToAdd,
        removed: tagsToRemove,
        final: uniqueTags,
      };
    }

    // Apply SEO changes
    if (seo) {
      updates.seo = {};
      if (seo.metaTitle) {
        updates.seo.title = seo.metaTitle;
        appliedChanges.seoTitle = seo.metaTitle;
      }
      if (seo.metaDescription) {
        updates.seo.description = seo.metaDescription;
        appliedChanges.seoDescription = seo.metaDescription;
      }
    }

    // Check if any changes to apply
    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ error: "No changes to apply" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log("Applying changes to product:", productId, updates);

    // Update product in Shopify
    const result = await updateProductFields(shop, productId, updates);

    // Check for user errors from Shopify
    if (result.userErrors && result.userErrors.length > 0) {
      console.error("Shopify user errors:", result.userErrors);
      return new Response(
        JSON.stringify({
          error: "Shopify returned errors",
          details: result.userErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!result.product) {
      return new Response(
        JSON.stringify({ error: "Failed to update product" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update ProductOptimization record
    await db.productOptimization.upsert({
      where: {
        shop_productId: {
          shop,
          productId,
        },
      },
      update: {
        status: "applied",
        appliedAt: new Date(),
        appliedChanges,
      },
      create: {
        shop,
        productId,
        suggestions: {},
        originalData: {},
        status: "applied",
        appliedAt: new Date(),
        appliedChanges,
      },
    });

    console.log("✅ Successfully applied changes to product");

    // Track the event
    await trackEvent({
      shop,
      event: AnalyticsEvents.OPTIMIZER_CHANGES_APPLIED,
      category: EventCategory.OPTIMIZER,
      action: "apply_changes",
      label: result.product.title,
      metadata: {
        productId,
        changesApplied: Object.keys(appliedChanges),
        titleChanged: !!appliedChanges.title,
        descriptionChanged: !!appliedChanges.description,
        tagsChanged: !!appliedChanges.tags,
        seoChanged: !!appliedChanges.seoTitle || !!appliedChanges.seoDescription,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        product: result.product,
        appliedChanges,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error applying changes:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to apply changes",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
