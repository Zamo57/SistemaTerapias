import { useState } from "react";
import { Activity, Play } from "lucide-react";
import { type Store } from "../data";
import { money, dateTime, balance, statusLabel, type Row } from "../domain";
import { Empty } from "./ui";

export function VisitList({
  visits,
  store,
  clinical,
  finance,
  person,
  note,
  pay,
  operate,
  act,
}: {
  visits: Row[];
  store: Store;
  clinical: boolean;
  finance: boolean;
  person: (id: string) => string;
  note: (v: Row) => void;
  pay: (v: Row) => void;
  operate: boolean;
  act: (v: Row, a: string) => void;
}) {
  const [status, setStatus] = useState("");
  return (
    <>
      <div className="panel-heading">
        <h2>Todas las atenciones</h2>
        <select
          aria-label="Filtrar estado"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {["pending", "running", "paused", "completed", "cancelled"].map(
            (x) => (
              <option key={x} value={x}>
                {statusLabel[x]}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Paciente / fecha</th>
              <th>Terapias / profesional</th>
              <th>Duración y precio</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visits
              .filter((v) => !status || v.status === status)
              .sort((a, b) => b.attended_at.localeCompare(a.attended_at))
              .map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>
                      {store.patients.find((p) => p.id === v.patient_id)?.name}
                    </strong>
                    <small>{dateTime(v.attended_at)}</small>
                  </td>
                  <td>
                    {store.visit_therapies
                      .filter((t) => t.visit_id === v.id)
                      .map((t) => t.therapy_name)
                      .join(" · ")}
                    <small>{person(v.therapist_id)}</small>
                  </td>
                  <td>
                    {v.minutes} min · {money(v.amount)}
                    <small>{v.rate_name}</small>
                  </td>
                  <td>
                    <span className="badge">{statusLabel[v.status]}</span>
                  </td>
                  <td>
                    <div className="actions">
                      {operate && v.status === "pending" && (
                        <button
                          className="primary"
                          onClick={() => act(v, "start")}
                        >
                          <Play size={15} />
                          Iniciar
                        </button>
                      )}
                      {operate &&
                        ["pending", "paused", "running"].includes(v.status) && (
                          <button onClick={() => act(v, "cancel")}>
                            Cancelar
                          </button>
                        )}
                      {clinical && (
                        <button onClick={() => note(v)}>Notas</button>
                      )}
                      {finance &&
                        v.status !== "cancelled" &&
                        balance(v, store.payments) > 0 && (
                          <button onClick={() => pay(v)}>Cobrar</button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!visits.length && (
        <Empty
          icon={<Activity />}
          title="Aún no hay atenciones"
          text="Buscá un paciente para registrar la primera."
        />
      )}
    </>
  );
}
