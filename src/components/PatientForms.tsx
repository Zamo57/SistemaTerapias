import { useState } from "react";
import { normalize, type Row } from "../domain";
import { Field } from "./ui";
import { Modal } from "./ui";

export function PatientForm({
  initial,
  patient,
  save,
  close,
}: {
  initial: string;
  patient?: Row;
  save: (r: Row) => Promise<boolean>;
  close: () => void;
}) {
  const [type, setType] = useState<string>(patient?.document_type || "Cédula"),
    [doc, setDoc] = useState(patient?.document || initial),
    [busy, setBusy] = useState(false);
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
            name: f.get("name"),
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
        <Field label="Nombre completo">
          <input
            required
            minLength={2}
            name="name"
            defaultValue={patient?.name}
          />
        </Field>
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
          permiso clínico. No se consultan fuentes externas.
        </p>
        <button className="primary full" disabled={busy}>
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
