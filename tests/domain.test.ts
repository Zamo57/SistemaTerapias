import { describe, it, expect } from "vitest";
import {
  cents,
  normalize,
  remaining,
  balance,
  net,
  periodBounds,
  day,
} from "../src/domain";
import { demonstration } from "../src/data";
describe("Reglas monetarias y de atención", () => {
  it("normaliza cédula y conserva pasaporte como texto", () => {
    expect(normalize("Cédula", "1-0999-0999")).toBe("109990999");
    expect(normalize("Pasaporte", "ab-012 3")).toBe("AB-0123");
  });
  it("usa centavos exactos sin redondeo flotante", () => {
    expect(cents("57000")).toBe(5700000);
    expect(cents("0.29")).toBe(29);
    expect(() => cents("1.005")).toThrow();
    expect(() => cents("-1")).toThrow();
  });
  it("recupera temporizador y pausa desde timestamps", () => {
    const v = {
      minutes: 30,
      elapsed_seconds: 120,
      status: "running",
      segment_at: "2026-09-30T16:00:00Z",
    };
    expect(remaining(v, Date.parse("2026-09-30T16:05:00Z"))).toBe(1380);
    expect(
      remaining({ ...v, status: "paused" }, Date.parse("2026-09-30T17:00:00Z")),
    ).toBe(1680);
  });
  it("pagos pendientes no reducen saldo, devolución sí lo reabre", () => {
    const v = { id: "a", amount: 5700000 };
    const p = [
      { visit_id: "a", amount: 2000000, status: "confirmed", kind: "payment" },
      { visit_id: "a", amount: 1000000, status: "pending", kind: "payment" },
      { visit_id: "a", amount: 500000, status: "confirmed", kind: "refund" },
    ];
    expect(balance(v, p)).toBe(4200000);
  });
  it("día, semana y mes respetan Costa Rica en el límite UTC", () => {
    expect(day("2026-10-01T05:59:59Z")).toBe("2026-09-30");
    expect(day("2026-10-01T06:00:00Z")).toBe("2026-10-01");
    expect(periodBounds(new Date("2026-09-30T16:00:00Z"))).toEqual({
      today: "2026-09-30",
      week: "2026-09-28",
      month: "2026-09-01",
    });
  });
  it("cobros netos excluyen no verificados y usan fecha de recepción", () => {
    const p = [
      {
        amount: 100,
        status: "confirmed",
        kind: "payment",
        received_at: "2026-10-01T05:59:59Z",
        method: "Efectivo",
      },
      {
        amount: 30,
        status: "confirmed",
        kind: "refund",
        received_at: "2026-09-30T16:00:00Z",
        method: "Efectivo",
      },
      { amount: 900, status: "pending", received_at: "2026-09-30T16:00:00Z" },
    ];
    expect(net(p, "2026-09-30", "2026-09-30")).toBe(70);
  });
  it("demostración incluye visita histórica, autoría separada y ejemplo solicitado", () => {
    const s = demonstration();
    expect(s.visits[0].attended_at).toBe("2026-09-30T10:00:00-06:00");
    expect(s.visits[1].attended_at.startsWith("2025")).toBe(true);
    expect(s.visits[0].created_by).not.toBe(s.visits[0].therapist_id);
    expect(balance(s.visits[0], s.payments)).toBe(0);
  });
});
