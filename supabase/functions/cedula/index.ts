import { createClient } from "npm:@supabase/supabase-js@2";
import { lookupGoMeta, LookupError } from "../_shared/cedula.ts";
// En producción el origen debe ser explícito; el entorno local lo inyecta
// mediante supabase/functions/.env.local.
const origin = Deno.env.get("APP_ORIGIN") || "";
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Expose-Headers": "X-Consulta-Origen",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200, retry = 0, source?: string) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...headers,
        ...(retry ? { "Retry-After": String(retry) } : {}),
        ...(source ? { "X-Consulta-Origen": source } : {}),
      },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET") return reply({ error: "invalid" }, 405);
  const cedula = new URL(req.url).pathname.split("/").pop() || "";
  if (!/^[0-9]{9}$/.test(cedula)) return reply({ error: "invalid" }, 400);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      },
    },
  );
  try {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user) return reply({ error: "unauthorized" }, 401);
    const { data: staff, error: permissionError } = await client.rpc("staff");
    if (permissionError || !staff) return reply({ error: "forbidden" }, 403);
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const quota = await service.rpc("cedula_user_limit", { p_user: user.id });
    if (quota.error) throw new LookupError("unavailable");
    if (!quota.data) return reply({ error: "limited" }, 429, 60);
    // La búsqueda interna utiliza RLS del usuario; jamás service_role para expedientes.
    const existing = await client
      .from("patients")
      .select("id")
      .eq("document_type", "Cédula")
      .eq("document", cedula)
      .maybeSingle();
    if (existing.error) throw new LookupError("unavailable");
    if (existing.data)
      return reply({ existing_patient_id: existing.data.id }, 409);
    let source: "cache" | "GoMeta" | undefined;
    const result = await lookupGoMeta(
      cedula,
      {
        async reserve(c, t, poll) {
          const { data, error } = await service.rpc("cedula_reserve", {
            p_cedula: c,
            p_user: user.id,
            p_token: t,
            p_poll: poll,
          });
          if (error) throw new LookupError("unavailable");
          return data;
        },
        async finish(c, t, status, data, retry) {
          const { error } = await service.rpc("cedula_finish", {
            p_cedula: c,
            p_token: t,
            p_status: status,
            p_data: data || null,
            p_retry: retry || 300,
          });
          if (error) throw new LookupError("unavailable");
        },
      },
      {
        log: (event) => console.log(JSON.stringify(event)),
        onSource: (value) => {
          source = value;
        },
      },
    );
    return reply(result, 200, 0, source);
  } catch (e) {
    const error = e instanceof LookupError ? e : new LookupError("unavailable");
    return reply(
      { error: error.code },
      error.code === "limited"
        ? 429
        : error.code === "not_found"
          ? 404
          : error.code === "forbidden"
            ? 403
            : 503,
      error.retry,
    );
  }
});
