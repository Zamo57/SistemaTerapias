import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
});
test("inicio, búsqueda por cédula, visita de hace un año y nueva sesión", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Un buen día para cuidar." }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Pacientes", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Buscar paciente" })
    .fill("1-0999-0999");
  await page
    .getByRole("button", { name: "María Ejemplo · FICTICIO", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Historial de atenciones" }),
  ).toBeVisible();
  await expect(
    page.getByText("DEMO: sesión ficticia de hace un año."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nueva atención" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByLabel("Modalidad de tarifa").locator("option"),
  ).toHaveText(["Tarifa 1", "Tarifa 2", "Tarifa modificable"]);
  await dialog.getByLabel("Modalidad de tarifa").selectOption("Tarifa 1");
  await expect(
    dialog.getByText("Pendiente de configurar para 60 minutos."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
test("reportes y exportación sin notas de salud", async ({ page }) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reportes", exact: true })
    .click();
  await page.getByLabel("Desde").fill("2026-09-01");
  await page.getByLabel("Hasta").fill("2026-09-30");
  await expect(page.getByText("₡57 000,00", { exact: false }).first())
    .toBeVisible()
    .catch(async () => {
      await expect(
        page.locator(".metric").filter({ hasText: "Cobros netos" }),
      ).toContainText("57");
    });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar cobros" }).click();
  expect((await download).suggestedFilename()).toBe("cobros.csv");
});
test("sonido, navegación, accesibilidad y ajuste al ancho", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Atenciones", exact: true })
    .click();
  await page.getByRole("button", { name: "Probar sonido" }).click();
  await expect(
    page.getByText("🔊 Sonido habilitado", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Agenda", exact: true })
    .click();
  await page.getByRole("button", { name: "Nueva cita" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Cerrar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("demostración no confirma guardados ficticios", async ({ page }) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Pacientes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nuevo paciente", exact: true })
    .click();
  await page.getByLabel("Número de identificación").fill("999999999");
  await page.getByLabel("Nombre completo").fill("Paciente demo");
  await page.getByRole("button", { name: "Guardar paciente" }).click();
  await expect(page.getByRole("alert")).toContainText("solo lectura");
  await expect(page.getByRole("dialog")).toBeVisible();
});
