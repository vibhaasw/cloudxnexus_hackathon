import {
  corsHeaders,
  isOptions,
  jsonResponse,
  methodNotAllowed,
} from "../_shared/http.ts";

Deno.serve((request: Request) => {
  if (isOptions(request)) return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowed();
  }
  return jsonResponse({ status: "ok" });
});
