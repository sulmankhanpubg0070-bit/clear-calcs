import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { createResponsesCall } from "../_shared/responses.ts";
import { getLovableAiGatewayResponseHeaders } from "../_shared/run-id.ts";
import { hasAdminAccess, summaryInstructions } from "./policy.ts";
import { familyStore, verifyPassword } from "../_shared/mongo-store.ts";

const bodySchema = z.object({ password: z.string().min(1).max(1024), accessRestored: z.boolean().optional() }).strict();
const headers = { ...corsHeaders, "Content-Type": "application/json" };
const json = (message: string, status: number, blocked = false) => new Response(JSON.stringify({ message, blocked }), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json("Only POST requests are allowed.", 405);
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return json("A valid admin password is required.", 400);
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!url || !anonKey || !serviceKey || !apiKey) return json("AI summary connection is not configured.", 401);
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const mongo = await familyStore().catch(() => null);
    const saved = mongo ? await mongo.findOne({ _id: "family-tree" }) : null;
    const check = saved
      ? { data: await verifyPassword(parsed.data.password, saved.passwordHash), error: null }
      : await client.rpc("admin_check", { _password: parsed.data.password });
    if (!hasAdminAccess(check)) return json("Admin password is incorrect. Please log in again.", 403);
    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: pause, error: pauseError } = saved
      ? { data: saved.aiBlock, error: null }
      : await service.from("family_summary_ai_state").select("blocked_status,message").eq("id", 1).maybeSingle();
    if (pauseError) return json("Unable to check AI availability.", 500);
    if (pause && !parsed.data.accessRestored) return json(pause.message, pause.blocked_status, true);
    if (pause && parsed.data.accessRestored) {
      const { error } = mongo && saved
        ? await mongo.updateOne({ _id: saved._id }, { $set: { aiBlock: null } }).then(() => ({ error: null })).catch(() => ({ error: true }))
        : await service.from("family_summary_ai_state").delete().eq("id", 1);
      if (error) return json("Unable to resume AI summaries.", 500);
    }
    const { data: tree, error: treeError } = saved
      ? { data: { title: saved.title, members: saved.members }, error: null }
      : await client.from("site_data").select("title,members").eq("id", 1).single();
    if (treeError) return json("Unable to load the saved family tree.", 500);
    if (!Array.isArray(tree.members) || tree.members.length === 0) return json("Add family members before generating a summary.", 400);
    let upstreamFailure: { message: string; status: number; blocked: boolean } | undefined;
    // Capture safe gateway failures before the SDK turns them into a stream error.
    const gatewayFetch = globalThis.fetch;
    const request = new Request(req.url, { signal: req.signal });
    const { result, getRunId } = createResponsesCall(request, {
      baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra",
      fetch: async (input, init) => {
        const response = await gatewayFetch(input, init);
        if (!response.ok) {
          const payload = await response.clone().json().catch(() => ({}));
          const message = payload.message || payload.error?.message || `AI summary request failed (${response.status}).`;
          const blocked = response.status === 402 || response.status === 403;
          upstreamFailure = { message, status: response.status, blocked };
          if (blocked) {
            if (mongo && saved) await mongo.updateOne({ _id: saved._id }, { $set: { aiBlock: { blocked_status: response.status, message } } });
            else await service.from("family_summary_ai_state").upsert({ id: 1, blocked_status: response.status, message });
          }
        }
        return response;
      },
    }, [{ role: "user", content: JSON.stringify(tree) }], summaryInstructions);
    const iterator = result.fullStream[Symbol.asyncIterator]();
    // Resolve upstream errors before sending success headers; omit thinking from the summary.
    let firstText = "";
    while (!firstText) {
      const next = await iterator.next();
      if (next.done) return json("AI returned no summary. No result was saved.", 422);
      if (next.value.type === "error") {
        const failure = upstreamFailure;
        return json(failure?.message || "AI could not generate a summary.", failure?.status || 500, failure?.blocked);
      }
      if (next.value.type === "text-delta") firstText = next.value.text;
    }
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const emit = (value: unknown) => controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        emit({ text: firstText });
        try {
          for (;;) {
            const next = await iterator.next();
            if (next.done) break;
            if (next.value.type === "text-delta") emit({ text: next.value.text });
            if (next.value.type === "error") { emit({ message: upstreamFailure?.message || "AI summary was interrupted.", blocked: upstreamFailure?.blocked }); break; }
          }
          controller.close();
        } catch { emit({ message: "AI summary was interrupted." }); controller.close(); }
      },
      async cancel() { await iterator.return?.(); },
    });
    const streamHeaders = getLovableAiGatewayResponseHeaders(undefined, { ...corsHeaders, "Content-Type": "application/x-ndjson" });
    const runId = getRunId();
    if (runId) streamHeaders.set("X-Lovable-AIG-Run-ID", runId);
    return new Response(body, { headers: getLovableAiGatewayResponseHeaders(undefined, streamHeaders) });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return json("Summary stopped.", 499);
    return json("Unable to generate a family summary.", 500);
  }
});