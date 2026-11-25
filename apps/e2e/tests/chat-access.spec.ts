import { expect, test, type Page } from '@playwright/test';

const PASS = 'E2e-Clave-Segura-1';
async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASS);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
}

test.describe('Chat en tiempo real', () => {
  test('dos usuarios conversan en el chat general y el mensaje llega sin recargar', async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await login(a, 'admin@e2e.test');
    await login(b, 'consulta@e2e.test');
    await a.getByRole('link', { name: 'Chat', exact: true }).click();
    await b.getByRole('link', { name: 'Chat', exact: true }).click();
    await expect(a.getByText('En línea', { exact: true })).toBeVisible();
    await expect(b.getByText('En línea', { exact: true })).toBeVisible();
    await a.getByRole('textbox', { name: 'Mensaje' }).fill('Hola desde el administrador');
    await a.getByRole('button', { name: 'Enviar' }).click();
    await expect(b.getByText('Hola desde el administrador')).toBeVisible();
    await expect(a.getByText('Hola desde el administrador')).toBeVisible();
    await b.getByRole('textbox', { name: 'Mensaje' }).fill('Recibido <b>negrita</b>');
    await b.getByRole('button', { name: 'Enviar' }).click();
    await expect(a.getByText('Recibido <b>negrita</b>')).toBeVisible(); // texto, no HTML
    // el historial persiste al recargar
    await b.reload();
    await expect(b.getByText('Hola desde el administrador')).toBeVisible();
  });
});

test.describe('Registro, recuperación de contraseña y alertas', () => {
  test('solicitar acceso: la cuenta queda pendiente y no puede ingresar; el administrador la aprueba', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Nombre completo').fill('Persona Solicitante');
    await page.getByLabel('Correo electrónico').fill('solicitante@e2e.test');
    await page.getByLabel('Contraseña', { exact: true }).fill(PASS);
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByText('administrador revisará')).toBeVisible();

    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill('solicitante@e2e.test');
    await page.getByLabel('Contraseña', { exact: true }).fill(PASS);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toContainText('Credenciales inválidas');

    const admin = await (await page.context().browser()!.newContext()).newPage();
    await login(admin, 'admin@e2e.test');
    await admin.getByRole('link', { name: 'Usuarios', exact: true }).click();
    const row = admin.getByRole('row', { name: /solicitante@e2e.test/ });
    await expect(row.getByText('Solicitud pendiente')).toBeVisible();
    await row.getByRole('button', { name: 'Aprobar acceso' }).click();
    await expect(row.getByText('Activo')).toBeVisible();
    await login(page, 'solicitante@e2e.test');
  });

  test('olvidé mi contraseña muestra una respuesta neutra y el enlace inválido se rechaza', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '¿Olvidó su contraseña?' }).click();
    await page.getByLabel('Correo electrónico').fill('nadie@e2e.test');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByText('Si el correo está registrado')).toBeVisible();

    await page.goto('/restablecer?token=' + 'x'.repeat(43));
    await page.getByLabel('Nueva contraseña', { exact: true }).fill('Otra-Clave-Nueva-9');
    await page.getByLabel('Repita la contraseña').fill('Otra-Clave-Nueva-9');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByRole('alert')).toContainText(/no es válido|venció/);
  });

  test('la campana de alertas está disponible y no falla sin datos', async ({ page }) => {
    await login(page, 'admin@e2e.test');
    await page.getByRole('button', { name: /^Alertas:/ }).click();
    await expect(page.getByRole('dialog', { name: 'Alertas' })).toContainText(/Todo al día|vencidas/);
  });
});
