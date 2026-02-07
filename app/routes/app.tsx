import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { FeedbackWidget } from "../components/FeedbackWidget";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-box padding="base" borderWidth="base" background="subdued">
        <s-stack direction="inline" gap="base">
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/onboarding">Getting Started</s-link>
          <s-link href="/app/optimize">Product Optimizer</s-link>
          <s-link href="/app/test-metafields">Test Metafields</s-link>
          <s-link href="/app/additional">Settings</s-link>
        </s-stack>
      </s-box>
      <Outlet />
      <FeedbackWidget currentPage={location.pathname} />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
