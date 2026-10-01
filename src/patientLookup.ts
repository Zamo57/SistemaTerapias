import { supabase } from "./data";
import type { Identity } from "../supabase/functions/_shared/cedula";
export type PatientLookup = {
  data?: Identity;
  existingId?: string;
  error?: string;
  source?: "cache" | "GoMeta";
};
export async function lookupPatient(
  cedula: string,
  signal: AbortSignal,
): Promise<PatientLookup> {
  if (!supabase) return { error: "unavailable" };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "unauthorized" };
  // Solo la sesión y la clave pública llegan al navegador; proveedor y cache son del backend.
  const response = await fetch(`/api/cedula/${cedula}`, {
    signal,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });
  const body = await response.json();
  if (response.status === 409) return { existingId: body.existing_patient_id };
  if (!response.ok) return { error: body.error || "unavailable" };
  const source = response.headers.get("X-Consulta-Origen");
  return {
    data: body,
    source: source === "cache" || source === "GoMeta" ? source : undefined,
  };
}
// Guardar una versión de la entrada y de las ediciones evita aplicar respuestas antiguas.
export function canApplyLookup(
  request: number,
  current: number,
  editing: number,
  currentEditing: number,
) {
  return request === current && editing === currentEditing;
}
