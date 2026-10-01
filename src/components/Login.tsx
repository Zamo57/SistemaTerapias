import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { supabase } from "../data";
import { Field } from "./ui";

export function Login({
  onError,
  onNotice,
}: {
  onError: (x: string) => void;
  onNotice: (x: string) => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [recover, setRecover] = useState(
      location.hash.includes("type=recovery") ||
        location.hash.includes("type=invite"),
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = recover
      ? await supabase!.auth.updateUser({ password })
      : await supabase!.auth.signInWithPassword({ email, password });
    if (error) onError(error.message);
    else {
      onNotice("Acceso confirmado");
      setRecover(false);
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit}>
      <Field label="Correo electrónico">
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label={recover ? "Crear nueva contraseña" : "Contraseña"}>
        <input
          type="password"
          autoComplete={recover ? "new-password" : "current-password"}
          minLength={10}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <button className="primary full" disabled={busy}>
        {recover ? "Guardar contraseña" : "Ingresar"} <ArrowRight size={17} />
      </button>
      <button
        type="button"
        className="link"
        disabled={!email || busy}
        onClick={async () => {
          const { error } = await supabase!.auth.resetPasswordForEmail(email, {
            redirectTo: location.origin,
          });
          if (error) onError(error.message);
          else
            onNotice(
              "Si la cuenta existe, recibirás un enlace de recuperación.",
            );
        }}
      >
        Recuperar acceso
      </button>
    </form>
  );
}
