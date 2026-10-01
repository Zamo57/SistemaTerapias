import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
const execute = process.argv.includes("--execute");
const firstAdmin = process.argv.includes("--first-admin");
try {
  loadEnvFile(".env.admin.local");
} catch {
  if (execute)
    throw new Error(
      "Creá .env.admin.local desde .env.admin.example. No pegues claves secretas en el chat.",
    );
}
const config = JSON.parse(
  await readFile(process.env.TEAM_CONFIG || "config/team.json", "utf8"),
);
if (!Array.isArray(config.users) || config.users.length !== 3)
  throw new Error("Configurá exactamente tres usuarios.");
const origin = new URL(config.origin);
if (
  origin.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(origin.hostname)
)
  throw new Error("El origen debe usar HTTPS.");
const emails = new Set();
// El alta inicial no debe obligar a inventar las otras dos identidades pendientes.
const definitions = firstAdmin ? [config.users[0]] : config.users;
if (firstAdmin && !definitions[0].permissions?.includes("admin"))
  throw new Error(
    "El primer integrante debe tener permiso administrativo explícito.",
  );
for (const user of definitions) {
  if (
    typeof user.name !== "string" ||
    user.name.trim().length < 2 ||
    /pendiente|CAMBIAR/i.test(user.name) ||
    !/^\S+@\S+\.\S+$/.test(user.email) ||
    emails.has(user.email.toLowerCase()) ||
    !Array.isArray(user.permissions) ||
    !user.permissions.length ||
    user.permissions.some(
      (p) => !["admin", "clinical", "reception", "finance"].includes(p),
    )
  )
    throw new Error(
      "Revisá nombres, correos únicos y permisos de cada integrante.",
    );
  emails.add(user.email.toLowerCase());
}
if (!definitions.some((u) => u.permissions.includes("admin")))
  throw new Error("Debe existir un administrador.");
console.log(
  firstAdmin
    ? "Configuración válida para primera cuenta administrativa; las otras identidades quedan pendientes."
    : "Configuración válida: tres identidades individuales, permisos explícitos y contraseña propia mediante enlace de invitación.",
);
if (!execute) {
  console.log(
    firstAdmin
      ? "Vista previa sin crear ni enviar: npm run team:first:invite ejecuta únicamente el alta inicial."
      : "Vista previa sin crear ni enviar: npm run team:invite ejecuta el alta con la configuración local.",
  );
  process.exit(0);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Faltan variables de servidor en .env.admin.local.");
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: list, error } = await admin.auth.admin.listUsers({
  perPage: 1000,
});
if (error)
  throw new Error(
    "No se pudo acceder a Auth. Revisá credencial de servidor sin publicarla.",
  );
if (firstAdmin) {
  const { data: admins, error } = await admin
    .from("profiles")
    .select("id")
    .eq("active", true)
    .contains("permissions", ["admin"]);
  if (error) throw new Error("No se pudo comprobar el alta inicial.");
  const identity = list.users.find(
    (u) => u.email?.toLowerCase() === definitions[0].email.toLowerCase(),
  );
  if (admins.some((p) => p.id !== identity?.id))
    throw new Error(
      "Ya hay una cuenta administrativa activa; utilizar el flujo habitual de invitaciones.",
    );
}
for (const definition of definitions) {
  const existing = list.users.find(
    (u) => u.email?.toLowerCase() === definition.email.toLowerCase(),
  );
  if (existing) {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id")
      .eq("id", existing.id)
      .maybeSingle();
    if (error || !profile)
      throw new Error(
        "Existe una identidad sin perfil. Revisá el alta parcial en Auth/SQL antes de reintentar.",
      );
    console.log("Una cuenta ya existe; se conservan contraseña y permisos.");
    continue;
  }
  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    definition.email,
    { redirectTo: config.origin },
  );
  if (error) {
    // Solo estado/código: el mensaje del proveedor puede contener la dirección del destinatario.
    console.error(
      JSON.stringify({
        action: "invite_failed",
        status: error.status,
        code: error.code || "unknown",
      }),
    );
    throw new Error(
      "Falló una invitación. Revisá Auth, URLs permitidas y SMTP; no se continúa el lote.",
    );
  }
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    name: definition.name.trim(),
    permissions: definition.permissions,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(
      "Falló el perfil; se intentó retirar la identidad creada. Revisá Auth antes de reintentar.",
    );
  }
  console.log(
    "Cuenta individual invitada y perfil creado. La entrega por correo requiere comprobarse.",
  );
}
console.log(
  "Alta completada. Cada integrante debe aceptar su enlace y definir una contraseña propia. No se crearon contraseñas compartidas.",
);
