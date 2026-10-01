import { useEffect, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { type Store } from "../data";
import { money, cents, type Row } from "../domain";
import { Field } from "./ui";
import { Modal } from "./ui";

export function VisitForm({
  patient,
  store,
  currentUser,
  save,
  close,
}: {
  patient: Row;
  store: Store;
  currentUser: Row;
  save: (r: Row) => Promise<boolean>;
  close: () => void;
}) {
  const [minutes, setMinutes] = useState<number>(
      patient.preferred_minutes || 30,
    ),
    [rate, setRate] = useState<string>(
      patient.preferred_rate
        ? `Tarifa ${patient.preferred_rate}`
        : "Tarifa 1",
    ),
    [amount, setAmount] = useState(""),
    [free, setFree] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const selectedRate = store.rates.find((r) => r.name === rate);
  useEffect(() => {
    if (selectedRate) setMinutes(selectedRate.minutes);
  }, [selectedRate?.id]);
  const custom = rate === "Monto personalizado" || rate === "Tarifa modificable";
  const configured = selectedRate?.minutes === minutes ? selectedRate.amount : undefined;
  const value =
    custom
      ? amount
      : configured === undefined
        ? ""
        : String(configured / 100);
  const previous = store.visits
    .filter((v) => v.patient_id === patient.id && v.status === "completed")
    .sort((a, b) => b.attended_at.localeCompare(a.attended_at))[0];
  const defaultTherapist = currentUser.permissions.includes("clinical")
    ? currentUser.id
    : store.profiles.find(
        (p) =>
          p.id === previous?.therapist_id &&
          p.active &&
          p.permissions.includes("clinical"),
      )?.id || "";
  return (
    <Modal title="Registrar atención" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const f = new FormData(e.currentTarget);
            const price = cents(value);
            if (!selected.length)
              throw new Error("Seleccioná al menos una terapia");
            if (price === 0 && !free)
              throw new Error("Identificá expresamente la sesión gratuita");
            if (price > 0 && free)
              throw new Error("Una sesión gratuita debe tener monto cero");
            setBusy(true);
            await save({
              p_patient: patient.id,
              p_therapist: f.get("therapist"),
              p_minutes: minutes,
              p_rate: rate,
              p_amount: price,
              p_free: free,
              p_reason: f.get("reason") || null,
              p_therapies: selected,
              p_at: new Date(String(f.get("at")) + "-06:00").toISOString(),
            });
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        }}
      >
        <div className="patient-summary">
          <span className="avatar pale">{patient.name[0]}</span>
          <div>
            <strong>{patient.name}</strong>
            <small>
              {patient.document_type} · {patient.document}
            </small>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Profesional que realizará la terapia">
            <select name="therapist" required defaultValue={defaultTherapist}>
              <option value="">Seleccionar terapeuta</option>
              {store.profiles
                .filter((p) => p.active && p.permissions.includes("clinical"))
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Fecha y hora de atención (Costa Rica)">
            <input
              name="at"
              type="datetime-local"
              required
              defaultValue={new Date(Date.now() - 6 * 3600000)
                .toISOString()
                .slice(0, 16)}
            />
          </Field>
        </div>
        <Field label="Terapias aplicadas">
          {previous && (
            <button
              type="button"
              className="link"
              onClick={() =>
                setSelected(
                  store.visit_therapies
                    .filter(
                      (t) =>
                        t.visit_id === previous.id &&
                        store.therapies.some(
                          (c) => c.id === t.therapy_id && c.active,
                        ),
                    )
                    .map((t) => t.therapy_id),
                )
              }
            >
              Reutilizar explícitamente las terapias de la última visita
            </button>
          )}
          <div className="chips">
            {store.therapies
              .filter((t) => t.active)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={selected.includes(t.id) ? "chosen" : ""}
                  onClick={() =>
                    setSelected((x) =>
                      x.includes(t.id)
                        ? x.filter((id) => id !== t.id)
                        : [...x, t.id],
                    )
                  }
                >
                  {selected.includes(t.id) && <Check size={14} />} {t.name}
                </button>
              ))}
          </div>
          {!store.therapies.some((t) => t.active) && (
            <span className="error">
              Administración debe configurar el catálogo de terapias.
            </span>
          )}
        </Field>
        <Field label="Duración programada">
          <div className="chips">
            {(custom ? [30, 60] : [selectedRate?.minutes || minutes]).map((n) => (
              <button
                type="button"
                className={minutes === n ? "chosen" : ""}
                key={n}
                onClick={() => setMinutes(n)}
              >
                <Clock3 size={16} />
                {n} minutos
              </button>
            ))}
          </div>
        </Field>
        <Field label="Modalidad de tarifa">
          <select value={custom ? "Monto personalizado" : rate} onChange={(e) => setRate(e.target.value)}>
            {["Tarifa 1", "Tarifa 2", "Monto personalizado"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        {custom ? (
          <div className="form-grid">
            <Field label="Monto acordado (₡)">
              <input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ej. 57000"
              />
            </Field>
            <Field label="Motivo del ajuste (opcional)">
              <input name="reason" />
            </Field>
          </div>
        ) : configured === undefined ? (
          <p className="error">
            Pendiente de configurar para {minutes} minutos.
          </p>
        ) : (
          <p className="price">{money(configured)}</p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={free}
            onChange={(e) => setFree(e.target.checked)}
          />
          Esta sesión es gratuita (monto cero)
        </label>
        <div className="confirmation">
          <Clock3 size={20} />
          <strong>{minutes} minutos</strong>
          <span>{value ? `₡${value}` : "Monto pendiente"}</span>
          <small>
            Revisá antes de confirmar. La visita se guarda pendiente; el
            temporizador se inicia por separado.
          </small>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy || !value}>
          Guardar atención
        </button>
      </form>
    </Modal>
  );
}
