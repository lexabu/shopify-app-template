import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * POST /api/test-metafields/write
 * Test writing/updating a metafield value
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { admin } = await authenticate.admin(request);
    const body = await request.json();
    const { value } = body;

    if (!value || typeof value !== "string") {
      return new Response(
        JSON.stringify({ error: "value must be a non-empty string" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // First, get the shop GID
    const shopResponse = await admin.graphql(`
      query {
        shop {
          id
        }
      }
    `);

    const shopData = await shopResponse.json();
    const shopGid = shopData?.data?.shop?.id;

    if (!shopGid) {
      return new Response(
        JSON.stringify({ error: "Failed to get shop ID" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Escape quotes in value for GraphQL
    const escapedValue = value.replace(/"/g, '\\"').replace(/\n/g, "\\n");

    // Write/update the metafield
    const response = await admin.graphql(`
      mutation {
        metafieldsSet(metafields: [{
          namespace: "product_finder"
          key: "test_value"
          value: "${escapedValue}"
          type: "multi_line_text_field"
          ownerId: "${shopGid}"
        }]) {
          metafields {
            id
            namespace
            key
            value
            type
            createdAt
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `);

    const data = await response.json();

    // Check for errors
    const userErrors = data?.data?.metafieldsSet?.userErrors;
    if (userErrors && userErrors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Metafield write failed",
          userErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const metafield = data?.data?.metafieldsSet?.metafields?.[0];

    return new Response(
      JSON.stringify({
        success: true,
        metafield,
        message: "Test value written successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error writing test metafield:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        message: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
