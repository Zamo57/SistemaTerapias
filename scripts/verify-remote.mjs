import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";

// Solo ejecución explícita sobre el proyecto autorizado. No importa fixtures locales.
if (!process.argv.includes("--execute"))
  throw Error("Usar --execute para crear y limpiar registros remotos propios.");
const credentials = JSON.parse(
  await readFile(".local/remote-admin.json", "utf8"),
);
assert.equal(credentials.url, "https://onyonqjatljkbytdxjmz.supabase.co");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(credentials.url, credentials.secret, options);
const run = randomUUID();
const patientId = randomUUID(),
  therapyId = randomUUID();
const accounts = [];
let visitId, browser;
const ok = (result) => {
  if (result.error) throw Error(result.error.message);
  return result.data;
};
const sql = (query) => {
  const output = execFileSync(
    "node",
    [
      "node_modules/supabase/dist/supabase.js",
      "db",
      "query",
      "--project-ref",
      "onyonqjatljkbytdxjmz",
      query,
      "--output",
      "json",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(output).rows;
};
try {
  for (const [role, permissions] of [
    ["admin", ["admin"]],
    ["clinical", ["clinical"]],
    ["reception", ["reception", "finance"]],
  ]) {
    const email = `${role}.${run}@verificacion.example`;
    const password = randomBytes(24).toString("base64url");
    const user = ok(
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    ).user;
    accounts.push({ id: user.id, role, email, password });
    ok(
      await service
        .from("profiles")
        .insert({
          id: user.id,
          name: `FICTICIO VERIFICACIÓN ${role} ${run}`,
          permissions,
        }),
    );
    const client = createClient(
      credentials.url,
      credentials.publicKey,
      options,
    );
    ok(await client.auth.signInWithPassword({ email, password }));
    accounts.at(-1).client = client;
  }
  const reception = accounts.find((a) => a.role === "reception");
  const clinical = accounts.find((a) => a.role === "clinical");
  const admin = accounts.find((a) => a.role === "admin");
  const anonymous = createClient(
    credentials.url,
    credentials.publicKey,
    options,
  );
  assert.ok(
    (
      await anonymous.auth.signUp({
        email: `signup.${run}@verificacion.example`,
        password: randomBytes(24).toString("hex"),
      })
    ).error,
  );
  ok(
    await service
      .from("therapies")
      .insert({ id: therapyId, name: `FICTICIO VERIFICACIÓN ${run}` }),
  );
  const name = `PACIENTE FICTICIO VERIFICACIÓN ${run}`;
  const document = `PRUEBA${run.replaceAll("-", "").toUpperCase()}`;
  ok(
    await reception.client
      .from("patients")
      .insert({
        id: patientId,
        document_type: "Pasaporte",
        document,
        name,
        source: `Verificación remota ${run}`,
      }),
  );
  ok(
    await clinical.client
      .from("backgrounds")
      .insert({
        patient_id: patientId,
        body: "ANTECEDENTE FICTICIO DE PRUEBA",
      }),
  );
  visitId = ok(
    await reception.client.rpc("create_visit", {
      p_patient: patientId,
      p_therapist: clinical.id,
      p_minutes: 60,
      p_rate: "Tarifa modificable",
      p_amount: 5700000,
      p_free: false,
      p_reason: "PRUEBA FICTICIA",
      p_therapies: [therapyId],
    }),
  );
  ok(
    await reception.client.rpc("timer_action", {
      p_visit: visitId,
      p_version: 1,
      p_action: "start",
    }),
  );
  ok(
    await clinical.client.rpc("save_note", {
      p_visit: visitId,
      p_revision: 0,
      p_motive: "FICTICIO",
      p_symptoms: "FICTICIO",
      p_body: "NOTA FICTICIA VERIFICACIÓN",
      p_evolution: "FICTICIO",
      p_finalized: true,
      p_reason: null,
    }),
  );
  for (const account of [reception, admin]) {
    assert.equal(
      ok(await account.client.from("notes").select("*").eq("visit_id", visitId))
        .length,
      0,
    );
    assert.equal(
      ok(
        await account.client
          .from("backgrounds")
          .select("*")
          .eq("patient_id", patientId),
      ).length,
      0,
    );
    assert.equal(
      ok(await account.client.rpc("workspace_snapshot")).notes.length,
      0,
    );
  }
  assert.equal(
    ok(await clinical.client.from("notes").select("*").eq("visit_id", visitId))
      .length,
    1,
  );
  assert.equal(
    ok(
      await clinical.client
        .from("payments")
        .select("*")
        .eq("visit_id", visitId),
    ).length,
    0,
  );
  assert.ok(
    (
      await reception.client.rpc("save_note", {
        p_visit: visitId,
        p_revision: 1,
        p_motive: "",
        p_symptoms: "",
        p_body: "",
        p_evolution: "",
        p_finalized: true,
        p_reason: "PRUEBA",
      })
    ).error,
  );
  assert.ok(
    (
      await reception.client
        .from("payments")
        .insert({
          visit_id: visitId,
          request_id: randomUUID(),
          amount: 100,
          method: "Efectivo",
          status: "confirmed",
        })
    ).error,
  );
  assert.equal(
    ok(await anonymous.from("patients").select("*").eq("id", patientId)).length,
    0,
  );

  browser = await chromium.launch();
  const page = await browser.newPage();
  const hosts = new Set();
  page.on("request", (req) => {
    if (req.url().includes(".supabase.co"))
      hosts.add(new URL(req.url()).hostname);
  });
  await page.goto("http://localhost:5174");
  await page.getByLabel("Correo electrónico").fill(reception.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(reception.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.locator(".timer-card").filter({ hasText: name }),
  ).toBeVisible();
  const started = ok(
    await reception.client
      .from("visits")
      .select("*")
      .eq("id", visitId)
      .single(),
  ).started_at;
  await page.waitForTimeout(2200);
  await page.reload();
  await expect(
    page.locator(".timer-card").filter({ hasText: name }),
  ).toBeVisible({ timeout: 30000 });
  assert.equal(
    ok(
      await reception.client
        .from("visits")
        .select("*")
        .eq("id", visitId)
        .single(),
    ).started_at,
    started,
  );
  await expect(
    page.locator(".timer-card").filter({ hasText: name }).locator(".timer"),
  ).not.toHaveText("60:00");
  let visit = ok(
    await reception.client
      .from("visits")
      .select("*")
      .eq("id", visitId)
      .single(),
  );
  assert.equal(visit.created_by, reception.id);
  assert.equal(visit.therapist_id, clinical.id);
  ok(
    await reception.client.rpc("timer_action", {
      p_visit: visitId,
      p_version: visit.version,
      p_action: "finish",
    }),
  );
  const request = randomUUID();
  const paymentArgs = {
    p_request: request,
    p_visit: visitId,
    p_amount: 5700000,
    p_method: "Efectivo",
    p_confirmed: true,
    p_sinpe: null,
    p_reference: "FICTICIO VERIFICACIÓN",
    p_original: null,
    p_reason: null,
  };
  const paymentId = ok(
    await reception.client.rpc("record_payment", paymentArgs),
  );
  assert.equal(
    ok(await reception.client.rpc("record_payment", paymentArgs)),
    paymentId,
  );
  const snapshot = ok(await reception.client.rpc("workspace_snapshot"));
  const payments = snapshot.payments.filter((p) => p.visit_id === visitId);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 5700000);
  assert.equal(payments[0].status, "confirmed");
  assert.equal(
    ok(
      await clinical.client
        .from("payments")
        .select("*")
        .eq("visit_id", visitId),
    ).length,
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Pacientes", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Buscar paciente" }).fill(document);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Historial de atenciones" }),
  ).toBeVisible();
  await expect(page.getByText("1 sesiones finalizadas")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reportes", exact: true })
    .click();
  await expect(
    page.locator(".metric").filter({ hasText: "Cobros netos" }),
  ).toContainText("57");
  assert.deepEqual([...hosts], ["onyonqjatljkbytdxjmz.supabase.co"]);
  const response = await reception.client.functions.invoke("invite-user", {
    body: {},
  });
  assert.ok(response.error);
  assert.equal(response.error.context.status, 403);
  const invalidInvite = await admin.client.functions.invoke("invite-user", {
    body: {},
  });
  assert.ok(invalidInvite.error);
  assert.equal(invalidInvite.error.context.status, 400);
  console.log(
    "APROBADO: navegador remoto, login, recarga, historial, temporizador, pago idempotente, reporte, RLS por tres roles, signup bloqueado y autorización de Edge Function.",
  );
} finally {
  await browser?.close();
  // UUID propios únicamente; transacción. Nunca borrado global ni por etiqueta amplia.
  const userIds = accounts.map((a) => `'${a.id}'`).join(",");
  const statements = ["begin;"];
  if (visitId)
    for (const table of [
      "payments",
      "notes",
      "timer_events",
      "visit_therapies",
    ])
      statements.push(
        `delete from public.${table} where visit_id='${visitId}';`,
      );
  if (visitId)
    statements.push(`delete from public.visits where id='${visitId}';`);
  statements.push(
    `delete from public.backgrounds where patient_id='${patientId}';`,
    `delete from public.patients where id='${patientId}';`,
    `delete from public.therapies where id='${therapyId}';`,
  );
  if (userIds)
    statements.push(
      `delete from public.audit where actor_id in (${userIds}) or (table_name='profiles' and record_id in (${userIds})) or (table_name='therapies' and record_id='${therapyId}');`,
      `delete from public.profiles where id in (${userIds});`,
    );
  statements.push("commit;");
  await writeFile(".local/remote-cleanup.sql", statements.join("\n"));
  sql(statements.join("\n"));
  for (const account of accounts)
    ok(await service.auth.admin.deleteUser(account.id));
  assert.equal(
    ok(await service.from("patients").select("id").eq("id", patientId)).length,
    0,
  );
  console.log(
    "LIMPIEZA APROBADA: registros propios y tres cuentas temporales eliminados.",
  );
}
