/**
 * GSTIN format validation and public lookup API client for gstin-search.html
 */
(function (global) {
  const STATE_CODES = {
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "25": "Daman & Diu",
    "26": "Dadra & Nagar Haveli",
    "27": "Maharashtra",
    "28": "Andhra Pradesh (Old)",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction",
  };

  const ENTITY_TYPES = {
    "1": "Individual / Proprietor",
    "2": "Partnership / LLP",
    "3": "HUF",
    "4": "Company (Private/Public)",
    "5": "Trust",
    "6": "Society / Club / AOP",
    "7": "Government Department",
    "8": "Public Sector Undertaking",
    "9": "Local Authority",
    A: "AOP / BOI",
    B: "Local Authority",
    C: "Statutory Body",
    F: "Foreign Company",
    G: "Government",
    H: "HUF",
    L: "Local Authority",
    J: "Artificial Juridical Person",
    T: "Trust",
    K: "Krishi Kalyan Kendra",
  };

  const PAN_TYPES = {
    A: "AOP",
    B: "BOI",
    C: "Company",
    F: "Firm",
    G: "Government",
    H: "HUF",
    J: "Artificial Juridical Person",
    L: "Local Authority",
    P: "Individual",
    T: "Trust (AOP)",
  };

  function escapeHtml(value) {
    if (value == null || value === "") return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function validateGSTINFormat(gstin) {
    gstin = gstin.toUpperCase().trim();

    if (gstin.length !== 15) {
      return {
        valid: false,
        error: `GSTIN must be exactly 15 characters (you entered ${gstin.length})`,
      };
    }

    const stateCode = gstin.substring(0, 2);
    if (!/^\d{2}$/.test(stateCode)) {
      return { valid: false, error: "First 2 characters must be a numeric state code" };
    }
    if (!STATE_CODES[stateCode]) {
      return { valid: false, error: `"${stateCode}" is not a valid state code` };
    }

    const pan = gstin.substring(2, 12);
    if (!/^[A-Z]{3}[ABCFGHLJPTF][A-Z]\d{4}[A-Z]$/.test(pan)) {
      return {
        valid: false,
        error: "Characters 3–12 must form a valid PAN (e.g. AABCU9603R)",
      };
    }

    const entityNum = gstin[12];
    if (!/^[1-9A-Z]$/.test(entityNum)) {
      return {
        valid: false,
        error: "Character 13 must be entity number (1–9 or A–Z)",
      };
    }

    if (gstin[13] !== "Z") {
      return { valid: false, error: 'Character 14 must always be "Z"' };
    }

    const checkChar = gstin[14];
    if (!/^[0-9A-Z]$/.test(checkChar)) {
      return { valid: false, error: "Character 15 must be alphanumeric checksum" };
    }

    return {
      valid: true,
      gstin,
      stateCode,
      stateName: STATE_CODES[stateCode],
      pan,
      panType: PAN_TYPES[pan[3]] || "Unknown",
      panHolder: pan.substring(0, 3),
      entityNum,
      entityType: ENTITY_TYPES[entityNum] || "Entity " + entityNum,
      checkChar,
    };
  }

  function isLookupConfigured(supabaseUrl, supabaseAnonKey) {
    return Boolean(
      supabaseUrl && supabaseAnonKey && !String(supabaseUrl).includes("__SUPABASE"),
    );
  }

  /**
   * @returns {Promise<{ ok: true, data: object } | { ok: false, code: string, message: string }>}
   */
  async function fetchGstinDetails(supabaseUrl, supabaseAnonKey, gstin) {
    const url = `${String(supabaseUrl).replace(/\/$/, "")}/functions/v1/gstin-public-search`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ gstin }),
    });

    let json;
    try {
      json = await res.json();
    } catch {
      return {
        ok: false,
        code: "parse_error",
        message: "Invalid response from lookup service",
      };
    }

    if (res.ok && json.success && json.data) {
      return { ok: true, data: json.data };
    }

    const message =
      json.error ||
      (res.status === 404
        ? "This GSTIN has a valid format but was not found on the GSTN portal."
        : "Could not complete GSTIN lookup. Please try again.");

    return {
      ok: false,
      code: json.code || (res.status === 404 ? "not_found" : "api_error"),
      message: String(message),
      status: res.status,
    };
  }

  function formatDisplayDate(isoOrRaw) {
    if (!isoOrRaw) return "—";
    const s = String(isoOrRaw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    }
    return s;
  }

  global.GstinSearchUtils = {
    STATE_CODES,
    ENTITY_TYPES,
    PAN_TYPES,
    escapeHtml,
    validateGSTINFormat,
    isLookupConfigured,
    fetchGstinDetails,
    formatDisplayDate,
  };
})(typeof window !== "undefined" ? window : globalThis);
