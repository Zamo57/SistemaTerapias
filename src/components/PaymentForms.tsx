import { useRef, useState } from "react";
import { type Store } from "../data";
import { money, cents, balance, type Row } from "../domain";
import { Field } from "./ui";
import { Modal } from "./ui";

export function PaymentForm({
  visit,
  store,
  save,
  close,
}: {
  visit: Row;
  store: Store;
  save: (r: Row) => Promise<boolean>;
  close: () => void;
}) {
  const [method, setMethod] = useState("Efectivo"),
    [amount, setAmount] = useState(
      String(balance(visit, store.payments) / 100),
    ),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(crypto.randomUUID());
  return (
    <Modal title="Registrar pago o abono" close={close}>
      <p className="price">Saldo: {money(balance(visit, store.payments))}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const f = new FormData(e.currentTarget);
            setBusy(true);
            await save({
              p_request: request.current,
              p_visit: visit.id,
              p_amount: cents(amount),
              p_method: method,
              p_confirmed: method === "Efectivo" || confirmed,
              p_sinpe: f.get("sinpe") || null,
              p_reference: f.get("reference") || null,
            });
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        }}
      >
        <Field label="Monto del pago (₡)">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            inputMode="decimal"
          />
        </Field>
        <Field label="Método de pago">
          <div className="chips">
            {["Efectivo", "SINPE"].map((m) => (
              <button
                key={m}
                type="button"
                className={method === m ? "chosen" : ""}
                onClick={() => setMethod(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        {method === "SINPE" && (
          <>
            <Field label="Número receptor">
              <select required name="sinpe">
                <option value="">Seleccionar número</option>
                {store.sinpe_numbers
                  .filter((n) => n.active)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label} · {n.phone}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Referencia de transferencia (opcional)">
              <input name="reference" />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Verifiqué la transferencia en la cuenta receptora
            </label>
            <p className="hint">
              Sin esta confirmación, el pago queda pendiente de verificar y no
              reduce el saldo. Seleccionar SINPE no verifica el banco.
            </p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary full" disabled={busy}>
          {busy
            ? "Registrando…"
            : method === "SINPE" && !confirmed
              ? "Guardar pendiente de verificar"
              : "Confirmar pago"}
        </button>
        <p className="hint">
          Para dividir el pago, registrá un abono con cada método. El saldo se
          calcula con pagos confirmados.
        </p>
      </form>
    </Modal>
  );
}

export function RefundForm({
  payment,
  store,
  save,
  close,
}: {
  payment: Row;
  store: Store;
  save: (r: Row) => Promise<boolean>;
  close: () => void;
}) {
  const refundable =
    payment.amount -
    store.payments
      .filter((p) => p.original_id === payment.id)
      .reduce((n, p) => n + p.amount, 0);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef(crypto.randomUUID());
  return (
    <Modal title="Devolución / anulación con trazabilidad" close={close}>
      <p>
        Movimiento original: {money(payment.amount)} · {payment.method}
      </p>
      <p>Disponible para devolver: {money(refundable)}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            setBusy(true);
            await save({
              p_request: request.current,
              p_visit: payment.visit_id,
              p_amount: cents(String(f.get("amount"))),
              p_method: payment.method,
              p_confirmed: true,
              p_sinpe:
                store.sinpe_numbers.find((n) => n.phone === payment.sinpe_phone)
                  ?.id || null,
              p_reference: null,
              p_original: payment.id,
              p_reason: f.get("reason"),
            });
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        }}
      >
        <Field label="Monto a devolver (₡)">
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={refundable / 100}
          />
        </Field>
        <Field label="Motivo obligatorio">
          <input name="reason" required />
        </Field>
        <p className="hint">
          Para anular un cobro erróneo, devolvé su monto completo. El movimiento
          original se conserva y el saldo se reabre.
        </p>
        {error && <p className="error">{error}</p>}
        <button className="primary full" disabled={busy || refundable <= 0}>
          Confirmar devolución
        </button>
      </form>
    </Modal>
  );
}
