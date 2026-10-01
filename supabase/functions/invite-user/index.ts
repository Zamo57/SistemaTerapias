import { createClient } from "npm:@supabase/supabase-js@2";
const origin = Deno.env.get("APP_ORIGIN")!;
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Content-Type": "application/json",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return new Response("{}", { status: 405, headers });
  const publicClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      },
    },
  );
  const {
    data: { user },
    error: authError,
  } = await publicClient.auth.getUser();
  if (authError || !user)
    return new Response('{"error":"No autorizado"}', { status: 401, headers });
  const { data: allowed } = await publicClient.rpc("allowed", { p: "admin" });
  if (!allowed)
    return new Response('{"error":"Sin permiso administrativo"}', {
      status: 403,
      headers,
    });
  try {
    const body = await req.json();
    const permissions = body.permissions;
    if (
      typeof body.email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(body.email) ||
      typeof body.name !== "string" ||
      body.name.trim().length < 2 ||
      !Array.isArray(permissions) ||
      permissions.some(
        (p: string) =>
          !["admin", "clinical", "finance", "reception"].includes(p),
      )
    )
      throw new Error("Entrada inválida");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      body.email,
      { redirectTo: origin },
    );
    if (error) throw error;
    const { error: profileError } = await admin
      .from("profiles")
      .insert({
        id: data.user.id,
        name: body.name.trim(),
        permissions,
        active: true,
      });
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw profileError;
    }
    return new Response('{"ok":true}', { headers });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "invite_user_failed",
        code: (error as { code?: string }).code || "unexpected",
        type: (error as Error).name,
      }),
    );
    return new Response(
      '{"error":"No se pudo invitar; verificá el correo y configuración"}',
      { status: 400, headers },
    );
  }
});
