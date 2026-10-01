import { describe, it, expect, vi } from "vitest";
import sample from "../docs/respuestas-ejemplo.json";
import {
  splitSurnames,
  mapGoMeta,
  lookupGoMeta,
  type LookupStore,
} from "../supabase/functions/_shared/cedula";
import { canApplyLookup } from "../src/patientLookup";
const cedula = "000000000"; // Solo mock: nunca consultar esta identificación al proveedor real.
function store(state = "owner"): LookupStore {
  return {
    reserve: vi.fn(async () => ({ state })),
    finish: vi.fn(async () => {}),
  };
}
const response = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
describe("GoMeta: parser y flujo simulado", () => {
  it.each([
    ["EJEMPLO PRUEBA", ["EJEMPLO", "PRUEBA"]],
    ["DE LA O PRUEBA", ["DE LA O", "PRUEBA"]],
    ["EJEMPLO VAN DER LAAT", ["EJEMPLO", "VAN DER LAAT"]],
    ["DE LA O VAN DER LAAT", ["DE LA O", "VAN DER LAAT"]],
    ["VAN DER LAAT", ["VAN DER LAAT", ""]],
    ["DE LA O", ["DE LA O", ""]],
    ["EJEMPLO PRUEBA OTRO", ["EJEMPLO PRUEBA OTRO", ""]],
    ["", ["", ""]],
  ])("separa conservadoramente %s", (input, wanted) =>
    expect(splitSurnames(input)).toEqual(wanted),
  );
  it("mapea campos realmente observados, sin partir fullname", () =>
    expect(mapGoMeta(sample, cedula)).toMatchObject({
      cedula,
      nombre: "PERSONA FICTICIA",
      primer_apellido: "EJEMPLO",
      segundo_apellido: "PRUEBA",
    }));
  it("busca coincidencia exacta, no el primer resultado", () => {
    const row = sample.results[0];
    expect(
      mapGoMeta(
        { ...sample, results: [{ ...row, cedula: "000000001" }, row] },
        cedula,
      )?.nombre,
    ).toBe("PERSONA FICTICIA");
    expect(mapGoMeta(sample, "000000002")).toBeNull();
  });
  it("rechaza datos ambiguos o inesperados", () => {
    expect(() =>
      mapGoMeta({ results: [{ cedula, fullname: "NO DIVIDIR" }] }, cedula),
    ).toThrow("unavailable");
    expect(() => mapGoMeta({ nombre: "NO DIVIDIR" }, cedula)).toThrow(
      "unavailable",
    );
    expect(() =>
      mapGoMeta(
        { ...sample, results: [sample.results[0], sample.results[0]] },
        cedula,
      ),
    ).toThrow("unavailable");
  });
  it("valida antes de reservar o consultar", async () => {
    const s = store(),
      fetch = vi.fn();
    await expect(lookupGoMeta("123", s, { fetch })).rejects.toMatchObject({
      code: "invalid",
    });
    expect(s.reserve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("caché evita consumo externo", async () => {
    const s = store();
    s.reserve = vi.fn(async () => ({
      state: "cached",
      data: mapGoMeta(sample, cedula)!,
    }));
    const fetch = vi.fn(),
      onSource = vi.fn();
    expect(await lookupGoMeta(cedula, s, { fetch, onSource })).toMatchObject({
      fuente: "GoMeta",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(onSource).toHaveBeenCalledWith("cache");
  });
  it("consulta y guarda exclusivamente el resultado mínimo", async () => {
    const s = store(),
      fetch = vi.fn(async () => response(sample));
    const onSource = vi.fn();
    await lookupGoMeta(cedula, s, { fetch, onSource });
    expect(onSource).toHaveBeenCalledWith("GoMeta");
    expect(fetch).toHaveBeenCalledOnce();
    expect(s.finish).toHaveBeenCalledWith(
      cedula,
      expect.any(String),
      "success",
      mapGoMeta(sample, cedula),
      300,
    );
  });
  it("sin resultado no guarda un éxito", async () => {
    const s = store();
    await expect(
      lookupGoMeta(cedula, s, {
        fetch: vi.fn(async () => response({ results: [] })),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(s.finish).toHaveBeenCalledWith(
      cedula,
      expect.any(String),
      "not_found",
      undefined,
      300,
    );
  });
  it("429 respeta Retry-After y no reintenta", async () => {
    const fetch = vi.fn(async () =>
        response({}, 429, { "Retry-After": "600" }),
      ),
      s = store();
    await expect(lookupGoMeta(cedula, s, { fetch })).rejects.toMatchObject({
      code: "limited",
      retry: 600,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(s.finish).toHaveBeenCalledWith(
      cedula,
      expect.any(String),
      "limited",
      undefined,
      600,
    );
  });
  it("timeout libera reserva y logs no contienen datos", async () => {
    const log = vi.fn(),
      s = store();
    const fetch = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init!.signal!.addEventListener("abort", () =>
            reject(Error("dato sensible")),
          ),
        ),
    );
    await expect(
      lookupGoMeta(cedula, s, { fetch, timeout: 10, log }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(log).toHaveBeenCalledWith({
      reason: "timeout",
      status: "unavailable",
      duration_ms: expect.any(Number),
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(cedula);
  });
  it.each([null, { results: "malformado" }])(
    "respuesta inesperada permite captura manual",
    async (raw) => {
      await expect(
        lookupGoMeta(cedula, store(), {
          fetch: vi.fn(async () => response(raw)),
        }),
      ).rejects.toMatchObject({ code: "unavailable" });
    },
  );
  it("instancias simultáneas comparten un solo proveedor", async () => {
    let claimed = false,
      data: ReturnType<typeof mapGoMeta> = null;
    const shared: LookupStore = {
      reserve: vi.fn(async () =>
        data
          ? { state: "cached", data }
          : claimed
            ? { state: "waiting" }
            : ((claimed = true), { state: "owner" }),
      ),
      finish: vi.fn(async (_c, _t, _s, d) => {
        data = d!;
      }),
    };
    const fetch = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return response(sample);
    });
    const result = await Promise.all([
      lookupGoMeta(cedula, shared, {
        fetch,
        sleep: async () => {
          await new Promise((r) => setTimeout(r, 15));
        },
      }),
      lookupGoMeta(cedula, shared, {
        fetch,
        sleep: async () => {
          await new Promise((r) => setTimeout(r, 15));
        },
      }),
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(result[0]).toEqual(result[1]);
  });
  it("límite compartido no llama a GoMeta", async () => {
    const fetch = vi.fn();
    await expect(
      lookupGoMeta(cedula, store("limited"), { fetch }),
    ).rejects.toMatchObject({ code: "limited" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rechaza respuestas antiguas y correcciones posteriores", () => {
    expect(canApplyLookup(1, 2, 0, 0)).toBe(false);
    expect(canApplyLookup(2, 2, 0, 1)).toBe(false);
    expect(canApplyLookup(2, 2, 1, 1)).toBe(true);
  });
});
