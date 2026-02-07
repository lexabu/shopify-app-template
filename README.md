# Shopify App Template

A production-ready Shopify app template with React Router, Prisma, and theme extensions.

## Features

- **React Router 7** - Full-stack TypeScript framework
- **Prisma ORM** - Database with SQLite (dev) / PostgreSQL (prod)
- **Theme App Extension** - Add functionality to storefronts
- **App Proxy** - Serve dynamic content on storefronts
- **Shopify Admin UI** - Native Shopify components (s-elements)
- **Session Storage** - Prisma-backed OAuth sessions
- **Webhooks** - Pre-configured webhook handlers

## Quick Start

### 1. Clone and Install

```bash
# Clone the template
git clone https://github.com/lexabu/shopify-app-template.git my-app
cd my-app

# Install dependencies
npm install
```

### 2. Create Your Shopify App

1. Go to [Shopify Partners Dashboard](https://partners.shopify.com)
2. Create a new app
3. Link it to this project:

```bash
shopify app config link
```

### 3. Start Development

```bash
npm run dev
```

This will:
- Start the React Router dev server
- Create a tunnel to your local app
- Install the app on your dev store

### 4. Enable Theme Extension

1. Go to your dev store admin
2. Navigate to **Online Store > Themes > Customize**
3. Click **App embeds** in the left sidebar
4. Toggle on your extension
5. Save

## Project Structure

```
├── app/
│   ├── components/        # React components
│   ├── routes/            # React Router routes
│   │   ├── api.*.ts       # API endpoints
│   │   ├── app.*.tsx      # Admin UI pages
│   │   ├── auth.*.tsx     # OAuth routes
│   │   └── webhooks.*.tsx # Webhook handlers
│   ├── services/          # Server-side services
│   ├── db.server.ts       # Prisma client
│   ├── shopify.server.ts  # Shopify auth config
│   └── root.tsx           # App root
├── extensions/
│   └── theme-extension/   # Theme app extension
│       ├── assets/        # JS/CSS for storefront
│       ├── blocks/        # Liquid templates
│       └── locales/       # Translations
├── prisma/
│   └── schema.prisma      # Database schema
├── shopify.app.toml       # App configuration
└── shopify.web.toml       # Web configuration
```

## Configuration

### Environment Variables

Create a `.env` file (see `.env.example`):

```env
# Auto-configured by Shopify CLI
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=

# Optional: External APIs
OPENAI_API_KEY=
```

### Access Scopes

Edit `shopify.app.toml` to add the scopes your app needs:

```toml
[access_scopes]
scopes = "read_products,write_products"
```

### App Proxy

Configure your proxy endpoint in `shopify.app.toml`:

```toml
[app_proxy]
url = "/api/proxy"
subpath = "my-app"  # https://store.myshopify.com/apps/my-app
prefix = "apps"
```

## Database

### Development (SQLite)

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev
```

### Production (PostgreSQL)

Update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

## Deployment

### Deploy to Shopify

```bash
npm run deploy
```

This uploads your app configuration and extension to Shopify.

### Deploy App Server

The app server can be deployed to:
- [Fly.io](https://fly.io)
- [Railway](https://railway.app)
- [Render](https://render.com)
- Any Node.js hosting

## Common Tasks

### Add a New Admin Page

Create `app/routes/app.my-page.tsx`:

```tsx
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { data: "Hello" };
};

export default function MyPage() {
  return (
    <s-page heading="My Page">
      <s-section>
        <s-text>Hello World</s-text>
      </s-section>
    </s-page>
  );
}
```

### Add an API Endpoint

Create `app/routes/api.my-endpoint.ts`:

```tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return new Response(JSON.stringify({ shop: session.shop }), {
    headers: { "Content-Type": "application/json" },
  });
};
```

### Add a Theme Block

Create `extensions/theme-extension/blocks/my-block.liquid`:

```liquid
<div class="my-block">
  {{ block.settings.text }}
</div>

{% schema %}
{
  "name": "My Block",
  "target": "section",
  "settings": [
    {
      "type": "text",
      "id": "text",
      "label": "Text",
      "default": "Hello World"
    }
  ]
}
{% endschema %}
```

## Resources

- [Shopify App Development](https://shopify.dev/docs/apps)
- [React Router Docs](https://reactrouter.com)
- [Prisma Docs](https://www.prisma.io/docs)
- [Theme App Extensions](https://shopify.dev/docs/apps/online-store/theme-app-extensions)

## License

MIT
