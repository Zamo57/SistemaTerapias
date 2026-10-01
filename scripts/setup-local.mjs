import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Solo localhost: nunca crea usuarios de prueba en un proyecto externo.
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const statusResult = spawnSync(command, ["supabase", "status", "-o", "json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  windowsHide: true,
});
if (statusResult.status !== 0)
  throw new Error("Supabase local no está listo. Ejecutá npm run local:start.");
const status = JSON.parse(statusResult.stdout);
const url = status.API_URL,
  publicKey = status.ANON_KEY || status.PUBLISHABLE_KEY,
  secret = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (
  !url ||
  !publicKey ||
  !secret ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
)
  throw new Error(
    "Se requieren credenciales de Supabase local; se rechaza cualquier servidor externo.",
  );
const env = `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${publicKey}\nVITE_ENVIRONMENT_LABEL=Prueba local · solo datos ficticios\n`;
let existing = "";
try {
  existing = await readFile(".env.local", "utf8");
} catch {}
if (existing && !existing.includes(url))
  throw new Error(
    ".env.local apunta a otro entorno. Conservá ese archivo y configurá conscientemente el entorno local.",
  );
await mkdir(".local", { recursive: true });
await writeFile(".env.local", env);
await writeFile(
  "supabase/functions/.env.local",
  "APP_ORIGIN=http://localhost:5174\n",
);
await writeFile(
  ".local/supabase-admin.json",
  JSON.stringify({ url, publicKey, secret }),
);
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let previous = [];
try {
  previous = JSON.parse(await readFile(".local/test-accounts.json", "utf8"));
} catch {}
const definitions = [
  {
    key: "admin",
    name: "Administración · FICTICIO",
    email: "admin.prueba@centro.example",
    permissions: ["admin"],
  },
  {
    key: "clinical",
    name: "Terapeuta · FICTICIO",
    email: "terapeuta.prueba@centro.example",
    permissions: ["clinical"],
  },
  {
    key: "reception",
    name: "Recepción · FICTICIO",
    email: "recepcion.prueba@centro.example",
    permissions: ["reception", "finance"],
  },
];
const { data: list, error: listError } = await admin.auth.admin.listUsers({
  perPage: 1000,
});
if (listError) throw new Error("No se pudo consultar Auth local.");
const accounts = [];
for (const definition of definitions) {
  let account = previous.find((a) => a.email === definition.email);
  let user = list.users.find((u) => u.email === definition.email);
  if (!user) {
    account = {
      ...definition,
      password: randomBytes(20).toString("base64url"),
    };
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });
    if (error)
      throw new Error(`No se pudo crear la cuenta ficticia ${definition.key}.`);
    user = data.user;
  }
  if (!account)
    throw new Error(
      `Ya existe la cuenta ${definition.key} y su contraseña no está en .local/test-accounts.json. Recuperala localmente; no se sustituye automáticamente.`,
    );
  const { data: profile, error: readError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (readError)
    throw new Error("No se pudo consultar perfil; revisá las migraciones.");
  if (!profile) {
    const { error } = await admin
      .from("profiles")
      .insert({
        id: user.id,
        name: definition.name,
        permissions: definition.permissions,
      });
    if (error) throw new Error("No se pudo crear el perfil ficticio.");
  }
  accounts.push({ ...definition, id: user.id, password: account.password });
}
await writeFile(".local/test-accounts.json", JSON.stringify(accounts, null, 2));
const { data: therapies, error: therapyError } = await admin
  .from("therapies")
  .select("id,name");
if (therapyError) throw new Error("No se pudo consultar catálogo.");
if (!therapies.some((t) => t.name === "Terapia manual · FICTICIO")) {
  const { error } = await admin
    .from("therapies")
    .insert({ name: "Terapia manual · FICTICIO" });
  if (error) throw new Error("No se pudo configurar terapia ficticia.");
}
// Precios únicamente de ensayo, separados de cualquier dato del negocio.
for (const [id, prices] of [
  [1, { 30: 3100000, 60: 5700000 }],
  [2, { 30: 3300000, 60: 6100000 }],
]) {
  const { data: rate, error: readError } = await admin
    .from("rates")
    .select("prices")
    .eq("id", id)
    .single();
  if (readError) throw new Error("No se pudo consultar tarifa.");
  if (!Object.keys(rate.prices).length) {
    const { error } = await admin.from("rates").update({ prices }).eq("id", id);
    if (error) throw new Error("No se pudo configurar tarifa de ensayo.");
  }
}
const { data: receivers } = await admin
  .from("sinpe_numbers")
  .select("id,label");
if (!receivers?.some((r) => r.label === "Receptor de prueba · FICTICIO"))
  await admin
    .from("sinpe_numbers")
    .insert({ label: "Receptor de prueba · FICTICIO", phone: "88880000" });
console.log(
  "Supabase local conectado. Tres cuentas ficticias con contraseñas distintas en .local/test-accounts.json (archivo privado, excluido de Git).",
);
console.log(
  "Frontend: npm run dev:local → http://localhost:5174. No se cargaron pacientes simulados en producción.",
);
