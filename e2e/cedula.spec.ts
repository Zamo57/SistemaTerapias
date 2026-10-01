import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/fixtures/patient-form.html");
});
const data = {
  nombre: "PERSONA FICTICIA",
  primer_apellido: "DE LA O",
  segundo_apellido: "PRUEBA",
  fuente: "GoMeta",
};
for (const [source, message] of [
  ["cache", "Datos de caché"],
  ["GoMeta", "Respuesta recibida de GoMeta"],
]) {
  test(`distingue origen ${source}`, async ({ page }) => {
    await page.route("**/mock-cedula/*", (r) =>
      r.fulfill({ json: { data: { ...data, cedula: "000000000" }, source } }),
    );
    await page.getByLabel("Número de identificación").fill("000000000");
    await expect(page.getByRole("status")).toContainText(message);
  });
}
for (const [error, message] of [
  ["not_found", "Sin resultados"],
  ["unavailable", "Servicio no disponible"],
]) {
  test(`${error}: captura manual disponible`, async ({ page }) => {
    await page.route("**/mock-cedula/*", (r) => r.fulfill({ json: { error } }));
    await page.getByLabel("Número de identificación").fill("000000000");
    await expect(page.getByRole("status")).toContainText(message);
    await page.getByLabel("Nombre (y otros nombres)").fill("MANUAL");
    await expect(
      page.getByRole("button", { name: "Guardar paciente" }),
    ).toBeEnabled();
  });
}
test("autocompleta y mantiene campos editables sin guardar", async ({
  page,
}) => {
  await page.route("**/mock-cedula/*", (r) =>
    r.fulfill({ json: { data: { ...data, cedula: "000000000" } } }),
  );
  await page.getByLabel("Número de identificación").fill("000000000");
  await expect(page.getByLabel("Nombre (y otros nombres)")).toHaveValue(
    data.nombre,
  );
  await expect(page.getByLabel("Primer apellido")).toHaveValue("DE LA O");
  await page.getByLabel("Segundo apellido").fill("MANUAL");
  await expect(page.getByLabel("Segundo apellido")).toHaveValue("MANUAL");
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("respuesta tardía no sobrescribe correcciones manuales", async ({
  page,
}) => {
  let release!: () => void;
  const waiting = new Promise<void>((r) => (release = r));
  await page.route("**/mock-cedula/*", async (r) => {
    await waiting;
    await r.fulfill({ json: { data: { ...data, cedula: "000000000" } } });
  });
  await page.getByLabel("Número de identificación").fill("000000000");
  await expect(page.getByRole("status")).toHaveText("Buscando datos…");
  await page.getByLabel("Nombre (y otros nombres)").fill("CORRECCIÓN MANUAL");
  release();
  await expect(page.getByRole("status")).toContainText("se conservaron");
  await expect(page.getByLabel("Nombre (y otros nombres)")).toHaveValue(
    "CORRECCIÓN MANUAL",
  );
});
test("ignora respuesta de identificación anterior", async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>((r) => (release = r));
  await page.route("**/mock-cedula/*", async (r) => {
    if (r.request().url().endsWith("000000000")) {
      await waiting;
      await r.fulfill({ json: { data } });
    } else await r.fulfill({ json: { error: "not_found" } });
  });
  await page.getByLabel("Número de identificación").fill("000000000");
  await expect(page.getByRole("status")).toHaveText("Buscando datos…");
  await page.getByLabel("Número de identificación").fill("000000001");
  await expect(page.getByRole("status")).toContainText("Sin resultados");
  release();
  await page.waitForTimeout(100);
  await expect(page.getByLabel("Nombre (y otros nombres)")).toHaveValue("");
});
test("paciente existente ofrece abrir y evita duplicado", async ({ page }) => {
  await page.route("**/mock-cedula/*", (r) =>
    r.fulfill({ json: { existingId: "paciente-ficticio" } }),
  );
  await page.getByLabel("Número de identificación").fill("000000000");
  await expect(
    page.getByRole("button", { name: "Guardar paciente" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Abrir ficha existente" }).click();
  await expect(page.locator("#opened")).toHaveText("Ficha abierta");
});
test("otros documentos no consultan; fallos permiten captura manual", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/mock-cedula/*", (r) => {
    calls++;
    return r.fulfill({ json: { error: "limited" } });
  });
  await page.getByLabel("Tipo de identificación").selectOption("Pasaporte");
  await page.getByLabel("Número de identificación").fill("000000000");
  await page.waitForTimeout(500);
  expect(calls).toBe(0);
  await page.getByLabel("Tipo de identificación").selectOption("Cédula");
  await expect(page.getByRole("status")).toContainText("Límite temporal");
  await page.getByLabel("Nombre (y otros nombres)").fill("MANUAL");
  await expect(
    page.getByRole("button", { name: "Guardar paciente" }),
  ).toBeEnabled();
});
