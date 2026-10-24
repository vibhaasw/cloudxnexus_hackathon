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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const authError = authorizeApiKey(request, "register");
  if (authError) return authError;

  const body = await readJson(request);
  const tagUid = body?.tag_uid;
  if (!validIdentifier(tagUid, 128)) {
    return jsonResponse(
      { error: "tag_uid is required (1-128 characters)" },
      400,
    );
  }

  const productId = body?.product_id;
  const weight = body?.weight_kg;
  const type = body?.type;
  const byId = typeof productId === "string" && uuidPattern.test(productId);
  const byWeightAndType = typeof weight === "number" &&
    Number.isFinite(weight) && weight > 0 &&
    validIdentifier(type, 80);
  if (!byId && !byWeightAndType) {
    return jsonResponse({
      error: "provide product_id or both weight_kg and type",
    }, 400);
  }

  try {
    const supabase = createAdminClient();
    let productQuery = supabase.from("products")
      .select("id,name,category,weight_kg,shelf_life_days");
    if (byId) {
      productQuery = productQuery.eq("id", productId as string);
    } else {
      productQuery = productQuery.eq("weight_kg", weight as number);
    }

    const { data: product, error: lookupError } = await productQuery
      .maybeSingle();
    if (lookupError) {
      console.error(
        "[register-parcel] product lookup failed:",
        lookupError.message,
      );
      return jsonResponse({ error: "product lookup failed" }, 500);
    }
    if (!product) return jsonResponse({ error: "product not found" }, 404);
    if (!byId && product.name !== type && product.category !== type) {
      return jsonResponse({ error: "product not found" }, 404);
    }

    const normalizedTag = normalizeTagUid(tagUid);
    const { data, error } = await supabase.from("pending_parcels").insert({
      tag_uid: normalizedTag,
      product_id: product.id,
      weight_kg: product.weight_kg,
    }).select("id").single();

    if (error) {
      if (error.code === "23505") {
        return jsonResponse({ error: "tag already has a pending parcel" }, 409);
      }
      console.error("[register-parcel] insert failed:", error.message);
      return jsonResponse({ error: "parcel registration failed" }, 500);
    }
    return jsonResponse({ parcel_id: data.id }, 201);
  } catch (error) {
    console.error("[register-parcel] unexpected failure:", error);
    return jsonResponse({ error: "parcel registration failed" }, 500);
  }
});
