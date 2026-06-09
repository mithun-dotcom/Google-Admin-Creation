# Google Workspace Reseller Console — split deploy

Two parts:

- **backend/** → deploy to **Render** (Node service that holds the service account and calls Google).
- **frontend/** → deploy to **Netlify** (static panel that calls the backend).

---

## Before anything: get the credentials from your reseller

These APIs use a **service account**, not a plain API key. Ask your reseller for:

1. A **service account JSON key** (his Cloud project, with Reseller API + Admin SDK API enabled).
2. That service account's **client ID** authorised in his Workspace Admin console for these scopes:
   - `https://www.googleapis.com/auth/apps.order`
   - `https://www.googleapis.com/auth/admin.directory.user`
   (Admin console → Security → Access and data control → API controls → Manage Domain-Wide Delegation → Add new)
3. A **super-admin email** on his reseller domain for the backend to act as.

---

## 1) Backend → Render

1. Push the `backend/` folder to a Git repo (or use Render's "deploy from repo").
2. On Render: **New → Web Service**, point it at the repo/folder.
   - Build command: `npm install`
   - Start command: `node server.js`
   (Or use the included `render.yaml` blueprint.)
3. Add **Environment Variables** in the Render dashboard:

   | Key | Value |
   |-----|-------|
   | `SA_KEY_JSON` | Paste the **entire** service account JSON file contents |
   | `RESELLER_ADMIN` | super-admin email on the reseller domain |
   | `PANEL_TOKEN` | any long random string (the frontend must send this) |
   | `ALLOWED_ORIGIN` | your Netlify URL, e.g. `https://your-site.netlify.app` |

   > `SA_KEY_JSON` is the whole JSON as one value. The code fixes escaped
   > newlines in the private key automatically, so pasting it as-is is fine.

4. Deploy. Visit the Render URL root — you should see `{"service":"gws-reseller-backend","ok":true}`.
   Copy that URL (e.g. `https://gws-reseller-backend.onrender.com`).

> Render's free tier sleeps when idle, so the first request after a pause takes
> a few seconds to wake. That's normal.

---

## 2) Frontend → Netlify

1. Edit **`frontend/config.js`** and set your Render URL:
   ```js
   window.API_BASE = "https://gws-reseller-backend.onrender.com";
   ```
2. Deploy the `frontend/` folder to Netlify (drag-and-drop the folder onto the
   Netlify dashboard, or connect the repo — no build step, it's static).
3. Open the Netlify site. It loads the panel; because you set `PANEL_TOKEN`, it
   asks for the token once. Enter the same value you put in Render.

You can also change the backend URL later from the sidebar **"change"** link
without redeploying (it's saved in your browser).

---

## Order of operations matters
Set `ALLOWED_ORIGIN` on Render **to your real Netlify URL** once you know it, then
redeploy the backend. If it's wrong, the browser blocks the calls with a CORS error.

## Security notes
- Always set `PANEL_TOKEN` once this is on the public internet.
- The service account key lives only on Render and is never sent to the browser.
- Keep `ALLOWED_ORIGIN` pinned to your Netlify domain.

## Reminder about existing customer domains
Creating a brand-new customer + its first admin works with the reseller
credentials. Adding users to an **already-existing** customer domain needs that
customer's super-admin to have authorised the same service account
(`admin.directory.user` scope) in their own Admin console — otherwise you'll get
a 403. Use the panel's "Users in a domain" tab and set the acting admin there.
