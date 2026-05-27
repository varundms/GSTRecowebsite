// Proxies Microvista Public Search Taxpayer API (MVAppCommonSearchTPGSTIN) for the GST Reco website.
// Secrets: MV_API_KEY, MV_SECRET_KEY, COMPANY_GSTIN (Supabase Edge Function env).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SEARCH_ENDPOINT =
  "https://www.ewaybills.com/MVEWBAuthenticate/MVAppCommonSearchTPGSTIN";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function formatAddress(addr: Record<string, unknown> | null | undefined): string | null {
  if (!addr || typeof addr !== "object") return null;
  const parts = [
    addr.bno,
    addr.bnm,
    addr.st,
    addr.loc,
    addr.dst,
    addr.stcd,
    addr.pncd,
  ]
    .map((p) => (p != null ? String(p).trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function normalizeParty(gstin: string, raw: Record<string, unknown>) {
  const pradr = (raw.pradr as Record<string, unknown>) || {};
  const pradrAddr = (pradr.addr as Record<string, unknown>) || {};
  const adadr = Array.isArray(raw.adadr) && raw.adadr.length > 0
    ? (raw.adadr[0] as Record<string, unknown>)
    : null;
  const adadrAddr = (adadr?.addr as Record<string, unknown>) || {};

  const tradeName =
    (raw.tradeNam as string) ||
    (raw.TradeNam as string) ||
    (raw.tradeName as string) ||
    null;
  const legalName =
    (raw.lgnm as string) ||
    (raw.Lgnm as string) ||
    (raw.legalName as string) ||
    null;

  return {
    gstin,
    tradeName,
    legalName,
    displayName: tradeName || legalName,
    status: (raw.sts as string) || null,
    dealerType: (raw.dty as string) || null,
    constitutionOfBusiness: (raw.ctb as string) || null,
    einvoiceStatus: (raw.einvoiceStatus as string) || null,
    registrationDate: parseDate(raw.rgdt),
    lastUpdateDate: parseDate(raw.lstupdt),
    cancellationDate: parseDate(raw.cxdt),
    stateJurisdictionCode: (raw.stjCd as string) || null,
    stateJurisdiction: (raw.stj as string) || null,
    centerJurisdictionCode: (raw.ctjCd as string) || null,
    centerJurisdiction: (raw.ctj as string) || null,
    natureOfBusiness: Array.isArray(raw.nba)
      ? (raw.nba as string[]).filter(Boolean)
      : [],
    principalAddress: formatAddress(pradrAddr),
    principalNatureOfTrade: (pradr.ntr as string) || null,
    additionalAddress: formatAddress(adadrAddr),
    additionalNatureOfTrade: (adadr?.ntr as string) || null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    let body: { gstin?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const gstin = String(body.gstin || "").trim().toUpperCase();
    if (!GSTIN_RE.test(gstin)) {
      return jsonResponse({ error: "Invalid GSTIN format", code: "invalid_gstin" }, 400);
    }

    const apiKey = Deno.env.get("MV_API_KEY")?.trim();
    const secretKey = Deno.env.get("MV_SECRET_KEY")?.trim();
    const companyGstin = (
      Deno.env.get("COMPANY_GSTIN") ||
      Deno.env.get("VITE_GSTIN") ||
      ""
    )
      .trim()
      .toUpperCase();

    if (!apiKey || !secretKey) {
      return jsonResponse(
        { error: "GSTIN lookup is not configured", code: "not_configured" },
        503,
      );
    }

    if (!companyGstin) {
      return jsonResponse(
        { error: "Company GSTIN is not configured", code: "not_configured" },
        503,
      );
    }

    const mvResponse = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        MVApiKey: apiKey,
        MVSecretKey: secretKey,
        GSTIN: companyGstin,
        "Content-Type": "application/json",
        appGSTIN: gstin,
      },
      body: JSON.stringify({
        AppCommonSearchGSTINTP: { GSTIN: gstin },
      }),
    });

    const contentType = mvResponse.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await mvResponse.text();
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        return jsonResponse(
          { error: "GSTIN lookup service unavailable", code: "upstream_error" },
          502,
        );
      }
      return jsonResponse(
        { error: "Unexpected response from GSTIN lookup", code: "upstream_error" },
        502,
      );
    }

    const data = await mvResponse.json();
    const isSuccess =
      data.Status === "1" || data.Status === 1 || data.Status === "success";
    const partyData = (data.AppSCommonSearchTPResponse || data) as Record<
      string,
      unknown
    >;

    const hasParty =
      partyData.tradeNam ||
      partyData.lgnm ||
      partyData.tradeName ||
      partyData.legalName ||
      partyData.TradeNam ||
      partyData.Lgnm;

    if (!isSuccess || !hasParty) {
      const message =
        data.ErrorMessage ||
        data.Message ||
        data.error ||
        "GSTIN not found on GSTN portal";
      return jsonResponse(
        { error: String(message), code: "not_found" },
        404,
      );
    }

    return jsonResponse({
      success: true,
      data: normalizeParty(gstin, partyData),
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        code: "server_error",
      },
      500,
    );
  }
});
