---
name: shopify-global
description: Shopify app development — billing, deployment (Fly.io), and troubleshooting
  config/extensions/proxy/admin issues. (Global)
argument-hint: <action> [args...]
metadata:
  openclaw:
    user-invocable: true
    requires:
      bins:
      - shopify
      - npx
      - git
permalink: project-context/skills/shopify/skill
tags:
  - claude-code
---

# Shopify Skill

All-in-one Shopify app development: billing integration, Fly.io deployment, and expert diagnostics.

## Usage

```
/shopify billing --plan-name premium --price 9.99 --trial-days 14
/shopify deploy --staging
/shopify diagnose blank admin page after fresh scaffold
/shopify diagnose extension not showing in theme editor
```

Parse `$ARGUMENTS` to determine the action from the first word.

---

## billing — Shopify Billing API Integration

Implement recurring subscriptions with optional free trial.

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| --plan-name | app-monthly | Billing plan identifier |
| --price | 4.99 | Monthly price in USD |
| --trial-days | 7 | Free trial period (0 for no trial) |

### Steps

1. **Configure billing in shopify.app.toml**
   ```toml
   [billing]
     [billing.<plan-name>]
     amount = <price>
     currency_code = "USD"
     interval = "EVERY_30_DAYS"
     trial_days = <trial-days>
   ```

2. **Configure billing in shopify.server.ts**
   ```typescript
   import { shopifyApp, BillingInterval } from "@shopify/shopify-app-react-router";

   const shopify = shopifyApp({
     billing: {
       "<plan-name>": {
         amount: <price>,
         currencyCode: "USD",
         interval: BillingInterval.Every30Days,
         trialDays: <trial-days>,
       },
     },
   });
   ```

3. **Create billing service** (`app/services/billing.server.ts`) with `getBillingStatus()` and `requestSubscription()`

4. **Create billing route** (`app/routes/app.billing.tsx`) — status display, trial countdown, subscribe/cancel

5. **Add billing check middleware** in admin routes using `billing.require()`

6. **Handle app/uninstalled webhook** — cleanup shop settings

### Billing Flow
```
Install → Auto-start trial → Trial active (full features)
                                    │
                           Trial expires
                                    │
                    ┌───────────────┤
                    │               │
            Merchant approves   Merchant declines
                    │               │
            Subscription active  Features disabled
```

---

## deploy — Deploy to Fly.io

Deploy a Shopify Hydrogen/Remix app to Fly.io with GitHub Actions CI/CD.

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| --app-name | (from package.json) | Fly.io app name |
| --region | iad | Primary region |
| --staging | false | Deploy to staging |

### Steps

1. `fly launch --name <app-name> --region <region>`
2. Create Dockerfile (Node 20, Prisma, production build)
3. Create fly.toml (port 3000, HTTPS, auto-stop/start)
4. Set secrets: `fly secrets set SHOPIFY_API_KEY=xxx SHOPIFY_API_SECRET=xxx ...`
5. Run migrations: `fly ssh console -C "npx prisma migrate deploy"`
6. Deploy: `fly deploy`
7. Update shopify.app.toml URLs to point to `<app-name>.fly.dev`
8. Push config: `shopify app config push`
9. Set up GitHub Actions CI/CD (`.github/workflows/deploy.yml`)
10. Post-deployment verification checklist

---

## diagnose — Expert Troubleshooting

Diagnose and fix Shopify app development issues. Follow these steps in order, stop when root cause is found.

### Step 1: Check shopify.web.toml

Must have:
```toml
name = "React Router"
roles = ["frontend", "backend"]
webhooks_path = "/webhooks/app/uninstalled"

[commands]
predev = "npx prisma generate"
dev = "npx prisma migrate deploy && npm exec react-router dev"
```

**Common mistake:** Using `npm run dev` instead of `npm exec react-router dev`.

### Step 2: Check .shopify/project.json

Must exist with correct `client_id` key and valid `dev_store_url`.

### Step 3: Check shopify.app.toml

Verify: non-empty `client_id`, `[app_proxy]` section if needed, `[webhooks]`, `[access_scopes]`, `[auth]`. Delete duplicate named config files (keep only `shopify.app.toml`).

### Step 4: Check Extension TOML Format

Must use **flat format** (no `[[extensions]]` array wrapper, no top-level `api_version`):
```toml
name = "extension-name"
uid = "auto-generated-uid"
type = "theme"
```

### Step 5: Check Block Liquid Schema Targets

| Target | Where it appears |
|--------|-----------------|
| `"body"` | App embeds (toggle on/off globally) |
| `"section"` | Addable block within theme sections |

For both: create two separate `.liquid` files.

### Step 6: Verify Build Integrity

```bash
npx prisma generate && npx tsc --noEmit && npx react-router build
```

### Step 7: Check Dev Server Output

Look for extension registration messages, tunnel URL, errors. Try `shopify app dev --reset` if stale.

### Quick Reference

| Symptom | Fix |
|---------|-----|
| Blank admin page | Add `predev = "npx prisma generate"` |
| Extension not in App embeds | Change target to `"body"` |
| Extension not in theme editor | Use flat toml, run `--reset` |
| "No app with client ID" | Set valid `client_id` |
| Proxy returns 404 | Match `[app_proxy]` subpath |
| Database tables missing | Add `prisma migrate deploy` to dev command |

### Reference Repos

- `~/Code/clerk` — Working proxy + theme extension
- `~/Code/discount-ai` — Full toml + Prisma integration