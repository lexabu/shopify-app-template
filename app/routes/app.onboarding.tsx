import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function OnboardingPage() {
  return (
    <s-page heading="Getting Started">
      <s-section>
        <s-banner tone="info">
          <s-text>
            Welcome to Product Finder! This AI-powered chat assistant helps your customers discover the perfect products through natural conversation.
          </s-text>
        </s-banner>
      </s-section>

      <s-section heading="How It Works">
        <s-paragraph>
          Product Finder uses AI to understand customer questions in real-time and recommend your products with natural, helpful responses. Every recommendation is based on your actual product catalog from Shopify.
        </s-paragraph>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>1️⃣ Customer asks a question</s-heading>
            <s-paragraph>
              "I need a snowboard for beginners" or "What's good for sensitive skin?"
            </s-paragraph>

            <s-heading>2️⃣ AI extracts keywords</s-heading>
            <s-paragraph>
              Our AI identifies the key terms to search your catalog
            </s-paragraph>

            <s-heading>3️⃣ Products are fetched in real-time</s-heading>
            <s-paragraph>
              We search your Shopify products for the best matches
            </s-paragraph>

            <s-heading>4️⃣ AI generates a friendly response</s-heading>
            <s-paragraph>
              Products are presented with natural, conversational recommendations
            </s-paragraph>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Optimizing Your Products for Better Recommendations">
        <s-paragraph>
          The quality of AI recommendations depends on how well your products are described. Follow these best practices to help customers find exactly what they need:
        </s-paragraph>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>1. Write Descriptive Product Titles</s-heading>
            <s-paragraph>
              Include key information that customers search for: product type, features, and target audience.
            </s-paragraph>
            <s-box padding="base">
              <s-heading>✅ Good Example:</s-heading>
              <s-paragraph>"Beginner Snowboard - All Mountain - 150cm"</s-paragraph>
            </s-box>
            <s-box padding="base">
              <s-heading>❌ Avoid:</s-heading>
              <s-paragraph>"Snowboard" or "Product #1234"</s-paragraph>
            </s-box>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>2. Use Consistent, Searchable Tags</s-heading>
            <s-paragraph>
              Tags help the AI match products to customer intent. Use clear, standardized terms.
            </s-paragraph>
            <s-box padding="base">
              <s-heading>✅ Good Examples:</s-heading>
              <s-unordered-list>
                <s-list-item>"beginner", "intermediate", "advanced"</s-list-item>
                <s-list-item>"winter-sports", "snowboarding", "skiing"</s-list-item>
                <s-list-item>"sensitive-skin", "organic", "hypoallergenic"</s-list-item>
                <s-list-item>"waterproof", "breathable", "insulated"</s-list-item>
              </s-unordered-list>
            </s-box>
            <s-box padding="base">
              <s-heading>❌ Avoid:</s-heading>
              <s-unordered-list>
                <s-list-item>Random tag variations: "beginner", "beginners", "for-beginners"</s-list-item>
                <s-list-item>Internal codes: "SKU-2024-W", "BATCH-A"</s-list-item>
                <s-list-item>Overly broad tags: "products", "new", "sale"</s-list-item>
              </s-unordered-list>
            </s-box>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>3. Write Rich Product Descriptions</s-heading>
            <s-paragraph>
              While descriptions aren't currently used by the AI, detailed descriptions help customers make informed decisions once they view your products.
            </s-paragraph>
            <s-banner tone="info">
              <s-text>
                <strong>Future enhancement:</strong> We may use descriptions for even smarter recommendations in upcoming versions!
              </s-text>
            </s-banner>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>4. Keep Products Active and Published</s-heading>
            <s-paragraph>
              Only <strong>active, published products</strong> appear in recommendations. Draft or archived products won't be shown to customers.
            </s-paragraph>
            <s-unordered-list>
              <s-list-item>Regularly review and publish new products</s-list-item>
              <s-list-item>Archive discontinued or out-of-stock items</s-list-item>
              <s-list-item>Keep inventory status up-to-date</s-list-item>
            </s-unordered-list>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>5. Update Products Regularly</s-heading>
            <s-paragraph>
              When the AI can't find exact matches for a customer's query, it shows your most recently updated products as "popular items".
            </s-paragraph>
            <s-banner tone="info">
              <s-text>
                Tip: Update key products periodically (even minor tweaks) to ensure they appear in fallback recommendations.
              </s-text>
            </s-banner>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Understanding the Technology">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>Real-Time Product Fetching</s-heading>
            <s-paragraph>
              Product Finder fetches products directly from Shopify on every query. This means:
            </s-paragraph>
            <s-unordered-list>
              <s-list-item>✅ Product data is always fresh and accurate</s-list-item>
              <s-list-item>✅ Price changes appear immediately</s-list-item>
              <s-list-item>✅ New products are available instantly</s-list-item>
              <s-list-item>✅ No sync delays or data inconsistencies</s-list-item>
            </s-unordered-list>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>Privacy & Security</s-heading>
            <s-paragraph>
              Your data privacy is important to us:
            </s-paragraph>
            <s-unordered-list>
              <s-list-item>Only product <strong>titles and URLs</strong> are sent to OpenAI</s-list-item>
              <s-list-item>No customer data, prices, or inventory levels are shared</s-list-item>
              <s-list-item>Conversations are logged for analytics and attribution only</s-list-item>
              <s-list-item>All data stays within your Shopify store and our secure servers</s-list-item>
            </s-unordered-list>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>Cost Efficiency</s-heading>
            <s-paragraph>
              Product Finder uses OpenAI's <code>gpt-4o-mini</code> model for optimal quality at minimal cost:
            </s-paragraph>
            <s-unordered-list>
              <s-list-item>~$0.00015 per customer query</s-list-item>
              <s-list-item>Rate limits protect against unexpected costs</s-list-item>
              <s-list-item>Automatic fallback to basic keyword search if needed</s-list-item>
            </s-unordered-list>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Tracking Performance">
        <s-paragraph>
          Visit your <s-link href="/app">Dashboard</s-link> to monitor:
        </s-paragraph>
        <s-unordered-list>
          <s-list-item><strong>Conversations:</strong> Total customer queries processed</s-list-item>
          <s-list-item><strong>Conversions:</strong> Orders attributed to chat recommendations</s-list-item>
          <s-list-item><strong>Conversion Rate:</strong> Percentage of conversations leading to purchases</s-list-item>
          <s-list-item><strong>Attributed Revenue:</strong> Total sales from chat-driven recommendations</s-list-item>
          <s-list-item><strong>Top Queries:</strong> What customers are asking about most</s-list-item>
          <s-list-item><strong>Rate Limiting:</strong> Current usage against daily limits</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Need Help?">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-paragraph>
              <strong>Quick Start Checklist:</strong>
            </s-paragraph>
            <s-unordered-list>
              <s-list-item>✅ Review your product titles and make them descriptive</s-list-item>
              <s-list-item>✅ Add consistent tags to all products</s-list-item>
              <s-list-item>✅ Ensure products are published and active</s-list-item>
              <s-list-item>✅ Test the chat with common customer questions</s-list-item>
              <s-list-item>✅ Monitor performance on the Dashboard</s-list-item>
            </s-unordered-list>
          </s-stack>
        </s-box>

        <s-banner tone="success">
          <s-text>
            You're all set! Product Finder is ready to help your customers discover the perfect products.
          </s-text>
        </s-banner>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
