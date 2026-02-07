/**
 * Shopify Metafields Service
 *
 * Handles reading and writing app settings to Shopify Metafields.
 * Uses namespace "product_finder" for all metafields.
 */

import db from "../db.server";

const NAMESPACE = "product_finder";
const CUSTOM_CONTEXT_KEY = "custom_context";
const ADMIN_API_VERSION = "2026-04";

/**
 * Get the Shop GID (Global ID) required for metafield mutations
 */
async function getShopGid(admin: any): Promise<string> {
  const response = await admin.graphql(`
    query {
      shop {
        id
      }
    }
  `);

  const data = await response.json();
  const shopGid = data?.data?.shop?.id;

  if (!shopGid) {
    throw new Error("Failed to retrieve shop GID");
  }

  return shopGid;
}

/**
 * Get custom context from Shopify Metafields
 *
 * @param admin - Authenticated Shopify admin object from authenticate.admin()
 * @returns The custom context string, or null if not set
 */
export async function getCustomContext(admin: any): Promise<string | null> {
  try {
    const response = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "${NAMESPACE}", key: "${CUSTOM_CONTEXT_KEY}") {
            value
          }
        }
      }
    `);

    const data = await response.json();
    const value = data?.data?.shop?.metafield?.value;

    return value || null;
  } catch (error) {
    console.error("Error reading custom context from metafield:", error);
    throw error;
  }
}

/**
 * Set custom context in Shopify Metafields
 *
 * @param admin - Authenticated Shopify admin object from authenticate.admin()
 * @param value - The custom context string to save (or empty string to clear)
 * @returns true if successful, throws error if failed
 */
export async function setCustomContext(
  admin: any,
  value: string
): Promise<boolean> {
  try {
    const shopGid = await getShopGid(admin);

    // Escape special characters for GraphQL
    const escapedValue = value.replace(/"/g, '\\"').replace(/\n/g, "\\n");

    const response = await admin.graphql(`
      mutation {
        metafieldsSet(metafields: [{
          namespace: "${NAMESPACE}"
          key: "${CUSTOM_CONTEXT_KEY}"
          value: "${escapedValue}"
          type: "multi_line_text_field"
          ownerId: "${shopGid}"
        }]) {
          metafields {
            id
            value
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
      console.error("Metafield write errors:", userErrors);
      throw new Error(
        `Failed to save custom context: ${userErrors[0].message}`
      );
    }

    return true;
  } catch (error) {
    console.error("Error writing custom context to metafield:", error);
    throw error;
  }
}

/**
 * Get custom context by shop domain (for public endpoints like chat)
 * Fetches access token from database and makes direct GraphQL call
 *
 * @param shop - Shop domain (e.g., "myshop.myshopify.com")
 * @returns The custom context string, or null if not set
 */
export async function getCustomContextByShop(
  shop: string
): Promise<string | null> {
  try {
    // Get access token from database
    const session = await db.session.findFirst({
      where: { shop },
      orderBy: { expires: "desc" },
      select: { accessToken: true },
    });

    if (!session?.accessToken) {
      console.warn(`No access token found for shop: ${shop}`);
      return null;
    }

    // Make direct GraphQL call to Shopify
    const response = await fetch(
      `https://${shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({
          query: `
            query {
              shop {
                metafield(namespace: "${NAMESPACE}", key: "${CUSTOM_CONTEXT_KEY}") {
                  value
                }
              }
            }
          `,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        `Shopify GraphQL API error: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();
    const value = data?.data?.shop?.metafield?.value;

    return value || null;
  } catch (error) {
    console.error("Error reading custom context by shop:", error);
    return null;
  }
}

/**
 * Delete custom context from Shopify Metafields
 * (Optional - mainly for cleanup/testing)
 *
 * @param admin - Authenticated Shopify admin object from authenticate.admin()
 * @returns true if successful or not found, throws error if failed
 */
export async function deleteCustomContext(admin: any): Promise<boolean> {
  try {
    // First, get the metafield ID
    const readResponse = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "${NAMESPACE}", key: "${CUSTOM_CONTEXT_KEY}") {
            id
          }
        }
      }
    `);

    const readData = await readResponse.json();
    const metafieldId = readData?.data?.shop?.metafield?.id;

    if (!metafieldId) {
      // Nothing to delete
      return true;
    }

    // Delete the metafield
    const deleteResponse = await admin.graphql(
      `
      mutation metafieldDelete($input: MetafieldDeleteInput!) {
        metafieldDelete(input: $input) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `,
      {
        variables: {
          input: {
            id: metafieldId,
          },
        },
      }
    );

    const deleteData = await deleteResponse.json();

    // Check for errors
    const userErrors = deleteData?.data?.metafieldDelete?.userErrors;
    if (userErrors && userErrors.length > 0) {
      console.error("Metafield delete errors:", userErrors);
      throw new Error(
        `Failed to delete custom context: ${userErrors[0].message}`
      );
    }

    return true;
  } catch (error) {
    console.error("Error deleting custom context metafield:", error);
    throw error;
  }
}
