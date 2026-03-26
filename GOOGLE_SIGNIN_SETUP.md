# Continue with Google (Supabase Auth)

The app uses **Supabase Auth** `signInWithOAuth({ provider: 'google' })`. Configure both **Google Cloud** and **Supabase** so sign-in works.

## 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Credentials**.
2. **Create Credentials** → **OAuth client ID** (if asked, configure the OAuth consent screen first).
3. Application type: **Web application**.
4. **Authorized JavaScript origins**
   - `https://<your-production-domain>` (e.g. `https://vixai.trade`)
   - `http://localhost:5173` (Vite dev)
5. **Authorized redirect URIs** — add **exactly** the Supabase callback URL (see Supabase Dashboard → Authentication → Providers → Google, “Callback URL”), typically:
   - `https://<project-ref>.supabase.co/auth/v1/callback`
6. Save and copy the **Client ID** and **Client secret**.

## 2. Supabase Dashboard

1. **Authentication** → **Providers** → **Google** → Enable.
2. Paste **Client ID** and **Client secret** from Google.
3. **Authentication** → **URL Configuration**:
   - **Site URL**: your production origin, e.g. `https://vixai.trade`
   - **Additional redirect URLs**: include:
     - `https://vixai.trade`
     - `https://vixai.trade/`
     - `http://localhost:5173`
     - `http://localhost:5173/`  
   (Add any staging URLs you use.)

The app sets `redirectTo` to `window.location.origin` + pathname so the PKCE flow can complete on your domain.

## 3. Behaviour in this app

- New Google users get a **`profiles`** row (upsert) with **`email_verified_at`** set so they are not stuck on the custom Resend verification screen (Google already verified the email).
- Users who later link Google to an existing email account get **`email_verified_at`** updated when they sign in with Google.

## 4. Troubleshooting

- **`redirect_uri_mismatch`**: Fix Authorized redirect URIs in Google Cloud (must include Supabase’s `.../auth/v1/callback`).
- **Stuck after redirect**: Ensure **Additional redirect URLs** in Supabase include your exact dev/prod origins.
- **Provider disabled**: Enable Google under Authentication → Providers.
