import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

// Log admin dashboard link on startup if ADMIN_SECRET is configured
if (process.env.ADMIN_SECRET) {
  const storeHandle = process.env.SHOPIFY_STORE_HANDLE;
  const appSlug = process.env.SHOPIFY_APP_SLUG;

  console.log("\n" + "=".repeat(70));
  console.log("🔐 ADMIN DASHBOARD");
  console.log("=".repeat(70));

  if (storeHandle && appSlug) {
    console.log(`https://admin.shopify.com/store/${storeHandle}/apps/${appSlug}/app/admin/analytics?key=${process.env.ADMIN_SECRET}`);
  } else {
    console.log("Add SHOPIFY_STORE_HANDLE and SHOPIFY_APP_SLUG to .env for direct link");
    console.log(`Path: /app/admin/analytics?key=${process.env.ADMIN_SECRET}`);
  }

  console.log("=".repeat(70) + "\n");
}

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    reactRouter(),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
}) satisfies UserConfig;
