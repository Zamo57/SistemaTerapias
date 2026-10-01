import { useState, type FormEvent } from "react";
import { supabase } from "./data";
export default function AccountPassword({ done }: { done: () => void }) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    if (error)
      setError(
        "No se pudo actualizar. El enlace puede haber expirado; solicitá uno nuevo.",
      );
    else done();
    setBusy(false);
  }
  return (
    <div
      className="login"
      style={{ display: "flex", justifyContent: "center" }}
    >
      <div className="login-card glass" style={{ width: 440 }}>
        <h2>Definí tu contraseña</h2>
        <p>
          Tu acceso es individual. Usá una contraseña de al menos 10 caracteres.
        </p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Nueva contraseña</span>
            <input
              required
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Confirmar contraseña</span>
            <input
              required
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            Guardar y continuar
          </button>
        </form>
      </div>
    </div>
  );
}
