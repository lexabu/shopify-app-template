import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * GET /api/test-metafields/read
 * Test reading a metafield value
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);

    // Read the test metafield
    const response = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "product_finder", key: "test_value") {
            id
            namespace
            key
            value
            type
            createdAt
            updatedAt
          }
        }
      }
    `);

    const data = await response.json();
    const metafield = data?.data?.shop?.metafield;

    if (!metafield) {
      return new Response(
        JSON.stringify({
          success: false,
          value: null,
          message: "Test metafield not found (may not have been created yet)",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        value: metafield.value,
        metafield,
        message: "Test value read successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error reading test metafield:", error);
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
