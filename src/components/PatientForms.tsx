import { useEffect, useRef, useState } from "react";
import {
  lookupPatient,
  canApplyLookup,
  type PatientLookup,
} from "../patientLookup";
import { normalize, type Row } from "../domain";
import { Field } from "./ui";
import { Modal } from "./ui";

export function PatientForm({
  initial,
  patient,
  save,
  close,
  allowExternal = false,
  onExisting,
  lookup = lookupPatient,
}: {
  initial: string;
  patient?: Row;
  save: (r: Row) => Promise<boolean>;
  close: () => void;
  allowExternal?: boolean;
  onExisting?: (id: string) => void;
  lookup?: (cedula: string, signal: AbortSignal) => Promise<PatientLookup>;
}) {
  const [type, setType] = useState<string>(patient?.document_type || "Cédula"),
    [doc, setDoc] = useState(patient?.document || initial),
    [busy, setBusy] = useState(false);
  const [names, setNames] = useState({
    nombre: patient?.first_name || "",
    primer_apellido: patient?.first_surname || "",
    segundo_apellido: patient?.second_surname || "",
  });
  const legacy = !!patient && !patient.first_name;
  const [message, setMessage] = useState(""),
    [existing, setExisting] = useState<string | null>(null),
    [looking, setLooking] = useState(false);
  const sequence = useRef(0),
    edits = useRef(0);
  useEffect(() => {
    const request = ++sequence.current,
      editing = edits.current;
    const controller = new AbortController();
    setExisting(null);
    setLooking(false);
    setMessage("");
    // Cambiar el documento descarta sugerencias anteriores, pero preserva toda edición humana.
    if (!patient && edits.current === 0)
      setNames({ nombre: "", primer_apellido: "", segundo_apellido: "" });
    if (!allowExternal || patient || type !== "Cédula" || !/^\d{9}$/.test(doc))
      return;
    const timer = setTimeout(async () => {
      setLooking(true);
      setMessage("Buscando datos…");
      try {
        const result = await lookup(doc, controller.signal);
        if (controller.signal.aborted || request !== sequence.current) return;
        if (result.existingId) {
          setExisting(result.existingId);
          setMessage("Este paciente ya está registrado. Abrí su ficha.");
        } else if (result.data) {
          if (
            edits.current === 0 &&
            canApplyLookup(request, sequence.current, editing, edits.current)
          ) {
            setNames({
              nombre: result.data.nombre,
              primer_apellido: result.data.primer_apellido,
              segundo_apellido: result.data.segundo_apellido,
            });
            setMessage(
              "Datos sugeridos por GoMeta. Revisalos antes de guardar.",
            );
          } else
            setMessage(
              "Datos encontrados; se conservaron tus cambios manuales.",
            );
        } else
          setMessage(
            result.error === "not_found"
              ? "Sin resultados. Podés registrar el nombre manualmente."
              : result.error === "limited"
                ? "Límite temporal alcanzado. Podés continuar manualmente."
                : "Servicio no disponible. Podés continuar manualmente.",
          );
      } catch {
        if (!controller.signal.aborted && request === sequence.current)
          setMessage("Servicio no disponible. Podés continuar manualmente.");
      } finally {
        if (request === sequence.current) setLooking(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
      sequence.current++;
    };
  }, [doc, type, allowExternal, patient, lookup]);
  return (
    <Modal
      title={patient ? "Editar paciente" : "Registro rápido de paciente"}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          await save({
            document_type: type,
            document: normalize(type, doc),
            name: legacy
              ? f.get("name")
              : [names.nombre, names.primer_apellido, names.segundo_apellido]
                  .filter(Boolean)
                  .join(" ")
                  .trim(),
            ...(legacy
              ? {}
              : {
                  first_name: names.nombre.trim(),
                  first_surname: names.primer_apellido.trim(),
                  second_surname: names.segundo_apellido.trim(),
                }),
            phone: f.get("phone") || null,
            email: f.get("email") || null,
            preferred_minutes: Number(f.get("preferred_minutes")) || null,
            preferred_rate: Number(f.get("preferred_rate")) || null,
            consent_care_at: f.get("care")
              ? patient?.consent_care_at || new Date().toISOString()
              : null,
            consent_reminders_at: f.get("reminders")
              ? patient?.consent_reminders_at || new Date().toISOString()
              : null,
          });
          setBusy(false);
        }}
      >
        <div className="form-grid">
          <Field label="Tipo de identificación">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {["Cédula", "DIMEX", "Pasaporte"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Número de identificación">
            <input
              required
              minLength={3}
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              autoFocus
            />
          </Field>
        </div>
        {legacy ? (
          <Field label="Nombre completo">
            <input
              required
              minLength={2}
              name="name"
              defaultValue={patient?.name}
            />
          </Field>
        ) : (
          <>
            <Field label="Nombre (y otros nombres)">
              <input
                required
                minLength={2}
                value={names.nombre}
                onChange={(e) => {
                  edits.current++;
                  setNames({ ...names, nombre: e.target.value });
                }}
                autoComplete="given-name"
              />
            </Field>
            <div className="form-grid">
              <Field label="Primer apellido">
                <input
                  value={names.primer_apellido}
                  onChange={(e) => {
                    edits.current++;
                    setNames({ ...names, primer_apellido: e.target.value });
                  }}
                />
              </Field>
              <Field label="Segundo apellido">
                <input
                  value={names.segundo_apellido}
                  onChange={(e) => {
                    edits.current++;
                    setNames({ ...names, segundo_apellido: e.target.value });
                  }}
                />
              </Field>
            </div>
          </>
        )}
        <p role="status" aria-live="polite" aria-busy={looking}>
          {message}
        </p>
        {existing && onExisting && (
          <button
            type="button"
            className="secondary"
            onClick={() => onExisting(existing)}
          >
            Abrir ficha existente
          </button>
        )}
        <details>
          <summary>Completar contacto y preferencias</summary>
          <div className="form-grid">
            <Field label="Teléfono (opcional)">
              <input name="phone" type="tel" defaultValue={patient?.phone} />
            </Field>
            <Field label="Correo (opcional)">
              <input name="email" type="email" defaultValue={patient?.email} />
            </Field>
            <Field label="Duración preferida">
              <select
                name="preferred_minutes"
                defaultValue={patient?.preferred_minutes || ""}
              >
                <option value="">Sin preferencia</option>
                <option value="30">30 minutos</option>
                <option value="60">60 minutos</option>
              </select>
            </Field>
            <Field label="Tarifa preferida">
              <select
                name="preferred_rate"
                defaultValue={patient?.preferred_rate || ""}
              >
                <option value="">Sin preferencia</option>
                <option value="1">Tarifa 1</option>
                <option value="2">Tarifa 2</option>
              </select>
            </Field>
          </div>
        </details>
        <label className="check">
          <input
            name="care"
            type="checkbox"
            defaultChecked={!!patient?.consent_care_at}
          />
          Se documentó la información y el consentimiento de atención
          correspondiente
        </label>
        <label className="check">
          <input
            name="reminders"
            type="checkbox"
            defaultChecked={!!patient?.consent_reminders_at}
          />
          Autoriza recordatorios (separado de la atención)
        </label>
        <p className="hint">
          Las notas y los antecedentes se registran aparte por personal con
          permiso clínico. Para cédulas físicas nuevas se consulta GoMeta, un
          servicio externo. Sus sugerencias no verifican la identidad del
          paciente ni significan que el servicio pertenezca al TSE. Podés
          escribir los datos manualmente.
        </p>
        <button className="primary full" disabled={busy || !!existing}>
          {busy ? "Guardando…" : "Guardar paciente"}
        </button>
      </form>
    </Modal>
  );
}

export function BackgroundForm({
  patient,
  background,
  save,
  close,
}: {
  patient: Row;
  background?: Row;
  save: (s: string) => Promise<boolean>;
  close: () => void;
}) {
  return (
    <Modal title="Antecedentes generales" close={close}>
      <p>{patient.name}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(String(new FormData(e.currentTarget).get("body")));
        }}
      >
        <Field label="Padecimientos, antecedentes y observaciones generales">
          <textarea name="body" rows={7} defaultValue={background?.body} />
        </Field>
        <p className="hint">
          Este cambio no modifica las notas históricas de las visitas.
        </p>
        <button className="primary full">Guardar antecedentes</button>
      </form>
    </Modal>
  );
}
