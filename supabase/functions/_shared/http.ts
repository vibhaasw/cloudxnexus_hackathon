import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(value: unknown, status = 200): Response {
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).byteLength > 1024) {
    console.error("[api] response exceeded the 1 KB device payload limit");
    return new Response('{"error":"response too large"}', {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function isOptions(request: Request): boolean {
  return request.method === "OPTIONS";
}

export function methodNotAllowed(): Response {
  return jsonResponse({ error: "method not allowed" }, 405);
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

/** Returns null when authorized, otherwise a ready-to-send JSON response. */
export function authorizeApiKey(
  request: Request,
  allowedRole: "device" | "register",
): Response | null {
  const deviceKey = Deno.env.get("DEVICE_API_KEY");
  const registerKey = Deno.env.get("REGISTER_API_KEY");
  const allowed = allowedRole === "device" ? deviceKey : registerKey;
  const other = allowedRole === "device" ? registerKey : deviceKey;

  if (!allowed || !other) {
    console.error(`[auth] ${allowedRole} API key configuration is missing`);
    return jsonResponse(
      { error: "server authentication is not configured" },
      503,
    );
  }
  if (constantTimeEqual(allowed, other)) {
    console.error(
      "[auth] DEVICE_API_KEY and REGISTER_API_KEY must be different",
    );
    return jsonResponse(
      { error: "server authentication is misconfigured" },
      503,
    );
  }

  const supplied = request.headers.get("x-api-key");
  if (!supplied) return jsonResponse({ error: "missing API key" }, 401);
  if (constantTimeEqual(supplied, allowed)) return null;
  if (constantTimeEqual(supplied, other)) {
    return jsonResponse(
      { error: "API key is not allowed for this function" },
      403,
    );
  }
  return jsonResponse({ error: "invalid API key" }, 401);
}

/**
 * Resolves the admin secret key in Supabase Edge Functions.
 * Prefers modern SUPABASE_SECRET_KEYS (JSON) and SUPABASE_SECRET_KEY (sb_secret_...)
 * with fallback to legacy SUPABASE_SERVICE_ROLE_KEY.
 */
export function getAdminSecretKey(): string | null {
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysJson) {
    try {
      const parsed = JSON.parse(secretKeysJson);
      if (typeof parsed === "object" && parsed !== null) {
        const key = parsed.default || Object.values(parsed)[0];
        if (typeof key === "string" && key.trim().length > 0) {
          return key.trim();
        }
      }
    } catch {
      // ignore parse failure and fall back
    }
  }
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY");
  if (secretKey && secretKey.trim().length > 0) return secretKey.trim();

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && serviceRoleKey.trim().length > 0) return serviceRoleKey.trim();

  return null;
}

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const adminKey = getAdminSecretKey();
  if (!url || !adminKey) {
    throw new Error(
      "SUPABASE_URL or server-side secret key (SUPABASE_SECRET_KEYS / SUPABASE_SERVICE_ROLE_KEY) is not configured",
    );
  }
  return createClient(url, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function validIdentifier(
  value: unknown,
  maxLength = 128,
): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maxLength;
}
