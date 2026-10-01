import { expect, it } from "vitest";
import { cedulaEndpoint } from "../src/patientLookup";

it("producción llama a Supabase y no al proxy exclusivo de Vite", () => {
  expect(cedulaEndpoint("https://proyecto.example/", "000000000", false)).toBe(
    "https://proyecto.example/functions/v1/cedula/000000000",
  );
  expect(cedulaEndpoint("https://proyecto.example", "000000000", true)).toBe(
    "/api/cedula/000000000",
  );
});
