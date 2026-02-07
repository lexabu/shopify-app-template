type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
// Test mode defaults to false (production) if not set
// Only enabled when OPENAI_TEST_MODE="true" is explicitly set in .env
const TEST_MODE = process.env.OPENAI_TEST_MODE === "true";

// Log current mode on startup
if (TEST_MODE) {
  console.log("⚠️  OpenAI TEST MODE enabled - API calls will be mocked (no costs)");
} else {
  console.log("✅ OpenAI PRODUCTION MODE - Real API calls will be made");
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

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

      // Calculate exponential backoff delay
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

async function callOpenAI(messages: OpenAIChatMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ OpenAI API key is missing");
    return null;
  }

  const makeRequest = async () => {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        messages,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenAI API error (${response.status}):`, errorText);

      // Try to parse error details
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          console.error("❌ OpenAI error message:", errorJson.error.message);
        }
      } catch {
        // Error text isn't JSON, already logged above
      }

      // Throw error for retryable status codes (429, 500, 502, 503, 504)
      if (
        response.status === 429 ||
        response.status >= 500
      ) {
        throw new Error(`OpenAI API error ${response.status}: Retryable`);
      }

      // Non-retryable error (e.g., 400, 401, 403)
      return null;
    }

    return response.json() as Promise<{
      choices?: Array<{ message?: { content?: string } }>;
    }>;
  };

  try {
    // Retry on transient failures
    return await retryWithBackoff(makeRequest, 3, 1000);
  } catch (error) {
    console.error("❌ OpenAI request failed after retries:", error);
    return null;
  }
}

export async function extractKeywords(message: string): Promise<string[]> {
  // Test mode: return mock keywords without calling OpenAI
  if (TEST_MODE) {
    const words = message.split(/\s+/).filter(Boolean).slice(0, 3);
    return words.length > 0 ? words : ["test", "product"];
  }

  const result = await callOpenAI([
    {
      role: "system",
      content:
        "Extract 3-5 short search keywords or attributes from the user message. Return JSON only: {\"keywords\":[\"...\"]}.",
    },
    { role: "user", content: message },
  ]);

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error("❌ OpenAI returned no content for keyword extraction");
    return [];
  }

  const json = safeJsonParse<{ keywords?: string[] }>(content);
  if (!json?.keywords?.length) {
    console.error("❌ Failed to parse keywords from OpenAI response:", content);
    return [];
  }

  console.log("✅ OpenAI extracted keywords:", json.keywords);
  return json.keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0)
    .slice(0, 5);
}

export async function generateResponseText(
  message: string,
  products: Array<{ title: string; url: string }>,
  customContext?: string,
): Promise<string | null> {
  // Test mode: return mock response without calling OpenAI
  if (TEST_MODE) {
    if (products.length === 0) {
      return "I found some products that might interest you!";
    }
    const productLinks = products
      .slice(0, 3)
      .map((p) => `[${p.title}](${p.url})`)
      .join(", ");
    return `Based on your search, I recommend checking out ${productLinks}. These products match what you're looking for!`;
  }

  // Build system prompt with optional custom context
  let systemPrompt =
    "You are a helpful shopping assistant. Write a friendly, concise response that recommends products with clickable links. Use markdown link format: [product name](url). Keep it conversational and brief (2-3 sentences max). Return JSON only: {\"response_text\":\"...\"}.";

  if (customContext && customContext.trim()) {
    systemPrompt = `${customContext.trim()}\n\n${systemPrompt}`;
  }

  const result = await callOpenAI([
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: `Message: ${message}\nProducts: ${products.map((p) => `${p.title} - ${p.url}`).join("\n")}`,
    },
  ]);

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return null;
  }

  const json = safeJsonParse<{ response_text?: string }>(content);
  if (!json?.response_text) {
    return null;
  }

  return json.response_text.trim();
}

/**
 * Analyze product image using Vision API
 * Returns visual attributes and keywords for product optimization
 */
export async function analyzeProductImage(
  imageUrl: string
): Promise<{
  attributes: string[];
  keywords: string[];
} | null> {
  // Test mode: return mock image analysis
  if (TEST_MODE) {
    return {
      attributes: ["color", "material", "style"],
      keywords: ["product", "quality", "design"],
    };
  }

  const result = await callOpenAI([
    {
      role: "system",
      content:
        'You are a product data specialist. Analyze this product image and extract key visual attributes (color, material, style, pattern, etc.) and search keywords that would help customers find this product. Return JSON only: {"attributes": ["color", "material", ...], "keywords": ["keyword1", "keyword2", ...]}',
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Analyze this product image in detail" },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ] as any); // Type assertion for vision API

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error("❌ OpenAI returned no content for image analysis");
    return null;
  }

  const json = safeJsonParse<{
    attributes?: string[];
    keywords?: string[];
  }>(content);

  if (!json?.attributes || !json?.keywords) {
    console.error("❌ Failed to parse image analysis from OpenAI:", content);
    return null;
  }

  console.log("✅ OpenAI analyzed image:", json);
  return {
    attributes: json.attributes,
    keywords: json.keywords,
  };
}

/**
 * Generate title suggestions for a product
 * Returns 3 title options with reasoning
 */
export async function generateTitleSuggestions(
  product: {
    title: string;
    description?: string;
    tags: string[];
    productType?: string;
    vendor?: string;
  },
  customContext?: string,
  imageAnalysis?: { attributes: string[]; keywords: string[] } | null,
  patterns?: string[]
): Promise<{
  suggestions: Array<{ title: string; reasoning: string }>;
} | null> {
  // Test mode: return mock title suggestions
  if (TEST_MODE) {
    return {
      suggestions: [
        {
          title: `${product.title} - Enhanced`,
          reasoning: "Added descriptive detail",
        },
        {
          title: `Premium ${product.title}`,
          reasoning: "Added quality indicator",
        },
        {
          title: `${product.title} | High Quality`,
          reasoning: "Added SEO-friendly separator",
        },
      ],
    };
  }

  let systemPrompt = `You are an e-commerce product title optimizer.

Best Practices:
- Include key product type, brand, color, size, material
- Keep under 70 characters for SEO
- Use natural language, avoid keyword stuffing
- Make it descriptive but concise
- Include the most important attributes first`;

  if (customContext && customContext.trim()) {
    systemPrompt = `${customContext.trim()}\n\n${systemPrompt}`;
  }

  if (patterns && patterns.length > 0) {
    systemPrompt += `\n\nProduct Naming Patterns (from top products):\n${patterns.slice(0, 10).join(", ")}`;
  }

  systemPrompt += `\n\nReturn JSON only: {
  "suggestions": [
    {"title": "...", "reasoning": "why this is better"},
    {"title": "...", "reasoning": "..."},
    {"title": "...", "reasoning": "..."}
  ]
}`;

  let userPrompt = `Current product:
Title: ${product.title}
Type: ${product.productType || "N/A"}
Vendor: ${product.vendor || "N/A"}
Tags: ${product.tags.join(", ") || "None"}`;

  if (product.description && product.description.length > 0) {
    userPrompt += `\nDescription (first 200 chars): ${product.description.substring(0, 200)}`;
  }

  if (imageAnalysis) {
    userPrompt += `\nImage Analysis: ${imageAnalysis.attributes.join(", ")}`;
  }

  userPrompt += `\n\nGenerate 3 improved title suggestions that are more descriptive and SEO-friendly.`;

  const result = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return null;
  }

  const json = safeJsonParse<{
    suggestions?: Array<{ title: string; reasoning: string }>;
  }>(content);

  if (!json?.suggestions || json.suggestions.length === 0) {
    return null;
  }

  return {
    suggestions: json.suggestions,
  };
}

/**
 * Generate improved product description
 * Returns HTML-formatted description
 */
export async function generateDescriptionSuggestion(
  product: {
    title: string;
    description?: string;
    tags: string[];
    productType?: string;
    vendor?: string;
  },
  customContext?: string,
  imageAnalysis?: { attributes: string[]; keywords: string[] } | null
): Promise<{
  description: string;
  key_improvements: string[];
} | null> {
  // Test mode: return mock description
  if (TEST_MODE) {
    return {
      description: `<p>Discover our premium ${product.title}. Carefully crafted with attention to detail.</p><ul><li>High-quality materials</li><li>Expert craftsmanship</li><li>Perfect for everyday use</li></ul>`,
      key_improvements: [
        "Added product benefits",
        "Included bullet points",
        "SEO-optimized content",
      ],
    };
  }

  let systemPrompt = `You are an e-commerce product description writer.

Guidelines:
- Write engaging, benefit-focused descriptions
- Include key features and specifications
- Optimize for SEO without keyword stuffing
- Use proper HTML formatting (<p>, <ul>, <li>)
- Keep between 150-300 words
- Start with a compelling opening sentence
- Use bullet points for features
- End with a call-to-action if appropriate`;

  if (customContext && customContext.trim()) {
    systemPrompt = `${customContext.trim()}\n\n${systemPrompt}`;
  }

  systemPrompt += `\n\nReturn JSON only: { "description": "<p>HTML formatted description</p>", "key_improvements": ["improvement1", "improvement2", ...] }`;

  let userPrompt = `Product:
Title: ${product.title}
Type: ${product.productType || "N/A"}
Tags: ${product.tags.join(", ") || "None"}`;

  if (product.description && product.description.length > 0) {
    userPrompt += `\nCurrent Description: ${product.description}`;
  } else {
    userPrompt += `\nCurrent Description: None (create from scratch)`;
  }

  if (imageAnalysis) {
    userPrompt += `\nVisual Attributes: ${imageAnalysis.attributes.join(", ")}`;
  }

  userPrompt += `\n\nGenerate an improved, SEO-friendly product description in HTML format.`;

  const result = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return null;
  }

  const json = safeJsonParse<{
    description?: string;
    key_improvements?: string[];
  }>(content);

  if (!json?.description) {
    return null;
  }

  return {
    description: json.description,
    key_improvements: json.key_improvements || [],
  };
}

/**
 * Generate tag suggestions for a product
 * Returns tags to add, remove, and keep
 */
export async function generateTagsSuggestions(
  product: {
    title: string;
    description?: string;
    tags: string[];
    productType?: string;
  },
  customContext?: string,
  imageAnalysis?: { attributes: string[]; keywords: string[] } | null,
  commonTags?: string[]
): Promise<{
  suggested_tags: string[];
  tags_to_remove: string[];
  reasoning: string;
} | null> {
  // Test mode: return mock tags
  if (TEST_MODE) {
    return {
      suggested_tags: ["quality", "premium", "bestseller"],
      tags_to_remove: [],
      reasoning: "Added descriptive tags based on product attributes",
    };
  }

  let systemPrompt = `You are a product tagging specialist.

Best Practices:
- Include category, attributes, use cases
- Use lowercase, hyphenated format (e.g., "high-quality", "gift-idea")
- Mix specific and broad tags
- Include 8-15 tags per product
- Avoid overly generic tags (like "product", "item", "sale")`;

  if (customContext && customContext.trim()) {
    systemPrompt = `${customContext.trim()}\n\n${systemPrompt}`;
  }

  if (commonTags && commonTags.length > 0) {
    systemPrompt += `\n\nCommon Tags in Store (use these when relevant):\n${commonTags.slice(0, 50).join(", ")}`;
  }

  systemPrompt += `\n\nReturn JSON only: { "suggested_tags": ["tag1", "tag2", ...], "tags_to_remove": ["bad-tag", ...], "reasoning": "explanation" }`;

  let userPrompt = `Product:
Title: ${product.title}
Type: ${product.productType || "N/A"}
Current Tags: ${product.tags.join(", ") || "None"}`;

  if (product.description && product.description.length > 0) {
    userPrompt += `\nDescription (first 200 chars): ${product.description.substring(0, 200)}`;
  }

  if (imageAnalysis) {
    userPrompt += `\nVisual Keywords: ${imageAnalysis.keywords.join(", ")}`;
  }

  userPrompt += `\n\nGenerate improved tag suggestions. Include tags to ADD and tags to REMOVE (if any are too generic or incorrect).`;

  const result = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return null;
  }

  const json = safeJsonParse<{
    suggested_tags?: string[];
    tags_to_remove?: string[];
    reasoning?: string;
  }>(content);

  if (!json?.suggested_tags) {
    return null;
  }

  return {
    suggested_tags: json.suggested_tags,
    tags_to_remove: json.tags_to_remove || [],
    reasoning: json.reasoning || "Improved tags for better discoverability",
  };
}

/**
 * Generate SEO metadata (meta title and description)
 */
export async function generateSEOMetadata(
  product: {
    title: string;
    description?: string;
    tags: string[];
    productType?: string;
  },
  customContext?: string
): Promise<{
  meta_title: string;
  meta_description: string;
  reasoning: string;
} | null> {
  // Test mode: return mock SEO metadata
  if (TEST_MODE) {
    return {
      meta_title: `${product.title} | Premium Quality`,
      meta_description: `Shop our ${product.title}. High-quality, expertly crafted, and perfect for your needs. Order now for fast shipping.`,
      reasoning: "Optimized for search engines with key product attributes",
    };
  }

  let systemPrompt = `You are an SEO specialist for e-commerce.

Best Practices:
- Meta Title: 50-60 characters, include primary keyword and brand/benefit
- Meta Description: 150-160 characters, compelling CTA, include keywords naturally
- Make it click-worthy but honest
- Include unique selling points`;

  if (customContext && customContext.trim()) {
    systemPrompt = `${customContext.trim()}\n\n${systemPrompt}`;
  }

  systemPrompt += `\n\nReturn JSON only: { "meta_title": "...", "meta_description": "...", "reasoning": "SEO strategy explanation" }`;

  let userPrompt = `Product:
Title: ${product.title}
Type: ${product.productType || "N/A"}
Tags: ${product.tags.join(", ") || "None"}`;

  if (product.description && product.description.length > 0) {
    userPrompt += `\nDescription (first 200 chars): ${product.description.substring(0, 200)}`;
  }

  userPrompt += `\n\nGenerate SEO-optimized meta title and meta description.`;

  const result = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return null;
  }

  const json = safeJsonParse<{
    meta_title?: string;
    meta_description?: string;
    reasoning?: string;
  }>(content);

  if (!json?.meta_title || !json?.meta_description) {
    return null;
  }

  return {
    meta_title: json.meta_title,
    meta_description: json.meta_description,
    reasoning: json.reasoning || "SEO-optimized metadata",
  };
}

/**
 * Generate contextual suggested queries based on shop's product catalog.
 * Returns 3 natural language queries that customers might ask.
 */
export async function generateSuggestedQueries(
  shopData: {
    productTypes: string[];
    topTags: string[];
    vendors: string[];
    priceRange: { min: number; max: number };
    categories: string[];
  }
): Promise<string[] | null> {
  // Test mode: return mock suggestions
  if (TEST_MODE) {
    return [
      "Show me running shoes",
      "I need a gift for mom",
      "What's on sale?",
    ];
  }

  const systemPrompt = `You are a shopping assistant helping customers find products in an online store.

Your task is to generate exactly 3 natural, conversational queries that customers might ask when shopping. These should:
- Be diverse (cover different product types, use cases, and intents)
- Sound natural and human-like (how real customers talk)
- Be specific enough to be helpful but broad enough to match products
- Cover different shopping scenarios: browsing, gift-giving, specific needs, occasions
- Be concise (under 8 words each)
- Reflect the actual products available in the store

Examples of good queries:
- "Show me running shoes under $100"
- "I need a gift for my girlfriend"
- "What's your most popular product?"
- "Looking for winter jackets"
- "Do you have vegan skincare?"
- "What's on sale right now?"

Return JSON only: { "queries": ["query1", "query2", "query3"] }`;

  let userPrompt = `Store Catalog Summary:

Product Types: ${shopData.productTypes.slice(0, 15).join(", ") || "Various products"}
Popular Tags: ${shopData.topTags.slice(0, 20).join(", ") || "N/A"}
Brands/Vendors: ${shopData.vendors.slice(0, 10).join(", ") || "Various brands"}
Price Range: $${shopData.priceRange.min} - $${shopData.priceRange.max}`;

  if (shopData.categories && shopData.categories.length > 0) {
    userPrompt += `\nCategories: ${shopData.categories.slice(0, 10).join(", ")}`;
  }

  userPrompt += `\n\nGenerate exactly 3 contextual, natural queries that customers of this store might ask.`;

  const result = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return null;
  }

  const json = safeJsonParse<{ queries?: string[] }>(content);

  if (!json?.queries || json.queries.length === 0) {
    return null;
  }

  return json.queries;
}

/**
 * Generate contextual follow-up queries based on the user's question and products shown.
 * Returns 3 related queries that naturally continue the conversation.
 */
export async function generateFollowUpQueries(
  userMessage: string,
  products: Array<{ title: string; productType: string; tags: string[] }>
): Promise<string[] | null> {
  // Test mode: return mock follow-ups
  if (TEST_MODE) {
    return [
      "Show me similar products",
      "What's the most popular?",
      "Any other colors available?",
    ];
  }

  const systemPrompt = `You are a shopping assistant helping customers continue their product search.

Your task is to generate exactly 3 natural follow-up queries that a customer might ask after seeing search results. These should:
- Be directly related to what they just asked about
- Help them refine, expand, or explore their search
- Sound natural and conversational
- Be specific but not repetitive
- Be concise (under 8 words each)
- Encourage deeper engagement

Examples of good follow-up queries:
After "Show me running shoes":
- "What about trail running shoes?"
- "Show me the most popular ones"
- "Any under $80?"

After "I need a gift":
- "What's trending right now?"
- "Show me items under $50"
- "What about gift sets?"

After "Looking for winter jackets":
- "Do you have parkas?"
- "Show me waterproof options"
- "What's warmest?"

Return JSON only: { "queries": ["query1", "query2", "query3"] }`;

  const productSummary = products.slice(0, 3).map((p) => ({
    title: p.title,
    type: p.productType,
    tags: p.tags.slice(0, 3),
  }));

  const userPrompt = `User asked: "${userMessage}"

Products shown:
${productSummary.map((p) => `- ${p.title} (${p.type})`).join("\n")}

Generate exactly 3 natural follow-up queries that would help the customer continue their search.`;

  const result = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return null;
  }

  const json = safeJsonParse<{ queries?: string[] }>(content);

  if (!json?.queries || json.queries.length === 0) {
    return null;
  }

  return json.queries;
}
