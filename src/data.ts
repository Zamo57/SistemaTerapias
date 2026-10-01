import { createClient } from "@supabase/supabase-js";
import type { Row } from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const environmentLabel = import.meta.env.VITE_ENVIRONMENT_LABEL || "";
// En producción se fija por variable para que Auth no dependa del origen accidental.
export const publicAppUrl =
  import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          storage:
            typeof window === "undefined" ? undefined : window.sessionStorage,
          detectSessionInUrl: true,
          autoRefreshToken: true,
        },
      })
    : null;
export const tables = [
  "profiles",
  "settings",
  "patients",
  "backgrounds",
  "visits",
  "visit_therapies",
  "notes",
  "therapies",
  "rates",
  "sinpe_numbers",
  "templates",
  "payments",
  "appointments",
];
export type Store = Record<string, Row[]>;
export const empty = () =>
  Object.fromEntries(tables.map((t) => [t, []])) as Store;
export async function load(): Promise<Store> {
  const { data, error } = await supabase!.rpc("workspace_snapshot");
  if (error)
    throw new Error(`No se pudieron actualizar los datos: ${error.message}`);
  return data as Store;
}
export async function rpc(name: string, args: Row) {
  const { data, error } = await supabase!.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function insert(table: string, row: Row) {
  const { data, error } = await supabase!
    .from(table)
    .insert(row)
    .select()
    .single();
  if (error)
    throw new Error(
      error.code === "23505"
        ? "Ya existe un registro con esa identificación o nombre."
        : error.message,
    );
  return data;
}
export async function update(
  table: string,
  row: Row,
  id: string | number,
  version?: number,
) {
  let q = supabase!
    .from(table)
    .update(row)
    .eq(table === "backgrounds" ? "patient_id" : "id", id);
  if (version !== undefined) q = q.eq("version", version);
  const { data, error } = await q.select();
  if (error) throw new Error(error.message);
  if (!data?.length)
    throw new Error(
      "Conflicto de edición o permiso insuficiente. Actualizá los datos.",
    );
  return data[0];
}
export function demonstration(): Store {
  const s = empty();
  s.profiles = [
    {
      id: "demo-clinical",
      name: "Terapeuta de demostración",
      active: true,
      permissions: ["clinical", "admin", "reception", "finance"],
    },
    {
      id: "demo-reception",
      name: "Recepción de demostración",
      active: true,
      permissions: ["reception", "finance"],
    },
  ];
  s.settings = [
    {
      id: 1,
      name: "Centro de terapias",
      color: "#17695d",
      hourly_reference: 5700000,
    },
  ];
  s.patients = [
    {
      id: "demo-patient",
      name: "María Ejemplo · FICTICIO",
      document_type: "Cédula",
      document: "109990999",
      phone: "88880000",
      source: "Demostración",
      version: 1,
      preferred_minutes: 60,
    },
  ];
  s.backgrounds = [
    {
      patient_id: "demo-patient",
      body: "DATOS FICTICIOS: refiere molestia muscular recurrente. Antecedente registrado para demostración.",
      version: 1,
    },
  ];
  s.therapies = [
    { id: "demo-therapy", name: "Terapia manual · ejemplo", active: true },
    {
      id: "demo-therapy2",
      name: "Ejercicio terapéutico · ejemplo",
      active: true,
    },
  ];
  s.rates = [
    { id: 1, name: "Tarifa 1", prices: {} },
    { id: 2, name: "Tarifa 2", prices: {} },
  ];
  s.visits = [
    {
      id: "demo-visit",
      patient_id: "demo-patient",
      therapist_id: "demo-clinical",
      created_by: "demo-reception",
      attended_at: "2026-09-30T10:00:00-06:00",
      created_at: "2026-09-30T10:00:00-06:00",
      status: "completed",
      minutes: 60,
      elapsed_seconds: 3600,
      rate_name: "Tarifa modificable",
      amount: 5700000,
      finished_at: "2026-09-30T11:00:00-06:00",
      version: 1,
    },
    {
      id: "demo-old",
      patient_id: "demo-patient",
      therapist_id: "demo-clinical",
      created_by: "demo-clinical",
      attended_at: "2025-09-30T10:00:00-06:00",
      status: "completed",
      minutes: 30,
      elapsed_seconds: 1800,
      rate_name: "Tarifa modificable",
      amount: 0,
      free: true,
      version: 1,
    },
  ];
  s.visit_therapies = [
    {
      visit_id: "demo-visit",
      therapy_id: "demo-therapy",
      therapy_name: s.therapies[0].name,
    },
    {
      visit_id: "demo-old",
      therapy_id: "demo-therapy2",
      therapy_name: s.therapies[1].name,
    },
  ];
  s.notes = [
    {
      id: "demo-note",
      visit_id: "demo-visit",
      revision: 1,
      motive: "DEMO: molestia muscular",
      symptoms: "DEMO: tensión referida por la paciente",
      body: "DEMO: se documenta terapia manual durante 60 minutos.",
      evolution: "DEMO: refiere alivio al finalizar.",
      finalized: true,
      author_id: "demo-clinical",
      created_at: "2026-09-30T11:00:00-06:00",
    },
    {
      id: "demo-note-old",
      visit_id: "demo-old",
      revision: 1,
      motive: "DEMO: primera visita",
      body: "DEMO: sesión ficticia de hace un año.",
      symptoms: "",
      evolution: "",
      finalized: true,
      author_id: "demo-clinical",
      created_at: "2025-09-30T11:00:00-06:00",
    },
  ];
  s.payments = [
    {
      id: "demo-payment",
      visit_id: "demo-visit",
      amount: 5700000,
      method: "Efectivo",
      status: "confirmed",
      kind: "payment",
      received_at: "2026-09-30T11:05:00-06:00",
      received_by: "demo-reception",
    },
  ];
  return s;
}
