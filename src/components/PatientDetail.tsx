import { useState } from "react";
import { CreditCard, FileText, Plus } from "lucide-react";
import { type Store } from "../data";
import {
  money,
  dateTime,
  day,
  balance,
  statusLabel,
  type Row,
} from "../domain";
import { Field } from "./ui";
import { Empty } from "./ui";

export function PatientDetail({
  patient: p,
  store,
  clinical,
  finance,
  operate,
  person,
  close,
  newVisit,
  note,
  pay,
  background,
  edit,
}: {
  patient: Row;
  store: Store;
  clinical: boolean;
  finance: boolean;
  operate: boolean;
  person: (id: string) => string;
  close: () => void;
  newVisit: (p: Row) => void;
  note: (v: Row) => void;
  pay: (v: Row) => void;
  background: (p: Row) => void;
  edit: (p: Row) => void;
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [therapy, setTherapy] = useState(""),
    [professional, setProfessional] = useState("");
  const all = store.visits
    .filter((v) => v.patient_id === p.id)
    .sort((a, b) => b.attended_at.localeCompare(a.attended_at));
  const filtered = all.filter(
    (v) =>
      (!from || day(v.attended_at) >= from) &&
      (!to || day(v.attended_at) <= to) &&
      (!professional || v.therapist_id === professional) &&
      (!therapy ||
        store.visit_therapies.some(
          (t) => t.visit_id === v.id && t.therapy_id === therapy,
        )),
  );
  const b = store.backgrounds.find((b) => b.patient_id === p.id);
  return (
    <>
      <button className="link" onClick={close}>
        ← Volver a pacientes
      </button>
      <section className="panel patient-header">
        <div className="patient-summary">
          <span className="avatar large pale">{p.name[0]}</span>
          <div>
            <h2>{p.name}</h2>
            <p>
              {p.document_type} {p.document} ·{" "}
              {p.phone || "Teléfono por completar"}
            </p>
            <span className="badge">
              {all.filter((v) => v.status === "completed").length} sesiones
              finalizadas
            </span>
          </div>
        </div>
        <div className="actions">
          {operate && (
            <>
              <button onClick={() => edit(p)}>Editar datos</button>
              <button className="primary" onClick={() => newVisit(p)}>
                <Plus size={16} />
                Nueva atención
              </button>
            </>
          )}
        </div>
        <div className="patient-facts">
          <div>
            <small>Última visita</small>
            <strong>
              {all[0] ? dateTime(all[0].attended_at) : "Sin visitas"}
            </strong>
          </div>
          <div>
            <small>Preferencias visibles</small>
            <strong>
              {p.preferred_minutes
                ? `${p.preferred_minutes} minutos`
                : "Duración sin preferencia"}{" "}
              ·{" "}
              {p.preferred_rate
                ? `Tarifa ${p.preferred_rate}`
                : "Tarifa por confirmar"}
            </strong>
          </div>
          <div>
            <small>Procedencia</small>
            <strong>
              {p.source}
              {p.original_date && ` · ${p.original_date}`}
            </strong>
          </div>
        </div>
      </section>
      {clinical && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Antecedentes generales</h2>
            <button onClick={() => background(p)}>Editar antecedentes</button>
          </div>
          <p className="prewrap">
            {b?.body || "Sin antecedentes documentados."}
          </p>
          {b?.updated_at && (
            <small>
              Actualizó {person(b.updated_by)} · {dateTime(b.updated_at)}
            </small>
          )}
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Historial de atenciones</h2>
          <span className="badge">Una visita = una sesión</span>
        </div>
        <div className="filters">
          <Field label="Desde">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Terapia">
            <select
              value={therapy}
              onChange={(e) => setTherapy(e.target.value)}
            >
              <option value="">Todas</option>
              {store.therapies.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Profesional">
            <select
              value={professional}
              onChange={(e) => setProfessional(e.target.value)}
            >
              <option value="">Todos</option>
              {store.profiles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="timeline">
          {filtered.map((v) => {
            const versions = store.notes
                .filter((n) => n.visit_id === v.id)
                .sort((a, b) => b.revision - a.revision),
              n = versions[0];
            return (
              <article key={v.id} className="timeline-item">
                <span className="timeline-dot" />
                <div className="row">
                  <h3>{dateTime(v.attended_at)}</h3>
                  <span className="badge">{statusLabel[v.status]}</span>
                </div>
                <p>
                  <strong>
                    {store.visit_therapies
                      .filter((t) => t.visit_id === v.id)
                      .map((t) => t.therapy_name)
                      .join(" · ")}
                  </strong>
                </p>
                <p>
                  {person(v.therapist_id)} · Programada: {v.minutes} min ·
                  Registrada: {Math.floor(v.elapsed_seconds / 60)} min
                </p>
                <small>
                  Creó {person(v.created_by)}
                  {v.created_at && ` · ${dateTime(v.created_at)}`} ·{" "}
                  {v.rate_name} · {money(v.amount)}
                  {v.free ? " · Gratuita" : ""}
                </small>
                {finance && (
                  <p className="badge">
                    {balance(v, store.payments) > 0
                      ? `Saldo pendiente: ${money(balance(v, store.payments))}`
                      : "Pagado / sin saldo"}
                  </p>
                )}
                {clinical && (
                  <>
                    {n ? (
                      <div className="note-preview">
                        <div className="form-grid">
                          <div>
                            <small>Motivo</small>
                            <p>{n.motive || "No documentado"}</p>
                          </div>
                          <div>
                            <small>Síntomas reportados</small>
                            <p>{n.symptoms || "No documentados"}</p>
                          </div>
                        </div>
                        <p className="prewrap">
                          {n.body || "Sin observaciones"}
                        </p>
                        <p>
                          <strong>Respuesta documentada:</strong>{" "}
                          {n.evolution || "No documentada"}
                        </p>
                        <small>
                          {n.finalized ? "Nota finalizada" : "Borrador"} ·{" "}
                          {person(n.author_id)} · {dateTime(n.created_at)} ·
                          Versión {n.revision}
                          {n.reason && ` · Motivo de corrección: ${n.reason}`}
                        </small>
                      </div>
                    ) : (
                      <p className="muted">Sin nota clínica registrada</p>
                    )}
                    {versions.length > 1 && (
                      <details>
                        <summary>
                          Consultar versiones anteriores (acceso clínico)
                        </summary>
                        {versions.slice(1).map((n) => (
                          <div className="note-preview" key={n.id}>
                            <strong>Versión {n.revision}</strong>
                            <p>
                              {n.motive} · {n.symptoms}
                            </p>
                            <p className="prewrap">{n.body}</p>
                            <p>{n.evolution}</p>
                            <small>
                              {person(n.author_id)} · {dateTime(n.created_at)}
                              {n.reason && ` · Motivo: ${n.reason}`}
                            </small>
                          </div>
                        ))}
                      </details>
                    )}
                  </>
                )}
                <div className="actions">
                  {clinical && (
                    <button onClick={() => note(v)}>
                      <FileText size={16} />
                      {n?.finalized ? "Corregir nota" : "Completar notas"}
                    </button>
                  )}
                  {finance &&
                    v.status !== "cancelled" &&
                    balance(v, store.payments) > 0 && (
                      <button onClick={() => pay(v)}>
                        <CreditCard size={16} />
                        Cobrar
                      </button>
                    )}
                </div>
              </article>
            );
          })}
          {!filtered.length && (
            <Empty
              icon={<FileText />}
              title="Sin visitas en este rango"
              text="Ajustá los filtros o registrá una nueva atención."
            />
          )}
        </div>
      </section>
    </>
  );
}
