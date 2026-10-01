import { Metric, Empty } from "./components/ui";
import { Login } from "./components/Login";
import { PatientForm, BackgroundForm } from "./components/PatientForms";
import { VisitForm } from "./components/VisitForm";
import { NoteForm } from "./components/NoteForm";
import { PaymentForm, RefundForm } from "./components/PaymentForms";
import { PatientDetail } from "./components/PatientDetail";
import { VisitList } from "./components/VisitList";
import { Reports } from "./components/Reports";
import { Agenda } from "./components/Agenda";
import { Configuration } from "./components/Configuration";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Heart,
  House,
  LogOut,
  Pause,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Volume2,
  X,
  BarChart3,
  RefreshCw,
} from "lucide-react";

import AccountPassword from "./AccountPassword";
import {
  supabase,
  environmentLabel,
  load,
  insert,
  update,
  rpc,
  empty,
  demonstration,
  type Store,
} from "./data";
import {
  money,
  normalize,
  dateTime,
  day,
  remaining,
  clock,
  balance,
  periodBounds,
  net,
  statusLabel,
  type Row,
} from "./domain";
const nav = [
  ["Inicio", House],
  ["Pacientes", Users],
  ["Atenciones", Activity],
  ["Cobros", CreditCard],
  ["Reportes", BarChart3],
  ["Agenda", CalendarDays],
  ["Configuración", Settings],
] as const;

let audio: AudioContext | null = null;
function beep() {
  audio ||= new (window.AudioContext || (window as any).webkitAudioContext)();
  void audio.resume();
  [0, 0.25, 0.5].forEach((delay) => {
    const o = audio!.createOscillator(),
      g = audio!.createGain();
    o.connect(g);
    g.connect(audio!.destination);
    o.frequency.value = 740;
    g.gain.setValueAtTime(0.12, audio!.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(
      0.001,
      audio!.currentTime + delay + 0.2,
    );
    o.start(audio!.currentTime + delay);
    o.stop(audio!.currentTime + delay + 0.22);
  });
}
export default function App() {
  const [store, setStore] = useState<Store>(empty),
    [user, setUser] = useState<Row | null>(null),
    [demo, setDemo] = useState(false),
    [section, setSection] = useState("Inicio"),
    [reportRange, setReportRange] = useState<
      { from: string; to: string } | undefined
    >(),
    [query, setQuery] = useState(""),
    [patient, setPatient] = useState<Row | null>(null),
    [dialog, setDialog] = useState<ReactNode>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [now, setNow] = useState(Date.now()),
    [sound, setSound] = useState(false),
    [credentials, setCredentials] = useState(
      location.hash.includes("type=recovery") ||
        location.hash.includes("type=invite"),
    ),
    [offline, setOffline] = useState(!navigator.onLine);
  const lastAlarm = useRef(0),
    mutating = useRef(false),
    serverOffset = useRef(0),
    identity = useRef("");
  const can = (p: string) => !!user?.active && user.permissions.includes(p),
    clinical = can("clinical"),
    finance = can("finance") || can("reception"),
    operate = clinical || can("reception");
  const refresh = async () => {
    if (demo) return;
    setLoading(true);
    try {
      const data = await load();
      const server = await rpc("server_time", {});
      serverOffset.current = new Date(server).getTime() - Date.now();
      setStore(data);
      const { data: auth } = await supabase!.auth.getUser();
      const profile = data.profiles.find((p) => p.id === auth.user?.id);
      const marker = profile
        ? `${profile.id}:${profile.active}:${profile.permissions.join(",")}`
        : "";
      if (identity.current !== marker) {
        setDialog(null);
        setPatient(null);
        identity.current = marker;
      }
      setUser(profile || null);
      if (!profile?.active)
        setError("Tu cuenta no está activa. Contactá a administración.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!supabase || demo) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "PASSWORD_RECOVERY") setCredentials(true);
      if (session) {
        setTimeout(() => void refresh(), 0);
      } else {
        setUser(null);
        setStore(empty());
        setDialog(null);
        setPatient(null);
        identity.current = "";
      }
    });
    return () => subscription.unsubscribe();
  }, [demo]);
  useEffect(() => {
    const t = setInterval(
      () => setNow(Date.now() + serverOffset.current),
      1000,
    );
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!user || demo) return;
    const t = setInterval(() => {
      if (!mutating.current && navigator.onLine) void refresh();
    }, 15000);
    return () => clearInterval(t);
  }, [user?.id, demo]);
  const active = store.visits.filter((v) =>
    ["running", "paused"].includes(v.status),
  );
  useEffect(() => {
    if (
      sound &&
      active.some(
        (v) =>
          v.status === "running" && !v.alarm_ack && remaining(v, now) === 0,
      ) &&
      now - lastAlarm.current > 15000
    ) {
      try {
        beep();
        lastAlarm.current = now;
      } catch {
        setSound(false);
        setError("No se pudo reproducir audio. Usá la prueba de sonido.");
      }
    }
  }, [now, sound, active]);
  async function action(
    fn: () => Promise<unknown>,
    message = "Guardado en la base de datos",
    keep = false,
  ) {
    if (mutating.current) return false;
    if (demo) {
      setError(
        "La demostración es de solo lectura. Configurá Supabase para guardar datos reales.",
      );
      return false;
    }
    mutating.current = true;
    setBusy(true);
    setError("");
    setNotice("Guardando…");
    try {
      await fn();
      await refresh();
      setNotice(message);
      if (!keep) setDialog(null);
      return true;
    } catch (e) {
      setNotice("No guardado");
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      mutating.current = false;
    }
  }
  const person = (id: string) =>
    store.profiles.find((p) => p.id === id)?.name || "Usuario anterior";
  const patientName = (id: string) =>
    store.patients.find((p) => p.id === id)?.name || "Paciente";
  const techniques = (id: string) =>
    store.visit_therapies
      .filter((t) => t.visit_id === id)
      .map((t) => t.therapy_name)
      .join(" · ");
  const latestNote = (id: string) =>
    store.notes
      .filter((n) => n.visit_id === id)
      .sort((a, b) => b.revision - a.revision)[0];
  const close = () => setDialog(null);
  function quickPatient(initial = query) {
    setDialog(
      <PatientForm
        initial={initial}
        save={(row) => action(() => insert("patients", row))}
        close={close}
      />,
    );
  }
  function newVisit(p: Row) {
    setDialog(
      <VisitForm
        patient={p}
        store={store}
        currentUser={user!}
        save={(args) => action(() => rpc("create_visit", args))}
        close={close}
      />,
    );
  }
  function pay(v: Row) {
    setDialog(
      <PaymentForm
        visit={v}
        store={store}
        save={(args) => action(() => rpc("record_payment", args))}
        close={close}
      />,
    );
  }
  function note(v: Row) {
    setDialog(
      <NoteForm
        visit={v}
        note={latestNote(v.id)}
        templates={store.templates}
        save={(args) =>
          action(
            () => rpc("save_note", args),
            "Nota guardada con autor y versión",
            true,
          )
        }
        close={close}
      />,
    );
  }
  function background(p: Row) {
    const b = store.backgrounds.find((b) => b.patient_id === p.id);
    setDialog(
      <BackgroundForm
        patient={p}
        background={b}
        save={(body) =>
          action(() =>
            b
              ? update(
                  "backgrounds",
                  {
                    body,
                    updated_by: user!.id,
                    updated_at: new Date().toISOString(),
                  },
                  p.id,
                  b.version,
                )
              : insert("backgrounds", { patient_id: p.id, body }),
          )
        }
        close={close}
      />,
    );
  }
  const searchResults = store.patients.filter(
    (p) =>
      !query ||
      [p.document, p.name, p.phone || ""].some((x) =>
        x.toLowerCase().includes(query.toLowerCase()),
      ) ||
      p.document.includes(normalize(p.document_type, query)),
  );
  function timer(v: Row) {
    return (
      <div className="timer-card" key={v.id}>
        <div className="row">
          <span
            className={"badge " + (remaining(v, now) === 0 ? "danger" : "")}
          >
            <Clock3 size={14} />
            {remaining(v, now) === 0
              ? "Tiempo cumplido"
              : statusLabel[v.status]}
          </span>
          <span>{v.minutes} min</span>
        </div>
        <h3>{patientName(v.patient_id)}</h3>
        <p>
          {techniques(v.id)} · {person(v.therapist_id)}
        </p>
        <div className={"timer " + (remaining(v, now) === 0 ? "expired" : "")}>
          {clock(remaining(v, now))}
        </div>
        <div className="actions">
          {operate && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  void action(
                    () =>
                      rpc("timer_action", {
                        p_visit: v.id,
                        p_version: v.version,
                        p_action: v.status === "running" ? "pause" : "resume",
                      }),
                    "Temporizador actualizado",
                  )
                }
              >
                <Pause size={16} />
                {v.status === "running" ? "Pausar" : "Continuar"}
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void action(
                    () =>
                      rpc("timer_action", {
                        p_visit: v.id,
                        p_version: v.version,
                        p_action: "finish",
                      }),
                    "Atención finalizada; pago separado",
                  )
                }
              >
                <Check size={16} />
                Finalizar
              </button>
              {!v.alarm_ack && remaining(v, now) === 0 && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(
                      () =>
                        rpc("timer_action", {
                          p_visit: v.id,
                          p_version: v.version,
                          p_action: "ack",
                        }),
                      "Alerta atendida",
                    )
                  }
                >
                  <Bell size={16} />
                  Atendida
                </button>
              )}
            </>
          )}
          {clinical && <button onClick={() => note(v)}>Notas</button>}
        </div>
      </div>
    );
  }
  if (credentials && supabase)
    return (
      <AccountPassword
        done={() => {
          setCredentials(false);
          history.replaceState(null, "", location.pathname);
          void refresh();
        }}
      />
    );
  if (!user?.active)
    return (
      <div className="login">
        <div className="login-brand">
          <div className="brand-icon">
            <Heart />
          </div>
          <p className="eyebrow">GESTIÓN DEL CENTRO</p>
          <h1>
            Más tiempo para
            <br />
            cuidar a las personas.
          </h1>
          <p>
            Pacientes, atenciones y cobros.
            <br />
            Todo en un mismo lugar.
          </p>
          <div className="login-features">
            <span>
              <ShieldCheck />
              Acceso individual
            </span>
            <span>
              <Clock3 />
              Horario de Costa Rica
            </span>
          </div>
        </div>
        <div className="login-card glass">
          <h2>Bienvenido a Centro</h2>
          <p className="muted">Ingresá con tu cuenta del equipo.</p>
          {supabase ? (
            <Login onError={setError} onNotice={setNotice} />
          ) : (
            <div className="setup">
              <ShieldCheck />
              <h3>Configuración inicial</h3>
              <p>
                Agregá la URL y la clave pública de Supabase en{" "}
                <code>.env</code>, aplicá la migración y creá el primer usuario
                siguiendo README.md.
              </p>
              <p>No se guardan expedientes en este dispositivo.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <button
            className="secondary full"
            onClick={() => {
              const d = demonstration();
              setStore(d);
              setUser(d.profiles[0]);
              setDemo(true);
              setError("");
              setNotice("Datos ficticios · demostración de solo lectura");
            }}
          >
            Explorar demostración <ArrowRight size={17} />
          </button>
          <small>
            Acceso por invitación. El registro público está deshabilitado.
          </small>
        </div>
      </div>
    );
  const bounds = periodBounds(new Date(now)),
    payments = store.payments,
    visits = store.visits,
    completed = visits.filter((v) => v.status === "completed"),
    pendingBalance = visits
      .filter((v) => v.status !== "cancelled")
      .reduce((n, v) => n + balance(v, payments), 0);
  return (
    <div className="app">
      <aside className="sidebar glass">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <div className="brand-icon">
            {store.settings[0]?.logo ? (
              <img src={store.settings[0].logo} alt="" />
            ) : (
              <Heart size={24} />
            )}
          </div>
          <div>
            <strong>{store.settings[0]?.name || "Centro"}</strong>
            <small>ADMINISTRACIÓN</small>
          </div>
        </a>
        <nav aria-label="Navegación principal">
          {nav
            .filter(([n]) => (n !== "Cobros" && n !== "Reportes") || finance)
            .map(([name, Icon]) => (
              <button
                key={name}
                aria-label={name}
                className={section === name ? "selected" : ""}
                onClick={() => {
                  setSection(name);
                  setPatient(null);
                }}
              >
                <Icon size={20} />
                {name}
                {name === "Atenciones" && active.length > 0 && (
                  <span className="nav-count">{active.length}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="safe">
            <ShieldCheck size={18} />
            <span>
              Acceso individual
              <br />
              <small>America/Costa_Rica</small>
            </span>
          </div>
          <div className="profile">
            <span className="avatar">{user.name[0]}</span>
            <div>
              <strong>{user.name}</strong>
              <small>
                {clinical
                  ? "Atención terapéutica"
                  : finance
                    ? "Recepción y cobros"
                    : "Administración"}
              </small>
            </div>
            <button
              aria-label="Cerrar sesión"
              onClick={() => {
                void supabase?.auth.signOut();
                setUser(null);
                setDemo(false);
                setStore(empty());
                setPatient(null);
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main
        style={{ "--accent": store.settings[0]?.color || "#17695d" } as any}
      >
        <header className="topbar">
          <span>
            <span className="status-dot" />{" "}
            {demo
              ? "Modo demostración"
              : environmentLabel || "Espacio de trabajo"}
          </span>
          <div>
            <span className="top-date">
              {new Intl.DateTimeFormat("es-CR", {
                dateStyle: "long",
                timeZone: "America/Costa_Rica",
              }).format(new Date(now))}
            </span>
            <button
              onClick={() => {
                try {
                  beep();
                  setSound(true);
                  setNotice("Sonido habilitado en este dispositivo");
                } catch {
                  setError("Audio no disponible");
                }
              }}
              title="Probar y habilitar sonido"
            >
              <Volume2 size={19} />
            </button>
            <button onClick={() => void refresh()} aria-label="Actualizar">
              <RefreshCw size={18} className={loading ? "spin" : ""} />
            </button>
          </div>
        </header>
        {environmentLabel && !demo && (
          <div className="demo-bar" role="status">
            {environmentLabel} · Registros persistentes en Supabase
          </div>
        )}
        {demo && (
          <div className="demo-bar">
            DATOS FICTICIOS · Solo lectura · Ningún expediente real
          </div>
        )}
        {offline && (
          <div role="alert" className="error">
            Sin conexión. Los cambios no se confirman hasta guardarse en la base
            de datos.
          </div>
        )}
        {error && (
          <div className="error row" role="alert">
            {error}
            <button aria-label="Cerrar error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="save-status" role="status">
            {busy ? <Clock3 size={14} /> : <Check size={14} />} {notice}
          </div>
        )}
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {section === "Inicio"
                ? "TU CENTRO, EN UN VISTAZO"
                : "GESTIÓN DEL CENTRO"}
            </p>
            <h1>
              {section === "Inicio" ? "Un buen día para cuidar." : section}
            </h1>
            <p className="muted">
              {section === "Inicio"
                ? "Todo lo que necesitás para acompañar cada atención."
                : section === "Pacientes"
                  ? "Encontrá a una persona y retomá su historia."
                  : section === "Atenciones"
                    ? "Tiempo, terapias y notas de cada sesión."
                    : section === "Cobros"
                      ? "Pagos confirmados, abonos y saldos pendientes."
                      : section === "Agenda"
                        ? "Organizá las próximas atenciones."
                        : ""}
            </p>
          </div>
          {operate && ["Inicio", "Pacientes"].includes(section) && (
            <button className="primary" onClick={() => quickPatient("")}>
              <Plus size={18} />
              Nuevo paciente
            </button>
          )}
        </div>
        {section === "Inicio" && (
          <>
            <div className="quick-actions">
              <button onClick={() => setSection("Pacientes")}>
                <span className="quick-icon">
                  <Search />
                </span>
                <div>
                  <strong>Buscar paciente</strong>
                  <small>Cédula, nombre o teléfono</small>
                </div>
                <ChevronRight />
              </button>
              <button
                onClick={() => {
                  setSection("Pacientes");
                  setNotice(
                    "Buscá o seleccioná al paciente para registrar su visita.",
                  );
                }}
              >
                <span className="quick-icon blue">
                  <Plus />
                </span>
                <div>
                  <strong>Registrar visita</strong>
                  <small>Con cita o sin cita previa</small>
                </div>
                <ChevronRight />
              </button>
              <button onClick={() => setSection("Atenciones")}>
                <span className="quick-icon violet">
                  <Clock3 />
                </span>
                <div>
                  <strong>Terapias en curso</strong>
                  <small>{active.length} atenciones activas</small>
                </div>
                <ChevronRight />
              </button>
              {finance && (
                <button onClick={() => setSection("Cobros")}>
                  <span className="quick-icon amber">
                    <CreditCard />
                  </span>
                  <div>
                    <strong>Registrar cobro</strong>
                    <small>Efectivo o SINPE</small>
                  </div>
                  <ChevronRight />
                </button>
              )}
            </div>
            {finance && (
              <div className="metrics">
                <Metric
                  title="Cobros netos de hoy"
                  onClick={() => {
                    setReportRange({ from: bounds.today, to: bounds.today });
                    setSection("Reportes");
                  }}
                  value={money(net(payments, bounds.today, bounds.today))}
                  subtitle="Pagos confirmados − devoluciones"
                />
                <Metric
                  title="Esta semana"
                  onClick={() => {
                    setReportRange({ from: bounds.week, to: bounds.today });
                    setSection("Reportes");
                  }}
                  value={money(net(payments, bounds.week, bounds.today))}
                  subtitle="Desde el lunes · fecha de recepción"
                />
                <Metric
                  title="Este mes"
                  onClick={() => {
                    setReportRange({ from: bounds.month, to: bounds.today });
                    setSection("Reportes");
                  }}
                  value={money(net(payments, bounds.month, bounds.today))}
                  subtitle="En horario de Costa Rica"
                />
                <Metric
                  title="Saldos pendientes"
                  onClick={() => setSection("Cobros")}
                  value={money(pendingBalance)}
                  subtitle="Atenciones sin pago completo"
                />
              </div>
            )}
            <div className="dashboard-grid">
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    <Clock3 size={19} />
                    Atenciones en curso{" "}
                    <span className="count">{active.length}</span>
                  </h2>
                  <button
                    className="link"
                    onClick={() => setSection("Atenciones")}
                  >
                    Ver todas <ArrowRight size={15} />
                  </button>
                </div>
                {active.length ? (
                  <div className="timer-grid">
                    {active.slice(0, 4).map(timer)}
                  </div>
                ) : (
                  <Empty
                    icon={<Clock3 />}
                    title="Todo listo para la próxima atención"
                    text="Al iniciar una terapia, su temporizador aparecerá aquí."
                  />
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Actividad de hoy</h2>
                  <span className="badge">
                    {
                      completed.filter(
                        (v) => day(v.attended_at) === bounds.today,
                      ).length
                    }{" "}
                    sesiones
                  </span>
                </div>
                <div className="activity-list">
                  {visits
                    .filter((v) => day(v.attended_at) === bounds.today)
                    .slice(0, 5)
                    .map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setPatient(
                            store.patients.find((p) => p.id === v.patient_id)!,
                          );
                          setSection("Pacientes");
                        }}
                      >
                        <span className="avatar pale">
                          {patientName(v.patient_id)[0]}
                        </span>
                        <div>
                          <strong>{patientName(v.patient_id)}</strong>
                          <small>
                            {techniques(v.id)} · {statusLabel[v.status]}
                          </small>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                </div>
                {!visits.some((v) => day(v.attended_at) === bounds.today) && (
                  <Empty
                    icon={<Activity />}
                    title="Sin atenciones registradas hoy"
                    text="Las nuevas visitas se mostrarán aquí."
                  />
                )}
              </section>
            </div>
            <div className="bottom-grid">
              <section className="panel">
                <h2>La atención, en pocos pasos</h2>
                <div className="flow">
                  {[
                    "Buscar paciente",
                    "Consultar historial",
                    "Registrar atención",
                    "Registrar pago",
                  ].map((x, i) => (
                    <div key={x}>
                      <span>{i + 1}</span>
                      <strong>{x}</strong>
                      {i < 3 && <ChevronRight size={18} />}
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel calm">
                <Heart />
                <div>
                  <h3>Un expediente que acompaña</h3>
                  <p>
                    La última visita siempre a mano. Cada nueva atención
                    conserva su propia historia.
                  </p>
                </div>
              </section>
            </div>
          </>
        )}
        {section === "Pacientes" && (
          <>
            <div className="search-panel panel">
              <Search size={21} />
              <input
                aria-label="Buscar paciente"
                placeholder="Buscar por cédula, nombre o teléfono…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPatient(null);
                }}
              />
              <span className="muted">{searchResults.length} resultados</span>
            </div>
            {patient ? (
              <PatientDetail
                patient={
                  store.patients.find((p) => p.id === patient.id) || patient
                }
                store={store}
                clinical={clinical}
                finance={finance}
                operate={operate}
                person={person}
                close={() => setPatient(null)}
                newVisit={newVisit}
                note={note}
                pay={pay}
                background={background}
                edit={(p) =>
                  setDialog(
                    <PatientForm
                      patient={p}
                      initial=""
                      save={(row) =>
                        action(() => update("patients", row, p.id, p.version))
                      }
                      close={close}
                    />,
                  )
                }
              />
            ) : (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Pacientes registrados</h2>
                  <span className="muted">
                    Identificación como texto · búsqueda interna
                  </span>
                </div>
                {searchResults.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Paciente</th>
                          <th>Identificación</th>
                          <th>Teléfono</th>
                          <th>Última atención</th>
                          <th>Sesiones</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.slice(0, 100).map((p) => {
                          const pv = visits
                            .filter((v) => v.patient_id === p.id)
                            .sort((a, b) =>
                              b.attended_at.localeCompare(a.attended_at),
                            );
                          return (
                            <tr key={p.id}>
                              <td>
                                <button
                                  className="patient-link"
                                  aria-label={p.name}
                                  onClick={() => setPatient(p)}
                                >
                                  <span className="avatar pale">
                                    {p.name[0]}
                                  </span>
                                  <strong>{p.name}</strong>
                                </button>
                              </td>
                              <td>
                                {p.document_type}
                                <small>{p.document}</small>
                              </td>
                              <td>{p.phone || "Por completar"}</td>
                              <td>
                                {pv[0]
                                  ? dateTime(pv[0].attended_at)
                                  : "Primera visita"}
                              </td>
                              <td>
                                {
                                  pv.filter((v) => v.status === "completed")
                                    .length
                                }
                              </td>
                              <td>
                                <button
                                  aria-label={"Abrir " + p.name}
                                  onClick={() => setPatient(p)}
                                >
                                  <ChevronRight size={18} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={<Users />}
                    title="No encontramos a esta persona"
                    text="Podés registrarla con la identificación que ya escribiste."
                  />
                )}
                {operate && (
                  <button className="secondary" onClick={() => quickPatient()}>
                    <Plus size={17} />
                    Registrar paciente {query && `con ${query}`}
                  </button>
                )}
              </section>
            )}
          </>
        )}
        {section === "Atenciones" && (
          <>
            <div className="row section-tools">
              <span>
                {sound
                  ? "🔊 Sonido habilitado"
                  : "Sonido pendiente de habilitar"}
              </span>
              <button
                onClick={() => {
                  beep();
                  setSound(true);
                }}
              >
                {" "}
                <Volume2 size={18} />
                Probar sonido
              </button>
              <button onClick={() => setSound(false)}>
                Silenciar este dispositivo
              </button>
            </div>
            <p className="hint">
              La alerta se repite cada 15 segundos mientras esta página está
              activa. Con el dispositivo bloqueado o el navegador en segundo
              plano, el audio puede suspenderse. El tiempo cumplido no finaliza
              ni cobra la atención.
            </p>
            <div className="timer-grid">{active.map(timer)}</div>
            <section className="panel">
              <VisitList
                visits={visits}
                store={store}
                clinical={clinical}
                finance={finance}
                person={person}
                note={note}
                pay={pay}
                operate={operate}
                act={(v, a) =>
                  void action(
                    () =>
                      rpc("timer_action", {
                        p_visit: v.id,
                        p_version: v.version,
                        p_action: a,
                      }),
                    "Atención actualizada",
                  )
                }
              />
            </section>
          </>
        )}
        {section === "Cobros" && finance && (
          <>
            <div className="metrics">
              <Metric
                title="Saldo pendiente"
                value={money(pendingBalance)}
                subtitle="Sin incluir atenciones canceladas"
              />
              <Metric
                title="Efectivo del mes"
                value={money(
                  net(payments, bounds.month, bounds.today, "Efectivo"),
                )}
                subtitle="Cobros netos confirmados"
              />
              <Metric
                title="SINPE del mes"
                value={money(
                  net(payments, bounds.month, bounds.today, "SINPE"),
                )}
                subtitle="Verificados por el personal"
              />
              <Metric
                title="Por verificar"
                value={money(
                  payments
                    .filter((p) => p.status === "pending")
                    .reduce((n, p) => n + p.amount, 0),
                )}
                subtitle="No cuenta como ingreso"
              />
            </div>
            <section className="panel">
              <h2>Atenciones con saldo</h2>
              {visits
                .filter(
                  (v) => v.status !== "cancelled" && balance(v, payments) > 0,
                )
                .map((v) => (
                  <div className="payment-row" key={v.id}>
                    <div>
                      <strong>{patientName(v.patient_id)}</strong>
                      <small>
                        {dateTime(v.attended_at)} · {statusLabel[v.status]}
                      </small>
                    </div>
                    <strong>{money(balance(v, payments))}</strong>
                    <button className="primary" onClick={() => pay(v)}>
                      Registrar pago
                    </button>
                  </div>
                ))}
            </section>
            <section className="panel">
              <h2>Movimientos</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha de recepción</th>
                      <th>Paciente</th>
                      <th>Método</th>
                      <th>Monto</th>
                      <th>Estado / responsable</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {payments
                      .slice()
                      .sort((a, b) =>
                        b.received_at.localeCompare(a.received_at),
                      )
                      .map((p) => (
                        <tr key={p.id}>
                          <td>{dateTime(p.received_at)}</td>
                          <td>
                            {patientName(
                              visits.find((v) => v.id === p.visit_id)
                                ?.patient_id,
                            )}
                          </td>
                          <td>
                            {p.method}
                            <small>
                              {p.sinpe_label} {p.sinpe_phone} {p.reference}
                            </small>
                          </td>
                          <td>
                            {p.kind === "refund" ? "−" : ""}
                            {money(p.amount)}
                          </td>
                          <td>
                            {p.kind === "refund" ? "Devolución · " : ""}
                            {statusLabel[p.status]}
                            <small>
                              {person(p.received_by)}
                              {p.confirmed_by &&
                                ` · Verificó: ${person(p.confirmed_by)}`}
                            </small>
                          </td>
                          <td>
                            {p.status === "pending" ? (
                              <button
                                onClick={() =>
                                  void action(
                                    () =>
                                      rpc("confirm_payment", { p_id: p.id }),
                                    "Pago verificado y confirmado",
                                  )
                                }
                              >
                                Confirmar verificación
                              </button>
                            ) : (
                              p.kind === "payment" && (
                                <button
                                  onClick={() =>
                                    setDialog(
                                      <RefundForm
                                        payment={p}
                                        store={store}
                                        save={(args) =>
                                          action(
                                            () => rpc("record_payment", args),
                                            "Devolución registrada",
                                          )
                                        }
                                        close={close}
                                      />,
                                    )
                                  }
                                >
                                  Devolver / anular
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {section === "Reportes" && finance && (
          <Reports
            key={JSON.stringify(reportRange)}
            store={store}
            person={person}
            initialRange={reportRange}
          />
        )}
        {section === "Agenda" && (
          <Agenda
            store={store}
            operate={operate}
            person={person}
            save={(row) => action(() => insert("appointments", row))}
            change={(a, status) =>
              action(() => update("appointments", { status }, a.id, a.version))
            }
            move={(a, starts_at) =>
              action(() =>
                update("appointments", { starts_at }, a.id, a.version),
              )
            }
            show={setDialog}
            close={close}
          />
        )}
        {section === "Configuración" && (
          <Configuration
            store={store}
            user={user}
            can={can}
            save={(table, row, id, version) =>
              action(() =>
                id === undefined
                  ? insert(table, row)
                  : update(table, row, id, version),
              )
            }
            show={setDialog}
            close={close}
            refresh={refresh}
            demo={demo}
          />
        )}
        <footer className="page-footer">
          <ShieldCheck size={14} /> Información reservada · Montos en colones ·
          Hora de Costa Rica
        </footer>
      </main>
      {dialog}
      {busy && (
        <div className="busy-pill" role="status">
          Guardando en la base de datos…
        </div>
      )}
    </div>
  );
}
