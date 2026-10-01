import { useState } from "react";
import { Download } from "lucide-react";
import Papa from "papaparse";
import { type Store } from "../data";
import {
  money,
  dateTime,
  day,
  balance,
  periodBounds,
  net,
  type Row,
} from "../domain";
import { Field } from "./ui";
import { Metric } from "./ui";

export function csvDownload(name: string, rows: Row[]) {
  const csv = Papa.unparse(rows, { escapeFormulae: true });
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Reports({
  store,
  person,
  initialRange,
}: {
  store: Store;
  person: (id: string) => string;
  initialRange?: { from: string; to: string };
}) {
  const bounds = periodBounds(),
    [from, setFrom] = useState(initialRange?.from || bounds.month),
    [to, setTo] = useState(initialRange?.to || bounds.today),
    [method, setMethod] = useState(""),
    [professional, setProfessional] = useState("");
  const vs = store.visits.filter(
    (v) => !professional || v.therapist_id === professional,
  );
  const movements = store.payments.filter(
    (p) =>
      vs.some((v) => v.id === p.visit_id) &&
      p.status === "confirmed" &&
      day(p.received_at) >= from &&
      day(p.received_at) <= to &&
      (!method || p.method === method),
  );
  const realized = vs.filter(
    (v) =>
      v.status === "completed" &&
      day(v.attended_at) >= from &&
      day(v.attended_at) <= to,
  );
  const refunds = movements
      .filter((p) => p.kind === "refund")
      .reduce((n, p) => n + p.amount, 0),
    gross = movements
      .filter((p) => p.kind === "payment")
      .reduce((n, p) => n + p.amount, 0);
  const frequency = store.therapies
    .map((t) => ({
      name: t.name,
      count: store.visit_therapies.filter(
        (x) =>
          x.therapy_id === t.id && realized.some((v) => v.id === x.visit_id),
      ).length,
    }))
    .sort((a, b) => b.count - a.count);
  return (
    <>
      <section className="panel">
        <div className="filters">
          <Field label="Desde">
            <input
              required
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Hasta">
            <input
              required
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Profesional">
            <select
              value={professional}
              onChange={(e) => setProfessional(e.target.value)}
            >
              <option value="">Todos</option>
              {store.profiles.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Método">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Todos</option>
              <option>Efectivo</option>
              <option>SINPE</option>
            </select>
          </Field>
        </div>
        <p className="hint">
          Cobros por fecha de recepción, sesiones por fecha de atención. El
          filtro de método aplica a movimientos financieros. Una visita con
          varias terapias cuenta como una sesión.
        </p>
      </section>
      <div className="metrics">
        <Metric
          title="Cobros brutos"
          value={money(gross)}
          subtitle="Solo pagos confirmados"
        />
        <Metric
          title="Devoluciones"
          value={money(refunds)}
          subtitle="Recibidas en el rango seleccionado"
        />
        <Metric
          title="Cobros netos"
          value={money(gross - refunds)}
          subtitle="Cobros brutos − devoluciones"
        />
        <Metric
          title="Pacientes / sesiones"
          value={`${new Set(realized.map((v) => v.patient_id)).size} / ${realized.length}`}
          subtitle="Únicamente atenciones finalizadas"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>Distribución de cobros netos</h2>
          {["Efectivo", "SINPE"].map((m) => (
            <div className="chart-row" key={m}>
              <span>{m}</span>
              <div className="bar">
                <span
                  style={{
                    width: `${Math.max(0, (net(movements, from, to, m) / Math.max(gross, 1)) * 100)}%`,
                  }}
                />
              </div>
              <strong>{money(net(movements, from, to, m))}</strong>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Terapias más frecuentes</h2>
          {frequency.map((t) => (
            <div className="chart-row" key={t.name}>
              <span>{t.name}</span>
              <div className="bar">
                <span
                  style={{
                    width: `${(t.count / Math.max(1, ...frequency.map((t) => t.count))) * 100}%`,
                  }}
                />
              </div>
              <strong>{t.count}</strong>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h2>Actividad por terapeuta</h2>
        {store.profiles
          .filter((p) => p.permissions.includes("clinical"))
          .map((p) => (
            <div className="payment-row" key={p.id}>
              <strong>{p.name}</strong>
              <span>
                {realized.filter((v) => v.therapist_id === p.id).length}{" "}
                sesiones finalizadas
              </span>
            </div>
          ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Detalle que explica los cobros</h2>
          <button
            onClick={() =>
              csvDownload(
                "cobros.csv",
                movements.map((p) => ({
                  fecha_recepcion: dateTime(p.received_at),
                  atencion: p.visit_id,
                  metodo: p.method,
                  monto_colones: p.amount / 100,
                  tipo: p.kind === "refund" ? "Devolución" : "Pago",
                  responsable: person(p.received_by),
                  referencia: p.reference || "",
                })),
              )
            }
          >
            <Download size={16} />
            Exportar cobros
          </button>
        </div>
        <p className="hint">
          La exportación financiera excluye identificaciones, antecedentes y
          notas de salud.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Movimiento</th>
                <th>Método</th>
                <th>Monto neto</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((p) => (
                <tr key={p.id}>
                  <td>{dateTime(p.received_at)}</td>
                  <td>{p.kind === "refund" ? "Devolución" : "Pago"}</td>
                  <td>{p.method}</td>
                  <td>
                    {p.kind === "refund" ? "−" : ""}
                    {money(p.amount)}
                  </td>
                  <td>{person(p.received_by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Sesiones del período</h2>
        {realized.map((v) => (
          <div className="payment-row" key={v.id}>
            <span>
              {dateTime(v.attended_at)} ·{" "}
              {store.patients.find((p) => p.id === v.patient_id)?.name}
            </span>
            <span>{person(v.therapist_id)}</span>
            <strong>
              {balance(v, store.payments) > 0
                ? `Pendiente ${money(balance(v, store.payments))}`
                : "Sin saldo"}
            </strong>
          </div>
        ))}
      </section>
    </>
  );
}
