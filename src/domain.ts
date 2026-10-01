export const ZONE = "America/Costa_Rica";
export type Row = Record<string, any>;
export const money = (cents: number) =>
  new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 2,
  }).format(cents / 100);
export function cents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Monto inválido. Usá números sin separador de miles.");
  const [a, b = ""] = value.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 100000000000)
    throw new Error("Monto fuera de rango");
  return n;
}
export const normalize = (type: string, value: string) =>
  value.toUpperCase().replace(type === "Pasaporte" ? /\s/g : /[\s-]/g, "");
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ZONE,
  }).format(new Date(value));
export const day = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export function remaining(v: Row, now = Date.now()) {
  return Math.max(
    0,
    v.minutes * 60 -
      v.elapsed_seconds -
      (v.status === "running"
        ? Math.floor((now - new Date(v.segment_at).getTime()) / 1000)
        : 0),
  );
}
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export function balance(v: Row, payments: Row[]) {
  return (
    v.amount -
    payments
      .filter((p) => p.visit_id === v.id && p.status === "confirmed")
      .reduce((n, p) => n + (p.kind === "refund" ? -p.amount : p.amount), 0)
  );
}
export function periodBounds(now = new Date()) {
  const today = day(now.toISOString());
  const d = new Date(today + "T12:00:00-06:00");
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return {
    today,
    week: day(d.toISOString()),
    month: today.slice(0, 7) + "-01",
  };
}
export function net(payments: Row[], from: string, to: string, method = "") {
  return payments
    .filter(
      (p) =>
        p.status === "confirmed" &&
        day(p.received_at) >= from &&
        day(p.received_at) <= to &&
        (!method || p.method === method),
    )
    .reduce((n, p) => n + (p.kind === "refund" ? -p.amount : p.amount), 0);
}
export const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  running: "En curso",
  paused: "En pausa",
  completed: "Finalizada",
  cancelled: "Cancelada",
  scheduled: "Programada",
  confirmed: "Confirmado",
};
