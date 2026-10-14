/**
 * The 3D diorama, checked in a real browser: the same simulation and map, a
 * resident mesh for every resident, working camera controls, and an offline
 * live mode that stays empty. Presentation only; no lifecycle fact is read
 * from geometry.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const URL3D = 'http://127.0.0.1:5192/?agents=demo&hour=21&view=3d';
const server = await createServer({ server: { host: '127.0.0.1', port: 5192, strictPort: true } });
await server.listen();
let browser;
try {
  const channel = process.env.PLAYWRIGHT_CHANNEL?.trim();
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim();
  const launchOptions = { headless: true, args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] };
  if (channel) launchOptions.channel = channel;
  if (executablePath) launchOptions.executablePath = executablePath;
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1672, height: 940 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const stats = () => page.evaluate(() => window.__town.view.stats());

  await page.goto(URL3D);
  await page.waitForFunction(() => window.__town?.view?.stats().triangles > 0, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__town.sim.residents.size > 0, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__town.view.stats().residents === window.__town.sim.residents.size, null, { timeout: 20000 });

  const first = await stats();
  assert.equal(first.buildings, 14, 'every authored building and home stands in the diorama');
  assert.ok(first.triangles > 1000, 'the campus must actually draw');
  // The diorama shares the Phaser-free simulation: no game instance exists.
  assert.equal(await page.evaluate(() => Boolean(window.__town.game)), false);
  // Place names come from the Nordlys theme, as in the flat town.
  assert.equal(await page.locator('[data-goto=forge] .nm').textContent(), 'Datasenteret');
  assert.equal(await page.locator('#view-toggle').textContent(), 'View: 3D');

  await page.getByRole('button', { name: 'Director: on', exact: true }).click();
  await page.waitForFunction(() => !window.__town.view.isDirector());
  await page.locator('#overview').click();
  await page.waitForFunction(() => window.__town.view.stats().distance > 700);

  await page.locator('[data-goto=library]').click();
  await page.waitForFunction(() => window.__town.view.stats().distance < 400);
  const library = await page.evaluate(() => {
    const { map, view } = window.__town;
    const b = map.buildings.find(x => x.id === 'library');
    const t = view.stats().target;
    return { dx: Math.abs(t.x - (b.x + b.w / 2) * 16), dz: Math.abs(t.y - ((b.y + b.h) * 16 + 20)) };
  });
  assert.ok(library.dx < 40 && library.dz < 40, 'choosing a place moves the camera onto it');

  await page.locator('#overview').click();
  await page.waitForFunction(() => window.__town.view.stats().distance > 700);
  await page.getByRole('button', { name: 'Follow: off', exact: true }).click();
  await page.waitForFunction(() => window.__town.view.isFollowing());
  await page.locator('#overview').click();
  assert.equal(await page.evaluate(() => window.__town.view.isFollowing()), false);

  // Orbit, pan and zoom by hand.
  const before = await stats();
  await page.mouse.move(820, 470);
  await page.mouse.wheel(0, -600);
  await page.waitForFunction(d => window.__town.view.stats().distance < d - 20, before.distance);
  await page.mouse.move(820, 470);
  await page.mouse.down();
  await page.mouse.move(980, 470, { steps: 8 });
  await page.mouse.up();
  await page.locator('#overview').click();
  await page.waitForFunction(() => window.__town.view.stats().distance > 700);

  const rect = await page.evaluate(() => window.__town.view.getCameraRect());
  assert.ok(rect.w > 400 && rect.h > 200, 'the minimap rectangle must cover visible ground');
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 116 * 16 + 1 && rect.y + rect.h <= 76 * 16 + 1);

  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/view3d-overview.png' });
  for (const [name, x, y, distance, elevation, azimuth] of [
    ['square', 52, 36, 330, 0.55, 0.5], ['datacenter', 46, 24, 320, 0.6, -0.5],
    ['grove', 40, 48, 300, 0.58, -0.3], ['street', 52, 30, 230, 0.26, 2.3],
  ]) {
    await page.evaluate(({ x, y, distance, elevation, azimuth }) => {
      const v = window.__town.view;
      v.centerOn(x * 16, y * 16);
      v.wantDistance = distance;
      v.wantElevation = elevation;
      v.wantAzimuth = azimuth;
    }, { x, y, distance, elevation, azimuth });
    await page.waitForFunction(d => Math.abs(window.__town.view.stats().distance - d) < 8, distance);
    await page.screenshot({ path: `output/playwright/view3d-${name}.png` });
  }

  // Offline live mode must stay an empty campus, never substitute demo work.
  await page.route('**/api/town/**', route => route.abort());
  await page.goto('http://127.0.0.1:5192/?view=3d');
  await page.waitForFunction(() => window.__town?.view?.stats().triangles > 0, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__town.sim.residents.size), 0);
  assert.equal(await page.evaluate(() => window.__town.view.stats().residents), 0);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('disconnected'));
  await page.screenshot({ path: 'output/playwright/view3d-disconnected.png' });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    buildings: first.buildings, residents: first.residents, triangles: first.triangles,
    camera: 'overview, place, follow, orbit, wheel and minimap rect passed',
    offlineLive: 'empty and disconnected', pageErrors: errors,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
