import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * DELETE /api/test-metafields/delete
 * Test deleting a metafield
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "DELETE") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { admin } = await authenticate.admin(request);

    // First, get the metafield ID
    const readResponse = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "product_finder", key: "test_value") {
            id
          }
        }
      }
    `);

    const readData = await readResponse.json();
    const metafieldId = readData?.data?.shop?.metafield?.id;

    if (!metafieldId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Test metafield not found (nothing to delete)",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Delete the metafield
    // Note: Use metafieldsDelete (plural) for the mutation
    const deleteResponse = await admin.graphql(`
      mutation metafieldDelete($input: MetafieldDeleteInput!) {
        metafieldDelete(input: $input) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          id: metafieldId
        }
      }
    });

    const deleteData = await deleteResponse.json();

    // Check for errors
    const userErrors = deleteData?.data?.metafieldDelete?.userErrors;
    if (userErrors && userErrors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Metafield delete failed",
          userErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const deletedId = deleteData?.data?.metafieldDelete?.deletedId;

    return new Response(
      JSON.stringify({
        success: true,
        deletedId,
        message: "Test metafield deleted successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error deleting test metafield:", error);
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
