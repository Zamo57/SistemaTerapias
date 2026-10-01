import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { money, net, periodBounds } from "../src/domain";
const credentials = JSON.parse(
  readFileSync(".local/supabase-admin.json", "utf8"),
);
const accounts = JSON.parse(readFileSync(".local/test-accounts.json", "utf8"));
// Pruebas ficticias: impedir cualquier consulta real de identificación externa.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/cedula/**", (route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
});
if (!["localhost", "127.0.0.1"].includes(new URL(credentials.url).hostname))
  throw new Error("Las pruebas conectadas solo aceptan Supabase local.");
const service = createClient(credentials.url, credentials.secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const account = (role: string) => accounts.find((a: any) => a.key === role);
async function client(role: string) {
  const c = createClient(credentials.url, credentials.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const a = account(role);
  const { error } = await c.auth.signInWithPassword({
    email: a.email,
    password: a.password,
  });
  expect(error).toBeNull();
  return c;
}
async function login(page: Page, role: string) {
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill(account(role).email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(account(role).password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible();
  await expect(
    page.getByText("Registros persistentes en Supabase", { exact: false }),
  ).toBeVisible();
}
async function checkQuery(
  c: SupabaseClient,
  table: string,
  filters: Record<string, string> = {},
) {
  let q = c.from(table).select("*");
  for (const [key, value] of Object.entries(filters)) q = q.eq(key, value);
  const { data, error } = await q;
  expect(error).toBeNull();
  return data!;
}
test("flujo real: paciente, atención, historial, temporizador recargado, pago y reporte", async ({
  page,
}) => {
  const recep = await client("reception"),
    clinical = await client("clinical");
  const suffix = Date.now().toString().slice(-8),
    doc = "8" + suffix,
    name = `Paciente FICTICIO E2E ${suffix}`;
  await login(page, "reception");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Pacientes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nuevo paciente", exact: true })
    .click();
  await page.getByLabel("Número de identificación").fill(doc);
  await page.getByLabel("Nombre (y otros nombres)").fill(name);
  await page
    .getByRole("button", { name: "Guardar paciente", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const patient = (await checkQuery(recep, "patients", { document: doc }))[0];
  expect(patient.created_by).toBe(account("reception").id);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Pacientes", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Buscar paciente" }).fill(doc);
  await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByRole("button", { name: "Nueva atención", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Profesional que realizará la terapia")
    .selectOption(account("clinical").id);
  await modal
    .getByRole("button", { name: "Terapia manual · FICTICIO", exact: true })
    .click();
  await modal.getByLabel("Modalidad de tarifa").selectOption("Tarifa 1");
  await expect(modal).toContainText("57");
  await modal
    .getByRole("button", { name: "Guardar atención", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  let visit = (
    await checkQuery(recep, "visits", { patient_id: patient.id })
  )[0];
  expect(visit.amount).toBe(5700000);
  expect(visit.therapist_id).toBe(account("clinical").id);
  expect(visit.created_by).toBe(account("reception").id);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Atenciones", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("button", { name: "Iniciar", exact: true }).click();
  await expect(
    page.locator(".timer-card").filter({ hasText: name }),
  ).toBeVisible();
  visit = (await checkQuery(recep, "visits", { id: visit.id }))[0];
  const started = visit.started_at;
  await page.waitForTimeout(2200);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible();
  const card = page.locator(".timer-card").filter({ hasText: name });
  await expect(card).toBeVisible();
  await expect(card.locator(".timer")).not.toHaveText("60:00");
  expect(
    (await checkQuery(recep, "visits", { id: visit.id }))[0].started_at,
  ).toBe(started);
  await card.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(card).toContainText("En pausa");
  await page.reload();
  await expect(
    page.locator(".timer-card").filter({ hasText: name }),
  ).toContainText("En pausa");
  await page
    .locator(".timer-card")
    .filter({ hasText: name })
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await expect(
    page.locator(".timer-card").filter({ hasText: name }),
  ).toContainText("En curso");
  await page
    .locator(".timer-card")
    .filter({ hasText: name })
    .getByRole("button", { name: "Finalizar", exact: true })
    .click();
  await expect(
    page.locator(".timer-card").filter({ hasText: name }),
  ).not.toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Pacientes", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Buscar paciente" }).fill(doc);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Historial de atenciones" }),
  ).toBeVisible();
  await expect(page.getByText("1 sesiones finalizadas")).toBeVisible();
  const { error: noteError } = await clinical.rpc("save_note", {
    p_visit: visit.id,
    p_revision: 0,
    p_motive: "MOTIVO FICTICIO",
    p_symptoms: "SÍNTOMAS FICTICIOS",
    p_body: "NOTA CLÍNICA FICTICIA E2E",
    p_evolution: "RESPUESTA FICTICIA",
    p_finalized: true,
    p_reason: null,
  });
  expect(noteError).toBeNull();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reportes", exact: true })
    .click();
  const before = await page
    .locator(".metric")
    .filter({ hasText: "Cobros netos" })
    .innerText();
  const bounds = periodBounds();
  const beforeAmount = net(
    await checkQuery(recep, "payments"),
    bounds.month,
    bounds.today,
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Cobros", exact: true })
    .click();
  await page
    .locator(".payment-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Registrar pago", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar pago", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const payments = await checkQuery(recep, "payments", { visit_id: visit.id });
  expect(payments).toHaveLength(1);
  expect(payments[0].amount).toBe(5700000);
  expect(payments[0].received_by).toBe(account("reception").id);
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Cobros", exact: true })
    .click();
  await expect(
    page.locator(".payment-row").filter({ hasText: name }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reportes", exact: true })
    .click();
  expect(
    await page
      .locator(".metric")
      .filter({ hasText: "Cobros netos" })
      .innerText(),
  ).not.toBe(before);
  await expect(
    page.locator(".metric").filter({ hasText: "Cobros netos" }),
  ).toContainText(money(beforeAmount + 5700000));
  const reportRow = page
    .getByRole("row")
    .filter({ hasText: "Recepción · FICTICIO" });
  await expect(reportRow.first()).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await login(page, "clinical");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Pacientes", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Buscar paciente" }).fill(doc);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByText("NOTA CLÍNICA FICTICIA E2E", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Corregir nota", exact: true })
    .click();
  await page
    .getByLabel("Motivo de corrección (obligatorio)")
    .fill("CORRECCIÓN FICTICIA de ensayo");
  await page
    .getByLabel("Notas y observaciones")
    .fill("NOTA CLÍNICA FICTICIA CORREGIDA DESDE NAVEGADOR");
  await page
    .getByRole("button", { name: "Guardar corrección", exact: true })
    .click();
  await expect(
    page.getByText("Nota finalizada y guardada", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Pacientes", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Buscar paciente" }).fill(doc);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByText("NOTA CLÍNICA FICTICIA CORREGIDA DESDE NAVEGADOR", {
      exact: true,
    }),
  ).toBeVisible();
  const notes = await checkQuery(clinical, "notes", { visit_id: visit.id });
  expect(notes).toHaveLength(2);
  expect(notes.every((n) => n.author_id === account("clinical").id)).toBe(true);
});
test("RLS real: clínica, recepción y administración; signup público bloqueado", async () => {
  const reception = await client("reception"),
    clinical = await client("clinical"),
    admin = await client("admin");
  expect((await checkQuery(reception, "notes")).length).toBe(0);
  expect((await checkQuery(admin, "notes")).length).toBe(0);
  expect((await checkQuery(clinical, "notes")).length).toBeGreaterThan(0);
  expect((await checkQuery(clinical, "payments")).length).toBe(0);
  const { data: snapshot, error: snapshotError } =
    await admin.rpc("workspace_snapshot");
  expect(snapshotError).toBeNull();
  expect(snapshot.notes).toEqual([]);
  expect(snapshot.backgrounds).toEqual([]);
  const visit = (await checkQuery(reception, "visits"))[0];
  const { error: denied } = await reception.rpc("save_note", {
    p_visit: visit.id,
    p_revision: 0,
    p_motive: "",
    p_symptoms: "",
    p_body: "INTENTO FICTICIO",
    p_evolution: "",
    p_finalized: false,
    p_reason: null,
  });
  expect(denied).not.toBeNull();
  const { error: direct } = await reception
    .from("payments")
    .update({ amount: 1 })
    .eq("visit_id", visit.id);
  expect(direct).not.toBeNull();
  const anonymous = createClient(credentials.url, credentials.publicKey, {
    auth: { persistSession: false },
  });
  const { error: signup } = await anonymous.auth.signUp({
    email: `bloqueado-${randomUUID()}@centro.example`,
    password: randomUUID(),
  });
  expect(signup).not.toBeNull();
  expect(signup?.message.toLowerCase()).toContain("signup");
  const { data: profiles } = await admin.from("profiles").select("*");
  expect(
    profiles?.filter((p) => accounts.some((a: any) => a.id === p.id)),
  ).toHaveLength(3);
});
test("tarifas y abonos reales: SINPE pendiente, idempotencia y confirmación", async () => {
  const reception = await client("reception");
  const patient = (await checkQuery(reception, "patients"))[0],
    therapy = (await checkQuery(reception, "therapies"))[0],
    sinpe = (await checkQuery(reception, "sinpe_numbers"))[0];
  for (const [rate, minutes, amount] of [
    ["Tarifa 2", 30, 3300000],
    ["Tarifa modificable", 60, 5700000],
  ] as const) {
    const { data: id, error } = await reception.rpc("create_visit", {
      p_patient: patient.id,
      p_therapist: account("clinical").id,
      p_minutes: minutes,
      p_rate: rate,
      p_amount: amount,
      p_free: false,
      p_reason: "Importe FICTICIO de prueba",
      p_therapies: [therapy.id],
    });
    expect(error).toBeNull();
    const request = randomUUID();
    const args = {
      p_request: request,
      p_visit: id,
      p_amount: 1000000,
      p_method: "Efectivo",
      p_confirmed: true,
      p_sinpe: null,
      p_reference: null,
    };
    expect((await reception.rpc("record_payment", args)).error).toBeNull();
    expect((await reception.rpc("record_payment", args)).error).toBeNull();
    expect(
      await checkQuery(reception, "payments", { visit_id: id }),
    ).toHaveLength(1);
    const { data: pending, error: pendingError } = await reception.rpc(
      "record_payment",
      {
        p_request: randomUUID(),
        p_visit: id,
        p_amount: amount - 1000000,
        p_method: "SINPE",
        p_confirmed: false,
        p_sinpe: sinpe.id,
        p_reference: "FICTICIO-SIN-BANCO",
      },
    );
    expect(pendingError).toBeNull();
    let payments = await checkQuery(reception, "payments", { visit_id: id });
    expect(
      payments
        .filter((p) => p.status === "confirmed")
        .reduce((n, p) => n + p.amount, 0),
    ).toBe(1000000);
    expect(
      (await reception.rpc("confirm_payment", { p_id: pending })).error,
    ).toBeNull();
    payments = await checkQuery(reception, "payments", { visit_id: id });
    expect(
      payments
        .filter((p) => p.status === "confirmed")
        .reduce((n, p) => n + p.amount, 0),
    ).toBe(amount);
  }
});
