import { useEffect, useRef, useState } from "react";
import { dateTime, type Row } from "../domain";
import { Field } from "./ui";
import { Modal } from "./ui";

export function NoteForm({
  visit,
  note,
  templates,
  save,
  close,
}: {
  visit: Row;
  note?: Row;
  templates: Row[];
  save: (r: Row) => Promise<boolean>;
  close: () => void;
}) {
  const [revision, setRevision] = useState<number>(note?.revision || 0),
    [body, setBody] = useState(note?.body || ""),
    [motive, setMotive] = useState(note?.motive || ""),
    [symptoms, setSymptoms] = useState(note?.symptoms || ""),
    [evolution, setEvolution] = useState(note?.evolution || ""),
    [reason, setReason] = useState(""),
    [finalized, setFinalized] = useState(!!note?.finalized),
    [status, setStatus] = useState("Sin cambios"),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const fields = useRef({
    body,
    motive,
    symptoms,
    evolution,
    revision,
    reason,
    finalized,
  });
  fields.current = {
    body,
    motive,
    symptoms,
    evolution,
    revision,
    reason,
    finalized,
  };
  async function persist(final: boolean) {
    if (busy) return;
    setBusy(true);
    setStatus("Guardando…");
    const f = fields.current;
    const ok = await save({
      p_visit: visit.id,
      p_revision: f.revision,
      p_motive: f.motive,
      p_symptoms: f.symptoms,
      p_body: f.body,
      p_evolution: f.evolution,
      p_finalized: final,
      p_reason: f.reason || null,
    });
    if (ok) {
      setRevision((x) => x + 1);
      setFinalized(final);
      setDirty(false);
      setStatus(
        final
          ? "Nota finalizada y guardada"
          : "Borrador guardado en la base de datos",
      );
    } else setStatus("No guardado; mantené esta ventana abierta");
    setBusy(false);
  }
  useEffect(() => {
    if (!dirty || finalized || busy) return;
    const t = setTimeout(() => void persist(false), 1800);
    return () => clearTimeout(t);
  }, [body, motive, symptoms, evolution, dirty, busy, finalized]);
  function change(set: (s: string) => void, value: string) {
    set(value);
    setDirty(true);
    setStatus("Cambios pendientes de guardar");
  }
  return (
    <Modal
      title={finalized ? "Corregir nota finalizada" : "Notas de la atención"}
      close={close}
    >
      <p className="hint">
        {dateTime(visit.attended_at)} · El dictado del teclado del dispositivo
        es compatible con estos campos.
      </p>
      <div role="status" className="badge">
        {status}
      </div>
      {finalized && (
        <Field label="Motivo de corrección (obligatorio)">
          <input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      )}
      <Field label="Plantilla (se agrega solo al seleccionarla)">
        <select
          defaultValue=""
          onChange={(e) => {
            const t = templates.find((t) => t.id === e.target.value);
            if (t) change(setBody, body + (body ? "\n" : "") + t.body);
          }}
        >
          <option value="">Elegir plantilla</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Motivo de consulta">
          <textarea
            disabled={busy}
            value={motive}
            onChange={(e) => change(setMotive, e.target.value)}
          />
        </Field>
        <Field label="Síntomas reportados">
          <textarea
            disabled={busy}
            value={symptoms}
            onChange={(e) => change(setSymptoms, e.target.value)}
          />
        </Field>
      </div>
      <Field label="Notas y observaciones">
        <textarea
          disabled={busy}
          rows={5}
          value={body}
          onChange={(e) => change(setBody, e.target.value)}
        />
      </Field>
      <Field label="Evolución o respuesta reportada">
        <textarea
          disabled={busy}
          value={evolution}
          onChange={(e) => change(setEvolution, e.target.value)}
        />
      </Field>
      <div className="actions">
        <button
          disabled={busy || finalized}
          onClick={() => void persist(false)}
        >
          Guardar borrador
        </button>
        <button
          className="primary"
          disabled={busy || (finalized && !reason.trim())}
          onClick={() => void persist(true)}
        >
          {finalized ? "Guardar corrección" : "Finalizar nota"}
        </button>
      </div>
      <p className="hint">
        Cada guardado conserva versión y autor. No se copian automáticamente
        observaciones de visitas anteriores.
      </p>
    </Modal>
  );
}
