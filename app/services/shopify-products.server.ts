import { shopifyAdminGraphql } from "./shopify-admin.server";

type Product = {
  id: string;
  title: string;
  handle: string;
  description: string;
  descriptionHtml: string;
  tags: string[];
  productType: string;
  vendor: string;
  seo: {
    title: string | null;
    description: string | null;
  };
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  images: {
    nodes: Array<{
      url: string;
      altText: string | null;
    }>;
  };
  variants: {
    nodes: Array<{
      price: string;
    }>;
  };
  collections: {
    nodes: Array<{
      id: string;
      title: string;
    }>;
  };
};

type ProductsResponse = {
  products: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: Product[];
  };
};

type ProductDetailsResponse = {
  product: Product | null;
};

type ProductUpdateResponse = {
  productUpdate: {
    product: {
      id: string;
      title: string;
      description: string;
      tags: string[];
      seo: {
        title: string | null;
        description: string | null;
      };
    } | null;
    userErrors: Array<{
      field: string[] | null;
      message: string;
    }>;
  };
};

/**
 * Fetch all active products in batches of 50 (Shopify GraphQL pattern).
 * Returns products with all fields needed for optimization analysis.
 */
export async function fetchAllProducts(
  shop: string,
  cursor?: string | null
): Promise<{
  products: Product[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}> {
  const data = await shopifyAdminGraphql<ProductsResponse>(
    shop,
    `#graphql
      query FetchProductsForAnalysis($cursor: String, $first: Int!) {
        products(first: $first, after: $cursor, query: "status:active") {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            handle
            description
            descriptionHtml
            tags
            productType
            vendor
            seo {
              title
              description
            }
            featuredImage {
              url
              altText
            }
            images(first: 5) {
              nodes {
                url
                altText
              }
            }
            variants(first: 1) {
              nodes {
                price
              }
            }
            collections(first: 5) {
              nodes {
                id
                title
              }
            }
          }
        }
      }
    `,
    { first: 50, cursor }
  );

  return {
    products: data.products.nodes,
    pageInfo: data.products.pageInfo,
  };
}

/**
 * Fetch a single product with all details including up to 10 images.
 * Used for detailed product review and AI suggestion generation.
 */
export async function fetchProductDetails(
  shop: string,
  productId: string
): Promise<Product | null> {
  const data = await shopifyAdminGraphql<ProductDetailsResponse>(
    shop,
    `#graphql
      query FetchProductDetails($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          description
          descriptionHtml
          tags
          productType
          vendor
          seo {
            title
            description
          }
          featuredImage {
            url
            altText
          }
          images(first: 10) {
            nodes {
              url
              altText
            }
          }
          variants(first: 1) {
            nodes {
              price
            }
          }
          collections(first: 10) {
            nodes {
              id
              title
            }
          }
        }
      }
    `,
    { id: productId }
  );

  return data.product;
}

/**
 * Update product fields in Shopify.
 * Supports partial updates (only changed fields).
 * Returns updated product and any user errors from Shopify.
 */
export async function updateProductFields(
  shop: string,
  productId: string,
  updates: {
    title?: string;
    descriptionHtml?: string;
    tags?: string[];
    seo?: {
      title?: string;
      description?: string;
    };
  }
): Promise<{
  product: {
    id: string;
    title: string;
    description: string;
    tags: string[];
    seo: {
      title: string | null;
      description: string | null;
    };
  } | null;
  userErrors: Array<{
    field: string[] | null;
    message: string;
  }>;
}> {
  const input: {
    id: string;
    title?: string;
    descriptionHtml?: string;
    tags?: string[];
    seo?: { title?: string; description?: string };
  } = { id: productId };

  // Only include fields that are being updated
  if (updates.title !== undefined) {
    input.title = updates.title;
  }
  if (updates.descriptionHtml !== undefined) {
    input.descriptionHtml = updates.descriptionHtml;
  }
  if (updates.tags !== undefined) {
    input.tags = updates.tags;
  }
  if (updates.seo !== undefined) {
    input.seo = {};
    if (updates.seo.title !== undefined) {
      input.seo.title = updates.seo.title;
    }
    if (updates.seo.description !== undefined) {
      input.seo.description = updates.seo.description;
    }
  }

  const data = await shopifyAdminGraphql<ProductUpdateResponse>(
    shop,
    `#graphql
      mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            description
            tags
            seo {
              title
              description
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { input }
  );

  return {
    product: data.productUpdate.product,
    userErrors: data.productUpdate.userErrors,
  };
}

/**
 * Analyze shop's product catalog to extract summary data for AI suggestions.
 * Fetches first 100 products and analyzes their attributes.
 */
export async function analyzeShopCatalog(shop: string): Promise<{
  productTypes: string[];
  topTags: string[];
  vendors: string[];
  priceRange: { min: number; max: number };
  categories: string[];
}> {
  // Fetch first page of products
  const { products } = await fetchAllProducts(shop);

  if (products.length === 0) {
    return {
      productTypes: [],
      topTags: [],
      vendors: [],
      priceRange: { min: 0, max: 0 },
      categories: [],
    };
  }

  // Extract unique product types
  const productTypes = [...new Set(
    products
      .map((p) => p.productType)
      .filter(Boolean)
  )];

  // Extract and count tags
  const tagCounts = new Map<string, number>();
  products.forEach((product) => {
    product.tags.forEach((tag) => {
      if (tag && tag.length > 0) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    });
  });

  // Sort tags by frequency and take top 20
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag]) => tag);

  // Extract unique vendors
  const vendors = [...new Set(
    products
      .map((p) => p.vendor)
      .filter(Boolean)
  )];

  // Extract unique collection titles (categories)
  const categories = [...new Set(
    products
      .flatMap((p) => p.collections.nodes.map((c) => c.title))
      .filter(Boolean)
  )];

  // Calculate price range
  const prices = products
    .map((p) => parseFloat(p.variants.nodes[0]?.price || "0"))
    .filter((price) => price > 0);

  const priceRange = {
    min: prices.length > 0 ? Math.min(...prices) : 0,
    max: prices.length > 0 ? Math.max(...prices) : 0,
  };

  return {
    productTypes,
    topTags,
    vendors,
    priceRange,
    categories,
  };
}
