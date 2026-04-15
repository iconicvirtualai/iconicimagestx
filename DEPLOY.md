# Iconic Images — Deployment & Integration Guide

## What This Package Contains

| File | Action | Description |
|------|--------|-------------|
| `firestore/firestore.rules` | Replace existing | Secure rules replacing open `if true` |
| `firestore/schema.ts` | New file → `client/lib/schema.ts` | All TypeScript types for every collection |
| `client/lib/firebase.ts` | Replace existing | Adds Firebase Auth + Storage |
| `client/contexts/AuthContext.tsx` | New file | Auth provider and hooks |
| `client/pages/AdminLogin.tsx` | Replace existing | Wired to Firebase Auth |
| `server/index.ts` | Replace existing | Full Express server |
| `server/middleware/auth.ts` | New file | Firebase Admin auth middleware |
| `server/routes/bookings.ts` | New file | Booking form + confirm flow |
| `server/routes/orders.ts` | New file | Order management + dashboard stats |
| `server/routes/galleries.ts` | New file | Media upload + gallery delivery |
| `server/routes/payments.ts` | New file | Stripe integration + webhooks |
| `server/routes/vsai.ts` | New file | Virtual staging (ported from vsai-demo) |
| `server/routes/messaging.ts` | New file | Order-scoped client↔staff messaging |
| `server/routes/clients.ts` | New file | CRM client management |
| `server/routes/staff.ts` | New file | Staff management + first-run setup |
| `server/routes/campaigns.ts` | New file | Email/SMS campaign engine |
| `server/routes/agents.ts` | New file | AI agent logs + morning briefing |
| `server/services/email.ts` | New file | Email service (Nodemailer + templates) |
| `.env.example` | Reference | All required environment variables |

---

## Step 1 — Install New Dependencies

```bash
npm install firebase-admin stripe @stripe/stripe-js
# or with pnpm:
pnpm add firebase-admin stripe @stripe/stripe-js
```

---

## Step 2 — Set Up Environment Variables

### Local Development
```bash
cp .env.example .env
# Fill in all values in .env
```

### Vercel Production
Go to your Vercel project → Settings → Environment Variables and add each variable from `.env.example`.

**Critical ones to add first:**
- `FIREBASE_SERVICE_ACCOUNT` — paste the entire JSON from your Firebase service account key
- `STRIPE_SECRET_KEY` — from Stripe Dashboard
- `STRIPE_WEBHOOK_SECRET` — after you add the webhook (Step 5)
- All `VITE_FIREBASE_*` variables

---

## Step 3 — Get Your Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Project Settings (gear icon) → Service Accounts tab
4. Click **Generate new private key**
5. Download the JSON file
6. Open it, copy the entire contents
7. In Vercel: add `FIREBASE_SERVICE_ACCOUNT` with the full JSON as the value
8. Locally: paste the JSON as a single line in your `.env` file

---

## Step 4 — Create Your First Admin Account

Once deployed, run this one-time setup to create the first admin staff member:

```bash
curl -X POST https://iconicimagestx.vercel.app/api/staff/setup \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Your",
    "lastName": "Name",
    "email": "your@email.com",
    "password": "ChooseAStrongPassword123!"
  }'
```

This only works when the `staff` collection is empty. After this, create additional staff through the admin dashboard.

---

## Step 5 — Wire Up Stripe Webhook

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks
2. Click **Add endpoint**
3. URL: `https://iconicimagestx.vercel.app/api/payments/webhook`
4. Events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Copy the **Signing secret** → add as `STRIPE_WEBHOOK_SECRET` in Vercel

---

## Step 6 — Update Firestore Security Rules

1. Go to [Firebase Console](https://console.firebase.google.com) → Firestore → Rules
2. Replace everything with the contents of `firestore/firestore.rules`
3. Click **Publish**

---

## Step 7 — Update App.tsx to Add AuthProvider

Wrap your existing router in `AuthProvider`:

```tsx
// client/App.tsx — add these two lines

import { AuthProvider } from "./contexts/AuthContext";

// Wrap your <BrowserRouter> like this:
<QueryClientProvider client={queryClient}>
  <TooltipProvider>
    <AuthProvider>          {/* ← ADD THIS */}
      <BrowserRouter>
        {/* your routes */}
      </BrowserRouter>
    </AuthProvider>          {/* ← AND THIS */}
  </TooltipProvider>
</QueryClientProvider>
```

---

## Step 8 — Protect Admin Routes

Add a route guard component to protect all `/admin/*` routes:

```tsx
// client/components/RequireStaff.tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const { user, isStaff, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user || !isStaff) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

// Then in App.tsx, wrap admin routes:
<Route path="/admin/dashboard" element={
  <RequireStaff><AdminDashboard /></RequireStaff>
} />
```

---

## Step 9 — Add Builder.io SDK (for CMS content)

```bash
pnpm add @builder.io/react @builder.io/sdk
```

```tsx
// client/lib/builder.ts
import { Builder } from "@builder.io/react";
Builder.init(import.meta.env.VITE_BUILDER_API_KEY);
```

---

## Migrating from iconic-virtual-vsai-demo

The virtual staging API routes are now in `server/routes/vsai.ts`. You no longer need to maintain the separate `iconic-virtual-vsai-demo` Next.js project for new orders. The VSAI pages already exist in your main site (`VirtualStaging.tsx`, `VirtualStagingAITool.tsx`, etc.) — just update their API calls from Supabase-based endpoints to `/api/vsai/*`.

**Key changes:**
- Replace all Supabase auth calls with `useAuth()` from AuthContext
- Replace VSAI API calls to point to `/api/vsai/create`, `/api/vsai/result/:jobId`, `/api/vsai/variation`
- Stripe checkout already ported to `/api/payments/create-intent`

---

## Firestore Collections Created by This System

| Collection | Written by | Read by |
|------------|-----------|---------|
| `orderRequests` | Public (booking form) | Coordinators+ |
| `orders` | Server (on confirm) | Staff + client owner |
| `appointments` | Server (on confirm) | Staff + client owner |
| `galleries` | Photographers + server | Staff + client owner (delivered) |
| `invoices` | Server | Coordinators + client owner |
| `transactions` | Stripe webhook | Coordinators |
| `clients` | Server | Staff + client owner |
| `staff` | Admin | Staff |
| `messages` | Auth users | Staff + order client |
| `editRequests` | Auth users | Staff + order client |
| `campaigns` | Coordinators | Coordinators |
| `agentLogs` | Server + agents | Staff |
| `vsaiJobs` | Auth users | Staff + job owner |
| `emailTemplates` | Admin | Staff |
| `packages` | Admin | Public |
| `promoCodes` | Admin | Public |
| `siteSettings` | Admin | Public |
