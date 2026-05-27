# GSTIN public search (Microvista proxy)

Server-side proxy for the GST Reco website **GSTIN Search** tool. Calls Microvista `MVAppCommonSearchTPGSTIN` (same integration as gst-reconciler `searchPartyByGstinPublic`).

## Deploy

From `GSTRecowebsite` (with [Supabase CLI](https://supabase.com/docs/guides/cli) linked to project `qfeuxyuyxjkmqjpiknes`):

```bash
supabase secrets set MV_API_KEY=your_key MV_SECRET_KEY=your_secret COMPANY_GSTIN=your_company_gstin
supabase functions deploy gstin-public-search --no-verify-jwt
```

`--no-verify-jwt` allows anonymous website visitors to call the function with only the Supabase **anon** key (no user login).

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `MV_API_KEY` | Yes | Microvista API key |
| `MV_SECRET_KEY` | Yes | Microvista secret key |
| `COMPANY_GSTIN` | Yes | Company GSTIN for `GSTIN` request header |

## Test

```bash
curl -s -X POST \
  'https://qfeuxyuyxjkmqjpiknes.supabase.co/functions/v1/gstin-public-search' \
  -H 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  -H 'apikey: YOUR_SUPABASE_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"gstin":"27AABCU9603R1ZX"}'
```

## Response

**200** — `{ "success": true, "data": { ... } }` with normalized fields (`tradeName`, `legalName`, `status`, `dealerType`, addresses, jurisdictions, `natureOfBusiness`, etc.).

**404** — Valid format but not found on portal.

**503** — Microvista secrets not set on the project.
