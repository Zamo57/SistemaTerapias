import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const c = JSON.parse(readFileSync(".local/supabase-admin.json", "utf8")),
  accounts = JSON.parse(readFileSync(".local/test-accounts.json", "utf8"));
if (!["localhost", "127.0.0.1"].includes(new URL(c.url).hostname))
  throw new Error("Pruebas limitadas a Supabase local.");
const service = createClient(c.url, c.secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const account = (role: string) => accounts.find((a: any) => a.key === role);
test("archivos privados fuera del acceso HTTP del frontend", async ({
  request,
}) => {
  for (const path of [
    "/.local/supabase-admin.json",
    "/.local/test-accounts.json",
    "/.env.local",
    "/config/team.json",
  ]) {
    const response = await request.get(path);
    expect([403, 404]).toContain(response.status());
  }
});
async function client(role: string) {
  const result = createClient(c.url, c.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const a = account(role);
  const { error } = await result.auth.signInWithPassword({
    email: a.email,
    password: a.password,
  });
  expect(error).toBeNull();
  return result;
}
test("inactivación con JWT existente y restauración de acceso, sin borrar autoría", async () => {
  const admin = await client("admin"),
    reception = await client("reception");
  const user = account("reception");
  const { data: before, error: initial } = await reception
    .from("patients")
    .select("id");
  expect(initial).toBeNull();
  expect(before?.length).toBeGreaterThan(0);
  try {
    const { error } = await admin
      .from("profiles")
      .update({ active: false })
      .eq("id", user.id);
    expect(error).toBeNull();
    const { data: blocked } = await reception.from("patients").select("id");
    expect(blocked).toEqual([]);
    const { error: rpc } = await reception.rpc("create_visit", {
      p_patient: before![0].id,
      p_therapist: account("clinical").id,
      p_minutes: 60,
      p_rate: "Tarifa modificable",
      p_amount: 5700000,
      p_free: false,
      p_reason: "FICTICIO",
      p_therapies: [],
    });
    expect(rpc).not.toBeNull();
    const { data: authUser } = await service.auth.admin.getUserById(user.id);
    expect(authUser.user?.id).toBe(user.id);
    const { data: historical } = await service
      .from("visits")
      .select("created_by")
      .eq("created_by", user.id);
    expect(historical?.length).toBeGreaterThan(0);
  } finally {
    const { error } = await service
      .from("profiles")
      .update({ active: true })
      .eq("id", user.id);
    expect(error).toBeNull();
  }
  const { data: restored } = await reception.from("patients").select("id");
  expect(restored?.length).toBeGreaterThan(0);
});
test("dos conexiones concurrentes no exceden saldo y un reintento no duplica", async () => {
  const one = await client("reception"),
    two = await client("reception");
  const { data: patients } = await one.from("patients").select("id").limit(1),
    { data: therapies } = await one.from("therapies").select("id").limit(1);
  const { data: visit, error } = await one.rpc("create_visit", {
    p_patient: patients![0].id,
    p_therapist: account("clinical").id,
    p_minutes: 30,
    p_rate: "Tarifa modificable",
    p_amount: 1000000,
    p_free: false,
    p_reason: "CONCURRENCIA FICTICIA",
    p_therapies: [therapies![0].id],
  });
  expect(error).toBeNull();
  const args = {
    p_visit: visit,
    p_amount: 1000000,
    p_method: "Efectivo",
    p_confirmed: true,
    p_sinpe: null,
    p_reference: "PRUEBA FICTICIA",
  };
  const firstRequest = randomUUID();
  const results = await Promise.all([
    one.rpc("record_payment", { ...args, p_request: firstRequest }),
    two.rpc("record_payment", { ...args, p_request: randomUUID() }),
  ]);
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(results.filter((r) => !!r.error)).toHaveLength(1);
  const { data: payments } = await one
    .from("payments")
    .select("*")
    .eq("visit_id", visit);
  expect(payments).toHaveLength(1);
  expect(payments![0].amount).toBe(1000000);
  const { error: retry } = await two.rpc("record_payment", {
    ...args,
    p_request: payments![0].request_id,
  });
  expect(retry).toBeNull();
  expect(
    (await one.from("payments").select("id").eq("visit_id", visit)).data,
  ).toHaveLength(1);
});
test("invitación local autorizada, contraseña individual y recuperación en buzón de prueba", async ({
  page,
}) => {
  const admin = await client("admin"),
    reception = await client("reception");
  const email = `invitado-ficticio-${randomUUID()}@centro.example`,
    name = "Invitado FICTICIO";
  const body = {
    email,
    name,
    permissions: ["reception"],
    redirectTo: "http://localhost:5174",
  };
  const { error: denied } = await reception.functions.invoke("invite-user", {
    body,
  });
  expect(denied).not.toBeNull();
  const { data: invited, error } = await admin.functions.invoke("invite-user", {
    body,
  });
  expect(error).toBeNull();
  expect(invited.ok).toBe(true);
  const profile = (
    await service.from("profiles").select("id,permissions").eq("name", name)
  ).data;
  expect(profile?.length).toBeGreaterThan(0);
  let message: any;
  await expect
    .poll(async () => {
      const payload = await (
        await fetch("http://127.0.0.1:54324/api/v1/messages")
      ).json();
      message = payload.messages.find((m: any) =>
        m.To?.some((recipient: any) => recipient.Address === email),
      );
      return !!message;
    })
    .toBe(true);
  const detail = await (
    await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)
  ).json();
  const content = detail.HTML || detail.Text;
  const match = content.match(
    /https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/,
  );
  expect(match).not.toBeNull();
  const url = match![0].replaceAll("&amp;", "&");
  expect(new URL(url).hostname).toMatch(/localhost|127.0.0.1/);
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Definí tu contraseña" }),
  ).toBeVisible();
  const password = randomUUID() + randomUUID();
  await page.getByLabel("Nueva contraseña").fill(password);
  await page.getByLabel("Confirmar contraseña").fill(password);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible();
  // Capturador local, sin comprobar SMTP de un proveedor externo.
  const publicClient = createClient(c.url, c.publicKey, {
    auth: { persistSession: false },
  });
  const { error: recovery } = await publicClient.auth.resetPasswordForEmail(
    email,
    { redirectTo: "http://localhost:5174" },
  );
  expect(recovery).toBeNull();
  let recoveryMessage: any;
  await expect
    .poll(async () => {
      const payload = await (
        await fetch("http://127.0.0.1:54324/api/v1/messages")
      ).json();
      recoveryMessage = payload.messages.find(
        (m: any) =>
          m.ID !== message.ID && m.To?.some((r: any) => r.Address === email),
      );
      return !!recoveryMessage;
    })
    .toBe(true);
  const recoveryDetail = await (
    await fetch(`http://127.0.0.1:54324/api/v1/message/${recoveryMessage.ID}`)
  ).json();
  const recoveryMatch = (recoveryDetail.HTML || recoveryDetail.Text).match(
    /https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/,
  );
  expect(recoveryMatch).not.toBeNull();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page.goto(recoveryMatch![0].replaceAll("&amp;", "&"));
  await expect(
    page.getByRole("heading", { name: "Definí tu contraseña" }),
  ).toBeVisible();
  const newPassword = randomUUID() + randomUUID();
  await page.getByLabel("Nueva contraseña").fill(newPassword);
  await page.getByLabel("Confirmar contraseña").fill(newPassword);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible();
  const recovered = createClient(c.url, c.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await recovered.auth.signInWithPassword({ email, password: newPassword }))
      .error,
  ).toBeNull();
});
