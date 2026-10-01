import { useState, type ReactNode } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import Papa from "papaparse";
import { publicAppUrl, supabase, rpc, type Store } from "../data";
import { cents, normalize, type Row } from "../domain";
import { Field } from "./ui";
import { Modal } from "./ui";

export function Configuration({
  store,
  user,
  can,
  save,
  show,
  close,
  refresh,
  demo,
}: {
  store: Store;
  user: Row;
  can: (p: string) => boolean;
  save: (
    t: string,
    r: Row,
    id?: string | number,
    v?: number,
  ) => Promise<boolean>;
  show: (n: ReactNode) => void;
  close: () => void;
  refresh: () => Promise<void>;
  demo: boolean;
}) {
  const [tab, setTab] = useState(can("admin") ? "Centro" : "Plantillas");
  const admin = can("admin"),
    clinical = can("clinical");
  const tabs = [
    ...(admin
      ? ["Centro", "Tarifas", "Terapias", "SINPE", "Usuarios", "Importación"]
      : []),
    ...(clinical ? ["Plantillas"] : []),
  ];
  if (!tabs.length)
    return (
      <section className="panel">
        <ShieldCheck />
        <h2>Configuración reservada</h2>
        <p>
          Tu cuenta no tiene permisos para modificar la configuración del
          centro.
        </p>
      </section>
    );
  return (
    <>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            className={tab === t ? "chosen" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Centro" && admin && (
        <section className="panel narrow">
          <h2>Identidad del centro</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save(
                "settings",
                {
                  name: f.get("name"),
                  color: f.get("color"),
                  logo: f.get("logo") || null,
                },
                1,
              );
            }}
          >
            <Field label="Nombre del centro">
              <input
                name="name"
                required
                defaultValue={store.settings[0]?.name}
              />
            </Field>
            <Field label="Color de acento">
              <input
                name="color"
                type="color"
                defaultValue={store.settings[0]?.color}
              />
            </Field>
            <Field label="URL HTTPS del logotipo (opcional)">
              <input
                name="logo"
                type="url"
                pattern="https://.*"
                defaultValue={store.settings[0]?.logo || ""}
              />
            </Field>
            <button className="primary">Guardar identidad</button>
          </form>
          <p className="hint">
            Referencia informada por el cliente: una hora ₡57.000. La asignación
            a cada tarifa debe confirmarse.
          </p>
        </section>
      )}
      {tab === "Tarifas" && admin && (
        <div className="dashboard-grid">
          {store.rates.map((r) => (
            <section className="panel" key={r.id}>
              <h2>{r.name}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    const prices: Row = {};
                    [30, 60].forEach((m) => {
                      const x = String(f.get(String(m)));
                      if (x) prices[m] = cents(x);
                    });
                    void save("rates", { prices }, r.id);
                  } catch (e) {
                    alert((e as Error).message);
                  }
                }}
              >
                {[30, 60].map((m) => (
                  <Field key={m} label={`${m} minutos · monto en colones`}>
                    <input
                      name={String(m)}
                      defaultValue={
                        r.prices[m] === undefined ? "" : r.prices[m] / 100
                      }
                      placeholder="Pendiente de configurar"
                      inputMode="decimal"
                    />
                  </Field>
                ))}
                <button className="primary">Guardar tarifa</button>
              </form>
              <p className="hint">
                Dejá vacío un precio sin confirmar. Los cambios solo afectan
                sesiones nuevas.
              </p>
            </section>
          ))}
        </div>
      )}
      {tab === "Terapias" && admin && (
        <Catalog
          title="Catálogo de terapias"
          rows={store.therapies}
          fields={["name"]}
          save={(r, id) => save("therapies", r, id)}
        />
      )}
      {tab === "SINPE" && admin && (
        <Catalog
          title="Números receptores SINPE"
          rows={store.sinpe_numbers}
          fields={["label", "phone"]}
          save={(r, id) => save("sinpe_numbers", r, id)}
        />
      )}
      {tab === "Plantillas" && clinical && (
        <Catalog
          title="Plantillas de notas frecuentes"
          rows={store.templates}
          fields={["name", "body"]}
          save={(r, id) => save("templates", r, id)}
        />
      )}
      {tab === "Usuarios" && admin && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Cuentas y permisos</h2>
            <button
              className="primary"
              onClick={() =>
                show(<InviteForm close={close} demo={demo} refresh={refresh} />)
              }
            >
              <Plus size={16} />
              Invitar usuario
            </button>
          </div>
          <p className="hint">
            Administración y cobros no conceden acceso a notas clínicas.
            Desactivar conserva la autoría anterior. La cuenta actual:{" "}
            {user.name}.
          </p>
          {store.profiles.map((p) => (
            <form
              className="user-row"
              key={p.id}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save(
                  "profiles",
                  {
                    name: f.get("name"),
                    active: !!f.get("active"),
                    permissions: [
                      "admin",
                      "clinical",
                      "reception",
                      "finance",
                    ].filter((x) => f.get(x)),
                  },
                  p.id,
                );
              }}
            >
              <input
                name="name"
                aria-label="Nombre de usuario"
                required
                defaultValue={p.name}
              />
              <div className="actions">
                {[
                  ["admin", "Administración"],
                  ["clinical", "Atención clínica"],
                  ["reception", "Recepción"],
                  ["finance", "Finanzas"],
                ].map(([key, label]) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      name={key}
                      defaultChecked={p.permissions.includes(key)}
                    />
                    {label}
                  </label>
                ))}
                <label className="check">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={p.active}
                  />
                  Activo
                </label>
              </div>
              <button>Guardar permisos</button>
            </form>
          ))}
        </section>
      )}
      {tab === "Importación" && admin && (
        <ImportPatients store={store} demo={demo} refresh={refresh} />
      )}
    </>
  );
}

export function Catalog({
  title,
  rows,
  fields,
  save,
}: {
  title: string;
  rows: Row[];
  fields: string[];
  save: (r: Row, id?: string) => Promise<boolean>;
}) {
  const labels: Row = {
    name: "Nombre",
    body: "Texto de plantilla",
    phone: "Número de 8 dígitos",
    label: "Etiqueta",
  };
  return (
    <section className="panel">
      <h2>{title}</h2>
      {rows.map((r) => (
        <form
          key={r.id}
          className="catalog-row"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save(
              {
                ...Object.fromEntries(fields.map((k) => [k, f.get(k)])),
                ...(r.active !== undefined
                  ? { active: !!f.get("active") }
                  : {}),
              },
              r.id,
            );
          }}
        >
          {fields.map((k) => (
            <Field key={k} label={labels[k]}>
              {k === "body" ? (
                <textarea name={k} defaultValue={r[k]} />
              ) : (
                <input
                  name={k}
                  required
                  defaultValue={r[k]}
                  pattern={k === "phone" ? "[0-9]{8}" : undefined}
                />
              )}
            </Field>
          ))}
          {r.active !== undefined && (
            <label className="check">
              <input name="active" type="checkbox" defaultChecked={r.active} />
              Activo
            </label>
          )}
          <button>Guardar</button>
        </form>
      ))}
      <h3>Agregar</h3>
      <form
        className="catalog-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          if (await save(Object.fromEntries(fields.map((k) => [k, f.get(k)]))))
            form.reset();
        }}
      >
        {fields.map((k) => (
          <Field key={k} label={labels[k]}>
            {k === "body" ? (
              <textarea name={k} required />
            ) : (
              <input
                name={k}
                required
                pattern={k === "phone" ? "[0-9]{8}" : undefined}
              />
            )}
          </Field>
        ))}
        <button className="primary">
          <Plus size={16} />
          Agregar
        </button>
      </form>
    </section>
  );
}

export function InviteForm({
  close,
  demo,
  refresh,
}: {
  close: () => void;
  demo: boolean;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Invitar integrante del equipo" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (demo) {
            setError("La demostración no envía invitaciones");
            return;
          }
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const { error } = await supabase!.functions.invoke("invite-user", {
            body: {
              email: f.get("email"),
              name: f.get("name"),
              permissions: ["admin", "clinical", "reception", "finance"].filter(
                (p) => f.get(p),
              ),
              redirectTo: publicAppUrl,
            },
          });
          if (error)
            setError(
              "No se pudo completar la invitación. Revisá la función invite-user y el correo.",
            );
          else {
            await refresh();
            close();
          }
          setBusy(false);
        }}
      >
        <Field label="Nombre">
          <input name="name" required />
        </Field>
        <Field label="Correo">
          <input name="email" type="email" required />
        </Field>
        {[
          ["admin", "Administración"],
          ["clinical", "Atención clínica"],
          ["reception", "Recepción"],
          ["finance", "Finanzas"],
        ].map(([k, label]) => (
          <label className="check" key={k}>
            <input type="checkbox" name={k} />
            {label}
          </label>
        ))}
        {error && <p className="error">{error}</p>}
        <button className="primary full" disabled={busy}>
          Enviar invitación
        </button>
      </form>
    </Modal>
  );
}

export function ImportPatients({
  store,
  demo,
  refresh,
}: {
  store: Store;
  demo: boolean;
  refresh: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [columns, setColumns] = useState<string[]>([]),
    [mapping, setMapping] = useState<Row>({}),
    [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState(""),
    [busy, setBusy] = useState(false);
  const keys = [
    "document_type",
    "document",
    "name",
    "phone",
    "email",
    "original_date",
  ];
  const labels: Row = {
    document_type: "Tipo de documento",
    document: "Identificación",
    name: "Nombre completo",
    phone: "Teléfono",
    email: "Correo",
    original_date: "Fecha original del registro",
  };
  const seen = new Set<string>();
  const preview = rows.map((r, i) => {
    const obj: Row = Object.fromEntries(
      keys.map((k) => [
        k,
        mapping[k] ? String(r[mapping[k]] || "").trim() : null,
      ]),
    );
    let issue = "";
    if (
      !obj.document_type ||
      !["Cédula", "DIMEX", "Pasaporte"].includes(obj.document_type)
    )
      issue = "Tipo de documento ausente / inválido";
    if (!obj.document || !obj.name) issue = "Falta identificación o nombre";
    if (obj.document) {
      obj.document = normalize(obj.document_type, obj.document);
      if (obj.document.length < 3) issue = "Identificación incompleta";
    }
    const unique = `${obj.document_type}:${obj.document}`;
    if (
      seen.has(unique) ||
      store.patients.some(
        (p) =>
          p.document_type === obj.document_type && p.document === obj.document,
      )
    )
      issue = "Duplicado";
    seen.add(unique);
    if (obj.original_date && !/^\d{4}-\d{2}-\d{2}$/.test(obj.original_date))
      issue = "Fecha: usar AAAA-MM-DD";
    if (obj.email && !/^\S+@\S+\.\S+$/.test(obj.email))
      issue = "Correo inválido";
    return { i, obj, issue };
  });
  return (
    <section className="panel">
      <h2>Importar pacientes desde CSV</h2>
      <p>
        En Excel, guardá una copia como CSV UTF-8. No se importan notas clínicas
        ni se inventan datos ausentes. Vista previa obligatoria;
        identificaciones y nombres requeridos.
      </p>
      <Field label="Archivo CSV">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2000000) {
              setError("Máximo 2 MB por archivo");
              return;
            }
            setSource(file.name);
            setError("");
            setResult("");
            Papa.parse<Row>(file, {
              header: true,
              skipEmptyLines: true,
              complete: (r) => {
                if (r.errors.length) {
                  setError("CSV inválido: revisá encabezados y comillas.");
                  return;
                }
                setRows(r.data.slice(0, 1000));
                setColumns(r.meta.fields || []);
                setMapping({});
                if (r.data.length > 1000)
                  setError("Dividí el archivo: máximo 1000 filas por lote.");
              },
            });
          }}
        />
      </Field>
      {columns.length > 0 && (
        <>
          <div className="form-grid">
            {keys.map((k) => (
              <Field key={k} label={labels[k]}>
                <select
                  value={mapping[k] || ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [k]: e.target.value })
                  }
                >
                  <option value="">Ausente / no importar</option>
                  {columns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <p>
            {preview.length} filas · {preview.filter((r) => r.issue).length} con
            problemas · Los campos ausentes se guardan como NULL.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Documento</th>
                  <th>Nombre</th>
                  <th>Fecha original</th>
                  <th>Validación</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 100).map((r) => (
                  <tr key={r.i}>
                    <td>{r.i + 1}</td>
                    <td>
                      {r.obj.document_type} {r.obj.document}
                    </td>
                    <td>{r.obj.name || "Ausente"}</td>
                    <td>{r.obj.original_date || "Ausente"}</td>
                    <td>{r.issue || "Lista para importar"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="primary"
            disabled={
              busy || !!error || !preview.length || preview.some((r) => r.issue)
            }
            onClick={async () => {
              if (demo) {
                setError("La demostración no importa datos");
                return;
              }
              setBusy(true);
              setError("");
              const request = crypto.randomUUID();
              try {
                await rpc("import_patients", {
                  p_request: request,
                  p_source: `CSV: ${source}`,
                  p_rows: preview.map((r) => r.obj),
                });
                setResult(
                  `${preview.length} pacientes incorporados. Lote completo confirmado.`,
                );
                setRows([]);
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              }
              setBusy(false);
            }}
          >
            Confirmar incorporación de {preview.length} pacientes
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result && <p role="status">{result}</p>}
    </section>
  );
}
