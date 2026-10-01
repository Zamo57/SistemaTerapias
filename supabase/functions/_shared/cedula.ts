export type Identity = {
  cedula: string;
  nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  fuente: string;
};
export class LookupError extends Error {
  constructor(
    public code:
      | "not_found"
      | "unavailable"
      | "limited"
      | "invalid"
      | "forbidden"
      | "timeout",
    public retry = 0,
  ) {
    super(code);
  }
}
// Reconocer partículas frecuentes; cuando hay varias divisiones posibles conservar el texto.
export function splitSurnames(value: string): [string, string] {
  const text = value.trim().replace(/\s+/g, " "),
    words = text.split(" ");
  if (!text) return ["", ""];
  const prefixes = [
    "DE LA",
    "DE LAS",
    "DE LOS",
    "DEL",
    "DE",
    "VAN DER",
    "VAN DEN",
    "VAN",
    "VON",
  ];
  const unit = (v: string) =>
    !["DE", "LA", "LAS", "LOS", "DEL", "VAN", "DER", "DEN", "VON"].includes(
      v.split(" ").at(-1)!.toUpperCase(),
    ) &&
    (v.split(" ").length === 1 ||
      prefixes.some(
        (p) =>
          v.toUpperCase().startsWith(p + " ") &&
          v.split(" ").length === p.split(" ").length + 1,
      ));
  const candidates: [string, string][] = [];
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "),
      b = words.slice(i).join(" ");
    if (unit(a) && unit(b)) candidates.push([a, b]);
  }
  return candidates.length === 1 ? candidates[0] : [text, ""];
}
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export function mapGoMeta(raw: unknown, cedula: string): Identity | null {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { results?: unknown }).results)
  )
    throw new LookupError("unavailable");
  const matches = (
    raw as { results: Record<string, unknown>[] }
  ).results.filter((r) => r && text(r.cedula) === cedula);
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new LookupError("unavailable");
  const row = matches[0];
  // Campos observados en la muestra anonimizada. fullname nunca se divide.
  const nombre =
    [text(row.firstname1), text(row.firstname2)].filter(Boolean).join(" ") ||
    text(row.firstname);
  if (!nombre) throw new LookupError("unavailable");
  const separated =
    typeof row.lastname1 === "string" && typeof row.lastname2 === "string";
  const [first, second] = separated
    ? [text(row.lastname1), text(row.lastname2)]
    : splitSurnames(text(row.lastname));
  return {
    cedula,
    nombre,
    primer_apellido: first,
    segundo_apellido: second,
    fuente: "GoMeta",
  };
}
export interface LookupStore {
  reserve(
    cedula: string,
    token: string,
    poll: boolean,
  ): Promise<{ state: string; data?: Identity; retry?: number }>;
  finish(
    cedula: string,
    token: string,
    status: string,
    data?: Identity,
    retry?: number,
  ): Promise<void>;
}
export async function lookupGoMeta(
  cedula: string,
  store: LookupStore,
  options: {
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    log?: (event: Record<string, unknown>) => void;
    timeout?: number;
    onSource?: (source: "cache" | "GoMeta") => void;
  } = {},
): Promise<Identity> {
  if (!/^[0-9]{9}$/.test(cedula)) throw new LookupError("invalid");
  const token = crypto.randomUUID(),
    sleep = options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let claim = await store.reserve(cedula, token, false);
  for (let i = 0; claim.state === "waiting" && i < 20; i++) {
    await sleep(500);
    claim = await store.reserve(cedula, token, true);
  }
  if (claim.state === "cached" && claim.data) {
    options.onSource?.("cache");
    return claim.data;
  }
  if (claim.state !== "owner")
    throw new LookupError(
      claim.state === "limited"
        ? "limited"
        : claim.state === "not_found"
          ? "not_found"
          : claim.state === "forbidden"
            ? "forbidden"
            : "unavailable",
      claim.retry || 0,
    );
  const start = Date.now();
  let status = "unavailable",
    result: Identity | undefined,
    retry = 300,
    reason = "error";
  const controller = new AbortController();
  // Incluye lectura del cuerpo, no solo la recepción de cabeceras.
  const deadline = setTimeout(
    () => controller.abort(),
    options.timeout ?? 8000,
  );
  try {
    const response = await (options.fetch || fetch)(
      `https://apis.gometa.org/cedulas/${cedula}`,
      {
        signal: controller.signal,
        redirect: "error",
        headers: { Accept: "application/json" },
      },
    );
    if (response.status === 429) {
      status = "limited";
      reason = "provider_429";
      const header = response.headers.get("Retry-After");
      if (header) {
        const seconds = /^\d+$/.test(header)
          ? Number(header)
          : Math.ceil((Date.parse(header) - Date.now()) / 1000);
        if (Number.isFinite(seconds))
          retry = Math.max(1, Math.min(2147483647, seconds));
      }
    } else if (!response.ok) {
      reason = `http_${response.status}`;
    } else {
      result = mapGoMeta(await response.json(), cedula) || undefined;
      status = result ? "success" : "not_found";
      reason = result ? "success" : "no_result";
    }
  } catch {
    reason = controller.signal.aborted ? "timeout" : "unexpected_or_network";
  } finally {
    clearTimeout(deadline);
    options.log?.({ reason, status, duration_ms: Date.now() - start });
    await store.finish(cedula, token, status, result, retry);
  }
  if (result) {
    options.onSource?.("GoMeta");
    return result;
  }
  throw new LookupError(
    status === "limited"
      ? "limited"
      : status === "not_found"
        ? "not_found"
        : reason === "timeout"
          ? "timeout"
          : "unavailable",
    status === "limited" ? retry : 0,
  );
}
