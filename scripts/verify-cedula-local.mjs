import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
const remote = process.argv.includes("--remote");
const publicOrigin = process.env.VERIFY_PUBLIC_ORIGIN;
// Ejecutar fetch en el navegador público ejercita OPTIONS y CORS reales.
const browser = publicOrigin
  ? await (await import("@playwright/test")).chromium.launch()
  : null;
const page = browser ? await browser.newPage() : null;
if (page) await page.goto(publicOrigin);
const credentials = JSON.parse(
  await readFile(
    remote ? ".local/remote-admin.json" : ".local/supabase-admin.json",
    "utf8",
  ),
);
if (remote)
  assert.equal(credentials.url, "https://onyonqjatljkbytdxjmz.supabase.co");
else
  assert.ok(
    ["127.0.0.1", "localhost"].includes(new URL(credentials.url).hostname),
  );
const accounts = remote
  ? []
  : JSON.parse(await readFile(".local/test-accounts.json", "utf8"));
const settings = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(credentials.url, credentials.secret, settings);
const clients = [];
const ok = (r) => {
  if (r.error) throw Error(r.error.message);
  return r.data;
};
// Exclusivamente caché ficticia local. Esta prueba nunca consume GoMeta.
const cedula = "000000000";
assert.equal(
  ok(await service.from("cedula_cache").select("cedula").eq("cedula", cedula))
    .length,
  0,
);
const quotaBefore = ok(await service.from("cedula_usage").select("*"));
let createdPatient;
try {
  if (remote) {
    for (const [role, permissions] of [
      ["reception", ["reception", "finance"]],
      ["clinical", ["clinical"]],
      ["admin", ["admin"]],
    ]) {
      const email = `${role}.${randomUUID()}@verificacion.example`,
        password = randomBytes(24).toString("base64url");
      const user = ok(
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
      ).user;
      accounts.push({ id: user.id, email, password });
      ok(
        await service.from("profiles").insert({
          id: user.id,
          name: "FICTICIO VERIFICACIÓN GOMETA",
          permissions,
        }),
      );
    }
    createdPatient = randomUUID();
    ok(
      await service.from("patients").insert({
        id: createdPatient,
        document_type: "Cédula",
        document: "000000001",
        name: "PACIENTE FICTICIO VERIFICACIÓN",
        created_by: accounts[0].id,
      }),
    );
  }
  for (const account of accounts) {
    const client = createClient(
      credentials.url,
      credentials.publicKey,
      settings,
    );
    const auth = ok(
      await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      }),
    );
    clients.push({ client, token: auth.session.access_token, id: account.id });
  }
  ok(
    await service.from("cedula_cache").insert({
      cedula,
      nombre: "PERSONA FICTICIA",
      primer_apellido: "EJEMPLO",
      segundo_apellido: "PRUEBA",
      fuente: "GoMeta",
    }),
  );
  const request = async (id, token) => {
    const url = process.argv.includes("--via-app")
      ? `http://localhost:5174/api/cedula/${id}`
      : `${credentials.url}/functions/v1/cedula/${id}`;
    const headers = {
      apikey: credentials.publicKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (!page) return fetch(url, { headers });
    const result = await page.evaluate(
      async ({ url, headers }) => {
        const response = await fetch(url, { headers });
        return {
          status: response.status,
          body: await response.text(),
          source: response.headers.get("X-Consulta-Origen"),
        };
      },
      { url, headers },
    );
    return new Response(result.body, {
      status: result.status,
      headers: result.source ? { "X-Consulta-Origen": result.source } : {},
    });
  };
  assert.equal((await request("abc")).status, 400);
  assert.equal((await request(cedula)).status, 401);
  assert.equal((await request(cedula, "jwt-ficticio-invalido")).status, 401);
  for (const account of clients) {
    const response = await request(cedula, account.token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Consulta-Origen"), "cache");
    assert.equal((await response.json()).nombre, "PERSONA FICTICIA");
    assert.ok((await account.client.from("cedula_cache").select("*")).error);
    assert.ok(
      (await account.client.rpc("cedula_user_limit", { p_user: account.id }))
        .error,
    );
  }
  const existing = ok(
    await clients[0].client
      .from("patients")
      .select("document,id")
      .eq("document_type", "Cédula")
      .limit(1),
  )[0];
  assert.ok(existing);
  assert.equal(
    (await request(existing.document, clients[0].token)).status,
    409,
  );
  const externalBefore = quotaBefore.filter(
    (x) => x.kind === "external",
  ).length;
  assert.equal(
    ok(await service.from("cedula_usage").select("*").eq("kind", "external"))
      .length,
    externalBefore,
  );
  if (page && remote) {
    const { expect } = await import("@playwright/test");
    await page
      .getByLabel("Correo electrónico", { exact: true })
      .fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page
      .getByRole("button", { name: "Nuevo paciente", exact: true })
      .click();
    await page.getByLabel("Número de identificación").fill(cedula);
    await expect(page.getByRole("dialog").getByRole("status")).toContainText(
      "Datos de caché",
      { timeout: 15000 },
    );
    await expect(page.getByLabel("Nombre (y otros nombres)")).toHaveValue(
      "PERSONA FICTICIA",
    );
    await page.getByLabel("Primer apellido").fill("CORRECCIÓN FICTICIA");
    await expect(page.getByLabel("Primer apellido")).toHaveValue(
      "CORRECCIÓN FICTICIA",
    );
    // No pulsar Guardar: encontrar una identidad no debe crear un paciente.
    console.log(
      "APROBADO: formulario público real, sesión ficticia, autocompletado desde caché y campos editables sin guardar.",
    );
  }
  if (remote) {
    ok(await service.from("profiles").update({active: false}).eq("id", accounts[0].id));
    assert.equal((await request(cedula, clients[0].token)).status, 403);
    console.log("APROBADO: sesión inválida rechazada (401) y usuario inactivo rechazado (403).");
  }
  console.log(
    `APROBADO: Edge Function ${remote ? "remota" : "local"}, sesión real, cache privada, paciente existente, validación y cero llamadas externas.`,
  );
} finally {
  await browser?.close();
  ok(await service.from("cedula_cache").delete().eq("cedula", cedula));
  const beforeIds = quotaBefore.map((x) => x.id);
  const newEvents = ok(
    await service
      .from("cedula_usage")
      .select("id")
      .in(
        "user_id",
        clients.map((x) => x.id),
      ),
  )
    .filter((x) => !beforeIds.includes(x.id))
    .map((x) => x.id);
  if (newEvents.length)
    ok(await service.from("cedula_usage").delete().in("id", newEvents));
  for (const { client } of clients) await client.auth.signOut();
  if (remote) {
    if (createdPatient) {
      ok(await service.from("patients").delete().eq("id", createdPatient));
      ok(await service.from("audit").delete().eq("record_id", createdPatient));
    }
    for (const account of accounts) {
      ok(await service.from("audit").delete().eq("record_id", account.id));
      ok(await service.from("profiles").delete().eq("id", account.id));
      ok(await service.auth.admin.deleteUser(account.id));
    }
    console.log("LIMPIEZA: identidades y paciente propios eliminados.");
  }
}
