import { expect, test, type Page } from '@playwright/test';

const PASS = 'E2e-Clave-Segura-1';

async function login(page: Page, email: string, password = PASS) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}
const nav = (page: Page, name: string) => page.getByRole('link', { name, exact: true });

test.describe('Acceso y sesión', () => {
  test('credenciales incorrectas muestran un error genérico y no abren sesión', async ({ page }) => {
    await login(page, 'admin@e2e.test', 'clave-incorrecta');
    await expect(page.getByRole('alert')).toContainText('Credenciales inválidas');
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });

  test('administrador entra, ve el tablero y cierra sesión; sin sesión se vuelve al login', async ({ page }) => {
    await login(page, 'admin@e2e.test');
    await expect(page.getByRole('heading', { name: /Hola, Admin E2E/ })).toBeVisible();
    await page.reload(); // la sesión persiste (cookie HttpOnly)
    await expect(page.getByRole('heading', { name: /Hola, Admin E2E/ })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await page.goto('/clientes');
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });

  test('la cookie de sesión no es accesible desde JavaScript', async ({ page, context }) => {
    await login(page, 'admin@e2e.test');
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
    expect(await page.evaluate(() => document.cookie)).not.toContain('ignis_session');
    const c = (await context.cookies()).find((x) => x.name === 'ignis_session');
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe('Lax');
  });

  test('contraseña temporal: obliga a cambiarla antes de usar el sistema', async ({ page }) => {
    await login(page, 'nuevo@e2e.test');
    await expect(page.getByText('Debe cambiar su contraseña temporal')).toBeVisible();
    await page.goto('/clientes'); // intenta saltarse el cambio
    await expect(page.getByText('Debe cambiar su contraseña temporal')).toBeVisible();
    await page.getByLabel('Contraseña actual').fill(PASS);
    await page.getByLabel('Nueva contraseña').fill('Otra-Clave-Nueva-9');
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page.getByText('Debe cambiar su contraseña temporal')).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Hola, Usuario Nuevo/ })).toBeVisible();
  });
});

test.describe('Clientes: crear, buscar y desactivar', () => {
  test('el operativo crea un cliente, lo encuentra y el duplicado se advierte', async ({ page }) => {
    await login(page, 'operativo@e2e.test');
    await nav(page, 'Clientes').click();
    await page.getByRole('button', { name: 'Nuevo cliente' }).click();
    await page.getByLabel('Nombre comercial *').fill('Hotel Andino E2E');
    await page.getByLabel('Ciudad').fill('Quito');
    await page.getByRole('button', { name: 'Crear cliente' }).click();
    await expect(page.getByRole('heading', { name: /Hotel Andino E2E/ })).toBeVisible();

    await nav(page, 'Clientes').click();
    await page.getByLabel('Buscar clientes').fill('andino');
    await expect(page.getByRole('link', { name: 'Hotel Andino E2E' })).toBeVisible();

    // mismo nombre con otra mayúscula/tilde: debe advertir antes de duplicar
    await page.getByRole('button', { name: 'Nuevo cliente' }).click();
    await page.getByLabel('Nombre comercial *').fill('hotel ándino e2e');
    await page.getByRole('button', { name: 'Crear cliente' }).click();
    await expect(page.getByRole('button', { name: 'Guardar de todos modos' })).toBeVisible();
  });

  test('datos con HTML se muestran como texto (no se ejecutan)', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    await login(page, 'operativo@e2e.test');
    await nav(page, 'Clientes').click();
    await page.getByRole('button', { name: 'Nuevo cliente' }).click();
    await page.getByLabel('Nombre comercial *').fill('<img src=x onerror=alert(1)> Cliente XSS');
    await page.getByRole('button', { name: 'Crear cliente' }).click();
    await expect(page.getByRole('heading', { name: /Cliente XSS/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /<img src=x/ })).toBeVisible();
    expect(dialogs).toEqual([]);
  });
});

test.describe('Permisos por rol en la interfaz y en la API', () => {
  test('consulta: ve la información pero no tiene botones de edición', async ({ page }) => {
    await login(page, 'consulta@e2e.test');
    await nav(page, 'Clientes').click();
    await expect(page.getByRole('link', { name: 'Hotel Andino E2E' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo cliente' })).toHaveCount(0);
    await expect(nav(page, 'Usuarios')).toHaveCount(0);
    await expect(nav(page, 'Importar Excel')).toHaveCount(0);
  });

  test('técnico: no ve administración ni notificaciones, y la API le responde 403', async ({ page }) => {
    await login(page, 'tecnico@e2e.test');
    await expect(page.getByRole('heading', { name: /Hola, Tecnico E2E/ })).toBeVisible();
    for (const hidden of ['Usuarios', 'Importar Excel', 'Catálogos', 'Notificaciones', 'Recordatorios']) await expect(nav(page, hidden)).toHaveCount(0);
    await page.goto('/usuarios'); // URL directa: vuelve al tablero
    await expect(page.getByRole('heading', { name: /Hola, Tecnico E2E/ })).toBeVisible();
    const status = await page.evaluate(async () => (await fetch('/api/users', { headers: { 'X-Requested-With': 'ignis' } })).status);
    expect(status).toBe(403);
    const mut = await page.evaluate(async () => (await fetch('/api/clients', { method: 'POST', headers: { 'X-Requested-With': 'ignis', 'Content-Type': 'application/json' }, body: JSON.stringify({ commercialName: 'Intruso SA' }) })).status);
    expect(mut).toBe(403);
  });

  test('administrador: ve toda la administración y puede abrir usuarios y reportes', async ({ page }) => {
    await login(page, 'admin@e2e.test');
    for (const item of ['Usuarios', 'Importar Excel', 'Catálogos', 'Notificaciones', 'Recordatorios']) await expect(nav(page, item)).toBeVisible();
    await nav(page, 'Usuarios').click();
    await expect(page.getByText('operativo@e2e.test')).toBeVisible();
    await nav(page, 'Reportes').click();
    await expect(page.getByText('Mantenimientos pendientes').first()).toBeVisible();
  });

  test('un ataque CSRF simulado (envío sin la cabecera del sistema) es rechazado aunque haya sesión', async ({ page }) => {
    await login(page, 'admin@e2e.test');
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
    const status = await page.evaluate(async () => (await fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commercialName: 'Cliente CSRF' }) })).status);
    expect(status).toBe(403);
  });
});

test.describe('Calendario, seguimientos y reportes', () => {
  test('se puede abrir calendario, seguimientos, actividades y mantenimientos sin errores', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await login(page, 'admin@e2e.test');
    for (const [name, heading] of [['Calendario', /Calendario/], ['Seguimientos', /Seguimientos/], ['Actividades', /Actividades/], ['Mantenimientos', /Mantenimientos/], ['Sistemas', /Sistemas/], ['Instalaciones', /Instalaciones/]] as const) {
      await nav(page, name).click();
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('la exportación de un reporte descarga un archivo Excel', async ({ page }) => {
    await login(page, 'admin@e2e.test');
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
    await page.goto('/reportes/clients');
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Excel', exact: true }).click();
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
