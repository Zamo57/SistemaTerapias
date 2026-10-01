import { useState, type ReactNode } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { type Store } from "../data";
import { dateTime, day, periodBounds, statusLabel, type Row } from "../domain";
import { Field } from "./ui";
import { Modal } from "./ui";
import { Empty } from "./ui";

export function Agenda({
  store,
  operate,
  person,
  save,
  change,
  move,
  show,
  close,
}: {
  store: Store;
  operate: boolean;
  person: (id: string) => string;
  save: (r: Row) => Promise<boolean>;
  change: (a: Row, s: string) => Promise<boolean>;
  move: (a: Row, date: string) => Promise<boolean>;
  show: (n: ReactNode) => void;
  close: () => void;
}) {
  const [date, setDate] = useState(periodBounds().today);
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <input
            aria-label="Fecha de agenda"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {operate && (
            <button
              className="primary"
              onClick={() =>
                show(
                  <Modal title="Nueva cita" close={close}>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void save({
                          patient_id: f.get("patient"),
                          therapist_id: f.get("therapist"),
                          starts_at: new Date(
                            String(f.get("at")) + "-06:00",
                          ).toISOString(),
                          minutes: Number(f.get("minutes")),
                        });
                      }}
                    >
                      <Field label="Paciente">
                        <select required name="patient">
                          <option value="">Seleccionar</option>
                          {store.patients.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.document}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Terapeuta">
                        <select required name="therapist">
                          <option value="">Seleccionar</option>
                          {store.profiles
                            .filter(
                              (p) =>
                                p.active && p.permissions.includes("clinical"),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <div className="form-grid">
                        <Field label="Fecha y hora de Costa Rica">
                          <input
                            type="datetime-local"
                            required
                            name="at"
                            defaultValue={date + "T10:00"}
                          />
                        </Field>
                        <Field label="Duración">
                          <select name="minutes">
                            <option value="30">30 minutos</option>
                            <option value="60">60 minutos</option>
                          </select>
                        </Field>
                      </div>
                      <button className="primary full">Guardar cita</button>
                    </form>
                  </Modal>,
                )
              }
            >
              <Plus size={16} />
              Nueva cita
            </button>
          )}
        </div>
        {store.appointments
          .filter((a) => day(a.starts_at) === date)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .map((a) => (
            <div className="payment-row" key={a.id}>
              <div>
                <strong>{dateTime(a.starts_at)}</strong>
                <small>
                  {store.patients.find((p) => p.id === a.patient_id)?.name} ·{" "}
                  {person(a.therapist_id)}
                </small>
              </div>
              <span className="badge">
                {statusLabel[a.status]} · {a.minutes} min
              </span>
              {operate && a.status === "scheduled" && (
                <div className="actions">
                  <button onClick={() => void change(a, "completed")}>
                    Marcar atendida
                  </button>
                  <button onClick={() => void change(a, "cancelled")}>
                    Cancelar
                  </button>
                  <button
                    onClick={() =>
                      show(
                        <Modal title="Reprogramar cita" close={close}>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              void move(
                                a,
                                new Date(
                                  String(f.get("at")) + "-06:00",
                                ).toISOString(),
                              );
                            }}
                          >
                            <Field label="Nueva fecha y hora">
                              <input type="datetime-local" name="at" required />
                            </Field>
                            <button className="primary">Reprogramar</button>
                          </form>
                        </Modal>,
                      )
                    }
                  >
                    Reprogramar
                  </button>
                </div>
              )}
            </div>
          ))}
        {!store.appointments.some((a) => day(a.starts_at) === date) && (
          <Empty
            icon={<CalendarDays />}
            title="Agenda libre"
            text="Las personas sin cita se registran directamente desde Pacientes."
          />
        )}
      </section>
      <section className="panel">
        <h2>Recordatorios · etapa 4</h2>
        <p>
          Planificados para correo y WhatsApp mediante servicios oficiales. Aún
          no se envían mensajes. Se requerirá consentimiento específico, horario
          permitido y registro de envíos sin datos clínicos.
        </p>
      </section>
    </>
  );
}
