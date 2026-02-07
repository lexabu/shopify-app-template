import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

type TestResult = {
  test: string;
  status: "pending" | "success" | "error";
  message: string;
  details?: any;
};

export default function TestMetafieldsPage() {
  const { shop } = useLoaderData<typeof loader>();
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const addResult = (result: TestResult) => {
    setResults((prev) => [...prev, result]);
  };

  const runTests = async () => {
    setRunning(true);
    setResults([]);

    try {
      // Test 1: Write a test value
      addResult({
        test: "1. Write Test Value",
        status: "pending",
        message: "Writing test value to metafield...",
      });

      const writeResponse = await fetch("/api/test-metafields/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: "This is a test value created at " + new Date().toISOString(),
        }),
      });

      const writeData = await writeResponse.json();
      if (writeResponse.ok && writeData.success) {
        addResult({
          test: "1. Write Test Value",
          status: "success",
          message: "✅ Successfully wrote test value to metafield",
          details: writeData,
        });
      } else {
        addResult({
          test: "1. Write Test Value",
          status: "error",
          message: "❌ Failed to write test value",
          details: writeData,
        });
        return;
      }

      // Test 2: Read the value back
      addResult({
        test: "2. Read Test Value",
        status: "pending",
        message: "Reading value from metafield...",
      });

      const readResponse = await fetch("/api/test-metafields/read");
      const readData = await readResponse.json();

      if (readResponse.ok && readData.value) {
        addResult({
          test: "2. Read Test Value",
          status: "success",
          message: "✅ Successfully read value from metafield",
          details: readData,
        });
      } else {
        addResult({
          test: "2. Read Test Value",
          status: "error",
          message: "❌ Failed to read value",
          details: readData,
        });
        return;
      }

      // Test 3: Update the value
      addResult({
        test: "3. Update Test Value",
        status: "pending",
        message: "Updating metafield value...",
      });

      const updateResponse = await fetch("/api/test-metafields/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: "Updated test value at " + new Date().toISOString(),
        }),
      });

      const updateData = await updateResponse.json();
      if (updateResponse.ok && updateData.success) {
        addResult({
          test: "3. Update Test Value",
          status: "success",
          message: "✅ Successfully updated metafield value",
          details: updateData,
        });
      } else {
        addResult({
          test: "3. Update Test Value",
          status: "error",
          message: "❌ Failed to update value",
          details: updateData,
        });
        return;
      }

      // Test 4: Verify update
      addResult({
        test: "4. Verify Update",
        status: "pending",
        message: "Reading updated value...",
      });

      const verifyResponse = await fetch("/api/test-metafields/read");
      const verifyData = await verifyResponse.json();

      if (verifyResponse.ok && verifyData.value?.includes("Updated")) {
        addResult({
          test: "4. Verify Update",
          status: "success",
          message: "✅ Successfully verified update",
          details: verifyData,
        });
      } else {
        addResult({
          test: "4. Verify Update",
          status: "error",
          message: "❌ Update verification failed",
          details: verifyData,
        });
        return;
      }

      // Test 5: Delete the test value
      addResult({
        test: "5. Delete Test Value",
        status: "pending",
        message: "Deleting test metafield...",
      });

      const deleteResponse = await fetch("/api/test-metafields/delete", {
        method: "DELETE",
      });

      const deleteData = await deleteResponse.json();
      if (deleteResponse.ok && deleteData.success) {
        addResult({
          test: "5. Delete Test Value",
          status: "success",
          message: "✅ Successfully deleted test metafield",
          details: deleteData,
        });
      } else {
        addResult({
          test: "5. Delete Test Value",
          status: "error",
          message: "❌ Failed to delete metafield",
          details: deleteData,
        });
      }

      // Final summary
      addResult({
        test: "✅ All Tests Complete",
        status: "success",
        message:
          "All metafield operations working correctly! Ready to migrate customContext to metafields.",
      });
    } catch (error: any) {
      addResult({
        test: "❌ Test Suite Failed",
        status: "error",
        message: error.message || "Unknown error",
        details: error,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <s-page heading="Metafields Test Suite">
      <s-section>
        <s-banner tone="info">
          <s-text>
            This page tests Shopify Metafields CRUD operations to verify we can
            safely migrate customContext from database to metafields.
          </s-text>
        </s-banner>
      </s-section>

      <s-section heading="Test Information">
        <s-paragraph>
          <strong>Shop:</strong> {shop}
        </s-paragraph>
        <s-paragraph>
          <strong>Namespace:</strong> product_finder
        </s-paragraph>
        <s-paragraph>
          <strong>Test Key:</strong> test_value
        </s-paragraph>
        <s-paragraph>
          <strong>Future Key:</strong> custom_context (after migration)
        </s-paragraph>
      </s-section>

      <s-section heading="Run Tests">
        <s-button onClick={runTests} disabled={running}>
          {running ? "Running Tests..." : "Run All Tests"}
        </s-button>
      </s-section>

      {results.length > 0 && (
        <s-section heading="Test Results">
          <s-stack gap="base">
            {results.map((result, index) => (
              <s-box
                key={index}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack gap="base">
                  <s-heading>{result.test}</s-heading>
                  <s-paragraph>
                    {result.status === "pending" && "⏳ "}
                    {result.status === "success" && "✅ "}
                    {result.status === "error" && "❌ "}
                    {result.message}
                  </s-paragraph>
                  {result.details && (
                    <s-box padding="base">
                      <pre
                        style={{
                          fontSize: "12px",
                          overflow: "auto",
                          maxHeight: "200px",
                        }}
                      >
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    </s-box>
                  )}
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}

      <s-section heading="What This Tests">
        <s-unordered-list>
          <s-list-item>
            <strong>Write:</strong> Create a new metafield with test data
          </s-list-item>
          <s-list-item>
            <strong>Read:</strong> Retrieve the metafield value
          </s-list-item>
          <s-list-item>
            <strong>Update:</strong> Modify the existing metafield
          </s-list-item>
          <s-list-item>
            <strong>Verify:</strong> Confirm the update was successful
          </s-list-item>
          <s-list-item>
            <strong>Delete:</strong> Remove the test metafield (cleanup)
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Next Steps">
        <s-paragraph>
          If all tests pass, we can safely proceed with migrating customContext
          to metafields:
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            1. Create metafields service layer
          </s-list-item>
          <s-list-item>
            2. Update settings API to use metafields instead of database
          </s-list-item>
          <s-list-item>
            3. Migrate existing customContext data (if any)
          </s-list-item>
          <s-list-item>
            4. Remove customContext from database schema
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Documentation">
        <s-paragraph>
          See <code>/docs/storage-architecture.md</code> for detailed
          documentation on the hybrid storage approach.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
