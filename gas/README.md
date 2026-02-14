# GAS (Google Apps Script) -- MVP-1 Backend Contour

This folder contains the Google Apps Script (GAS) backend skeleton for
MVP-1.

The GAS layer acts as a lightweight API between the Next.js app (Vercel)
and Google Sheets.

It is responsible for: - Routing incoming requests - Validating input -
Enforcing idempotency (`request_id`) - Writing structured records to
Google Sheets - Emitting domain events - Handling feature flags -
Sending Telegram notifications (when enabled)

------------------------------------------------------------------------

## 1️⃣ What GAS Does in MVP-1

High-level flow:

Next.js (Vercel)\
→ sends JSON request\
→ GAS Web App endpoint\
→ validates + routes action\
→ writes/reads Google Sheets\
→ returns structured JSON response

Optional: → Sends Telegram notification on specific events

------------------------------------------------------------------------

## 2️⃣ Deployment Guide (Step-by-Step)

Follow these steps carefully.

### Step 1 --- Create Apps Script Project

1.  Go to: https://script.google.com/
2.  Click **New Project**
3.  Rename the project to: `MVP-1-GAS`

------------------------------------------------------------------------

### Step 2 --- Add Files

Inside Apps Script:

1.  Delete default `Code.gs`
2.  Create files matching the structure inside `/gas/src/`
3.  Copy-paste contents of each `.gs` file into corresponding Apps
    Script files
4.  Add `99_webapp_ui.html` as an HTML file if present

File names must match exactly.

------------------------------------------------------------------------

### Step 3 --- Configure Script Properties (if required)

If using: - Telegram token - Feature flags - Sheet IDs

Set them via:

**Project Settings → Script Properties**

Never hardcode secrets inside source files.

------------------------------------------------------------------------

### Step 4 --- Deploy as Web App

1.  Click **Deploy**
2.  Select **New deployment**
3.  Choose **Web app**
4.  Set:
    -   Execute as: **Me**
    -   Who has access: **Anyone with the link**
5.  Click **Deploy**
6.  Authorize permissions if prompted

Copy the generated Web App URL.

------------------------------------------------------------------------

## 3️⃣ Connect to Vercel

In Vercel Project → Settings → Environment Variables:

Add:

GAS_WEBAPP_URL = `<your_webapp_url>`{=html}

Do NOT commit this value to the repository.

------------------------------------------------------------------------

## 4️⃣ API Contract (Draft)

All requests must:

-   Be JSON
-   Include `request_id` for mutating operations
-   Include `action` field (router determines behavior)

Example request:

POST GAS_WEBAPP_URL

{ "request_id": "uuid-123", "action": "create_batch", "payload": { ... }
}

Standard response format:

{ "ok": true, "data": { ... } }

On error:

{ "ok": false, "error": "error_code_or_message" }

------------------------------------------------------------------------

## 5️⃣ Idempotency Rules

-   Every mutating action must include `request_id`.
-   Repeating the same `request_id` must not duplicate writes.
-   GAS must return the original result for repeated requests.

------------------------------------------------------------------------

## 6️⃣ Smoke Test (Basic Health Check)

After deployment:

1.  Open Web App URL in browser.
2.  Confirm it responds (even if minimal JSON or UI placeholder).
3.  If router requires POST, use Postman or curl for test:

curl -X POST GAS_WEBAPP_URL\
-H "Content-Type: application/json"\
-d '{"request_id":"test-1","action":"ping"}'

If router has no ping action yet, this step can be validated later.

------------------------------------------------------------------------

## 7️⃣ Security Rules

-   Never commit:
    -   Google private keys
    -   Telegram tokens
    -   Sheet IDs (production)
-   Use Script Properties or Vercel environment variables.
-   Restrict access where possible.

------------------------------------------------------------------------

## 8️⃣ Future Evolution

This GAS layer is intentionally modular.

In future: - It can be replaced with Node/Postgres backend. - Domain
logic should remain consistent. - Next.js integration contract must
remain stable.

------------------------------------------------------------------------

End of document.
