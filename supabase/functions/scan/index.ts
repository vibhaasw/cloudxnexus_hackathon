import {
  authorizeApiKey,
  createAdminClient,
  isOptions,
  jsonResponse,
  methodNotAllowed,
  normalizeTagUid,
  readJson,
  validIdentifier,
} from "../_shared/http.ts";

Deno.serve(async (request: Request) => {
  if (isOptions(request)) {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, apikey, content-type, x-api-key",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (request.method !== "POST") return methodNotAllowed();

  const authError = authorizeApiKey(request, "device");
  if (authError) return authError;

  const body = await readJson(request);
  const deviceId = body?.device_id;
  const tagUid = body?.tag_uid;
  if (!validIdentifier(deviceId) || !validIdentifier(tagUid)) {
    return jsonResponse({
      error: "device_id and tag_uid are required (1-128 characters)",
    }, 400);
  }

  const quantityText = Deno.env.get("UNITS_PER_BOX") ?? "40";
  const quantity = Number(quantityText);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
    console.error("[scan] UNITS_PER_BOX must be an integer from 1 to 100000");
    return jsonResponse(
      { error: "server batch quantity is misconfigured" },
      503,
    );
  }

  try {
    const supabase = createAdminClient();
    const normalizedTag = normalizeTagUid(tagUid);
    const { data, error } = await supabase.rpc("process_scan", {
      p_device_id: deviceId.trim(),
      p_tag_uid: normalizedTag,
      p_quantity: quantity,
    });

    if (error) {
      if (error.code === "22023") {
        return jsonResponse({ error: "invalid scan request" }, 400);
      }
      console.error("[scan] database transaction failed:", error.message);
      return jsonResponse({ error: "scan could not be processed" }, 500);
    }

    if (data?.result === "duplicate") {
      return jsonResponse({
        result: "duplicate",
        estimated_sell_date: null,
        display_lines: ["DUPLICATE SCAN", "Status: DUPLICATE"],
      });
    }
    if (data?.result === "unknown_tag") {
      return jsonResponse({
        result: "unknown_tag",
        estimated_sell_date: null,
        display_lines: ["UNKNOWN TAG", "Status: UNKNOWN"],
      });
    }
    if (data?.result !== "ok") {
      console.error("[scan] unexpected database response");
      return jsonResponse({ error: "unexpected scan result" }, 500);
    }

    const weight = Number(data.weight_kg);
    const weightDisplay = Number.isFinite(weight)
      ? String(Number(weight.toFixed(3)))
      : "unknown";
    return jsonResponse({
      result: "ok",
      batch_id: data.batch_id,
      product_id: data.product_id,
      product_name: data.product_name,
      category: data.category,
      weight_kg: weight,
      weight_is_simulated: true,
      quantity: data.quantity,
      simulated_mfg_date: data.simulated_mfg_date,
      simulated_expiry_date: data.simulated_expiry_date,
      expiry_is_simulated: true,
      estimated_sell_date: null,
      display_lines: [
        `Product: ${data.product_name}`,
        `Weight: ${weightDisplay} kg (SIMULATED)`,
        `Expiry: ${data.simulated_expiry_date} (SIMULATED)`,
        "Status: OK",
      ],
    });
  } catch (error) {
    console.error("[scan] unexpected failure:", error);
    return jsonResponse({ error: "scan could not be processed" }, 500);
  }
});
