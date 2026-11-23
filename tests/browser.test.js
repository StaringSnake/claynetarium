import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium, devices } from 'playwright-core';

const files = new Map([['', ['index.html', 'text/html']], ['styles.css', ['styles.css', 'text/css']],
  ['app.js', ['app.js', 'text/javascript']]]);
const prefix = '/planetarium/';
const fixed = '2024-04-08T12:00:00.000Z';
let server, browser, url;

before(async () => {
  server = createServer(async (request, response) => {
    const path = request.url.startsWith(prefix) && files.get(request.url.slice(prefix.length));
    if (!path) { response.writeHead(404).end(); return; }
    const [file, type] = path;
    try { response.writeHead(200, { 'Content-Type': type }).end(await readFile(new URL(`../dist/${file}`, import.meta.url))); }
    catch { response.destroy(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}${prefix}`;
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve) ?? resolve()); });

async function opened(t, settings, init, fixWallTime = true) {
  const context = await browser.newContext(settings);
  t.after(() => context.close());
  const page = await context.newPage();
  if (init) await page.addInitScript(init);
  if (fixWallTime) await page.clock.setFixedTime(new Date(fixed));
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push([request.method(), request.url()]));
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 5000 });
  return { page, errors, requests };
}
const region = page => page.getByRole('region', { name: 'Planetarium view' });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const clock = page => page.locator('#local-clock').getAttribute('datetime');
const heading = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 5000 });
function controlledFrames() {
  let now = 0, wall = Date.parse('2024-04-08T12:00:00.000Z'), callbacks = [];
  Date.now = () => wall;
  window.setWallTime = iso => { wall = Date.parse(iso); };
  performance.now = () => now;
  requestAnimationFrame = callback => callbacks.push(callback);
  window.stepFrames = (count, delta) => {
    for (let i = 0; i < count; i++) {
      now += delta;
      const frame = callbacks;
      callbacks = [];
      frame.forEach(callback => callback(now));
    }
  };
}
async function inCheese(page) {
  await heading(page, 'Inside the cheese wheel');
  await page.locator('#cheese').waitFor({ state: 'visible' });
  for (const id of ['sky', 'space', 'site', 'coordinates', 'clock-panel', 'sky-panel']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), false, id);
  }
  for (const name of ['Use my location', 'Pick a place', 'Try demo sky']) {
    assert.ok(await button(page, name).isEnabled(), name);
  }
}
const drag = async (page, x, y, dx, dy) => {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 }); await page.mouse.up();
};
async function touchGesture(session, steps) {
  // Model a stationary release, not a fling that Linux Chromium can use to
  // suppress the following tap. Timestamp the events without sleeping.
  const releasedAt = Date.now() / 1000;
  for (let i = 0; i < steps.length; i++) await session.send('Input.dispatchTouchEvent', {
    type: i === 0 ? 'touchStart' : 'touchMove',
    touchPoints: steps[i].map(([x, y], id) => ({ x, y, id })),
    timestamp: releasedAt - .2 - (steps.length - 1 - i) * .05,
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: releasedAt });
}
async function chooseCity(page, name) {
  await page.getByRole('searchbox', { name: 'Search built-in cities' }).fill(name);
  await button(page, 'Select').click();
  await page.locator('#site').getByText(name, { exact: true }).waitFor();
}

test('granted permission still starts in the wheel; only an explicit request applies browser coordinates', async t => {
  const { page, errors, requests } = await opened(t, {
    permissions: ['geolocation'], geolocation: { latitude: 38.722, longitude: -9.139 },
  }, () => {
    window.locationCalls = 0;
    const api = navigator.geolocation;
    const original = api.getCurrentPosition.bind(api);
    api.getCurrentPosition = (...args) => { window.locationCalls++; original(...args); };
  });
  await inCheese(page);
  const room = region(page);
  const interior = await room.screenshot();
  await room.press('ArrowRight');
  const afterKey = await room.screenshot();
  assert.notDeepEqual(afterKey, interior);
  const { x, y } = await room.boundingBox();
  await drag(page, x + 160, y + 120, 110, 36);
  assert.notDeepEqual(await room.screenshot(), afterKey);
  assert.equal(await page.evaluate(() => window.locationCalls), 0);

  const selectedAt = '2024-04-08T12:04:05.000Z';
  await page.clock.setFixedTime(new Date(selectedAt));
  await button(page, 'Use my location').click();
  await heading(page, 'Surface sky');
  await page.locator('#site').getByText('Your location', { exact: true }).waitFor();
  assert.equal(await page.locator('#coordinates').textContent(), '38.722°, -9.139°');
  assert.equal(await clock(page), selectedAt);
  assert.equal(await page.evaluate(() => window.locationCalls), 1);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0, 0, '']);
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));

  await page.reload();
  await inCheese(page);
  assert.equal(await page.evaluate(() => window.locationCalls), 0);
  assert.deepEqual(errors, []);
});

test('place picker cancellation and invalid coordinates leave the wheel; a globe pin selects the first site', async t => {
  const { page, errors } = await opened(t, {});
  await button(page, 'Pick a place').click();
  await page.getByText('Enter coordinates', { exact: true }).click();
  await page.getByLabel('Latitude').fill('91');
  await page.getByLabel('Longitude').fill('20');
  await button(page, 'Set coordinates').click();
  assert.equal(await page.getByLabel('Latitude').evaluate(input => input.validity.rangeOverflow), true);
  await inCheese(page);

  await button(page, 'Place globe pin').click();
  await heading(page, 'Pick a globe location');
  assert.equal(await page.locator('#clock-panel').isVisible(), false);
  assert.equal(await page.locator('#site').isVisible(), false);
  await region(page).click({ position: { x: 12, y: 12 } });
  await page.getByRole('status').filter({ hasText: 'No Earth surface' }).waitFor();
  await region(page).press('Escape');
  await inCheese(page);
  assert.equal(await page.getByText(/No Earth surface/).isVisible(), false);
  await button(page, 'Cancel').click();
  assert.equal(await page.getByRole('searchbox').isVisible(), false);
  await inCheese(page);

  await button(page, 'Pick a place').click();
  await button(page, 'Place globe pin').click();
  await region(page).press('Enter');
  await heading(page, 'Surface sky');
  assert.equal(await page.locator('#site').textContent(), 'Globe pin');
  assert.equal(await clock(page), fixed);
  assert.deepEqual(errors, []);
});

test('denial, browser errors and app deadline leave usable exits; timed-out and superseded callbacks are ignored', async t => {
  const { page, errors, requests } = await opened(t, {}, () => {
    window.locationRequests = [];
    navigator.geolocation.getCurrentPosition = (resolve, reject) => window.locationRequests.push({ resolve, reject });
  });
  await page.clock.install({ time: new Date(fixed) });
  const locate = () => button(page, 'Use my location').click();
  const status = text => page.getByRole('status').filter({ hasText: text }).waitFor();
  await locate();
  assert.equal(await button(page, 'Locating…').isDisabled(), true);
  await page.evaluate(() => window.locationRequests[0].reject({ code: 1 }));
  await status(/not granted/);
  await inCheese(page);

  await locate();
  await page.evaluate(() => window.locationRequests[1].reject({ code: 2 }));
  await status(/could not determine/);
  await inCheese(page);

  await locate();
  await page.evaluate(() => window.locationRequests[2].resolve({ coords: { latitude: -91, longitude: 0 } }));
  await status(/invalid position/);
  await inCheese(page);

  await locate();
  await page.clock.fastForward(10000);
  await status(/timed out/);
  await inCheese(page);

  await locate();
  await page.evaluate(() => window.locationRequests[3].resolve({ coords: { latitude: 1, longitude: 2 } }));
  assert.equal(await button(page, 'Locating…').isDisabled(), true);
  await button(page, 'Try demo sky').click();
  await heading(page, 'Surface sky');
  await page.evaluate(() => {
    const pending = window.locationRequests[4];
    pending.resolve({ coords: { latitude: 1, longitude: 2 } });
    pending.reject({ code: 1 });
  });
  assert.equal(await page.locator('#site').textContent(), 'Reykjavík · demo sky');
  assert.equal(await page.locator('#location-status').isVisible(), false);
  assert.ok(await button(page, 'Use my location').isEnabled());
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));
  assert.deepEqual(errors, []);
});

test('desktop project-subpath journey: time, sky, privacy, continuous flight, globe pin and return', async t => {
  const { page, errors, requests } = await opened(t, { viewport: { width: 1220, height: 900 } }, () => {
    window.locationCalls = 0;
    navigator.geolocation.getCurrentPosition = (_, reject) => { window.locationCalls++; reject({ code: 1 }); };
  });
  assert.equal(await page.evaluate(() => window.locationCalls), 0);
  await button(page, 'Try demo sky').click();
  await page.locator('#site').getByText('Reykjavík · demo sky', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.locationCalls), 0);
  await button(page, 'Pause').click();
  assert.equal(await clock(page), fixed);
  await region(page).press('ArrowDown');
  await region(page).press('ArrowDown');
  await page.getByLabel('Object labels').uncheck();
  await page.getByLabel('Constellation lines').uncheck();
  const phase = await page.locator('#phase').textContent();
  const pixels = () => page.locator('#sky').evaluate(canvas => {
    const { width: w, height: h } = canvas;
    const ctx = canvas.getContext('2d');
    const starPixels = ctx.getImageData(0, 0, w, h).data;
    let light = 0;
    for (let i = 0; i < starPixels.length; i += 4) {
      if (starPixels[i] === 234 && starPixels[i + 1] === 245 && starPixels[i + 2] === 255) light++;
    }
    return { light, ground: [...ctx.getImageData(w / 2, h - 5, 1, 1).data] };
  });
  const bright = await pixels();
  await page.getByRole('slider', { name: 'Daylight glare' }).fill('0');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const dim = await pixels();
  assert.ok(dim.light > bright.light, `revealed star pixels: ${JSON.stringify({ bright, dim })}`);
  assert.deepEqual(dim.ground, bright.ground);
  assert.equal(await page.locator('#phase').textContent(), phase);
  assert.equal(await clock(page), fixed);
  await button(page, 'Use my location').click();
  assert.match(await page.locator('#location-status').textContent(), /not granted/);
  await chooseCity(page, 'Tokyo');
  await page.locator('#local-clock').getByText(/21:00:00/).waitFor();
  assert.equal(await clock(page), fixed);
  await page.getByLabel('Enter local date').fill('2024-04-09');
  await page.getByLabel('Enter local time').fill('22:10:00');
  await page.waitForFunction(() => document.getElementById('local-clock').dateTime === '2024-04-09T13:10:00.000Z');
  const paused = await clock(page);
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Lifting off');
  assert.equal(await telescope(page).isVisible(), false);
  await heading(page, 'Globe view');
  assert.match(await page.locator('#view-badge').textContent(), /True Earth–Moon scale/);
  const globePixels = await region(page).screenshot();
  assert.ok(await page.evaluate(async png => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const center = ctx.getImageData(image.width / 2 - 25, image.height / 2 - 25, 50, 50).data;
    return new Set(Array.from({ length: center.length / 4 }, (_, i) => center[i * 4 + 2])).size > 4;
  }, globePixels.toString('base64')), 'the globe center contains rendered detail');
  const bounds = await region(page).boundingBox();
  await drag(page, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, 65, 20);
  await button(page, 'Zoom out').click();
  await button(page, 'Orbit overview').click();
  await page.locator('#view-badge').getByText(/Not to scale/).waitFor();
  await button(page, 'Frame Moon').click();
  await button(page, 'Frame Earth').click();
  await button(page, 'Place globe pin').click();
  await region(page).press('Enter');
  assert.equal(await page.locator('#site').textContent(), 'Globe pin');
  assert.equal(await page.locator('#coordinates').textContent(), '35.681°, 139.767°');
  await page.locator('#zone').getByText(/^UTC/).waitFor();
  await button(page, 'Return to surface ↓').click();
  await heading(page, 'Surface sky');
  assert.equal(await clock(page), paused);
  await page.getByLabel('Playback speed').selectOption('3600');
  await button(page, 'Play').click();
  await page.waitForFunction(previous => document.getElementById('local-clock').dateTime !== previous, paused);
  await button(page, 'Now').click();
  await page.waitForFunction(now => document.getElementById('local-clock').dateTime === now, fixed);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));
});

async function orbitFromCoordinates(page, latitude, longitude) {
  await button(page, 'Pick a place').click();
  await page.getByText('Enter coordinates', { exact: true }).click();
  await page.getByLabel('Latitude').fill(latitude);
  await page.getByLabel('Longitude').fill(longitude);
  await button(page, 'Set coordinates').click();
  await button(page, 'Pause').click();
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await button(page, 'Zoom in').click();
  await button(page, 'Zoom in').click();
}

function watchOrbitBake() {
  const trace = window.orbitBake = { reads: 0, frameReads: 0, uploads: 0, firstDraw: null };
  let inFrame = false, orbitContext;
  window.orbitContextLost = () => orbitContext?.isContextLost();
  const request = window.requestAnimationFrame;
  window.requestAnimationFrame = callback => request(now => {
    inFrame = true;
    try { callback(now); } finally { inFrame = false; }
  });
  const read = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    if (!this.canvas.isConnected && this.canvas.width === 1024 && this.canvas.height === 512) {
      trace.reads++;
      if (inFrame) trace.frameReads++;
      if (window.orbitBakeFault === 'readback') throw new Error('Injected atlas readback failure');
      if (window.orbitBakeFault === 'context-loss') {
        queueMicrotask(() => orbitContext.getExtension('WEBGL_lose_context').loseContext());
      }
    }
    return read.apply(this, args);
  };
  const upload = WebGL2RenderingContext.prototype.texSubImage2D;
  WebGL2RenderingContext.prototype.texSubImage2D = function (...args) {
    if (args[4] === 1024 && args[5] === 512 && ArrayBuffer.isView(args[8])) trace.uploads++;
    return upload.apply(this, args);
  };
  const draw = WebGL2RenderingContext.prototype.drawElements;
  WebGL2RenderingContext.prototype.drawElements = function (...args) {
    orbitContext ??= this;
    trace.firstDraw ??= { reads: trace.reads, uploads: trace.uploads };
    return draw.apply(this, args);
  };
}

async function orbitPatch(page, left, top, width, height) {
  await page.waitForFunction(() => window.orbitBake.uploads >= 2);
  const png = await region(page).screenshot({ scale: 'css' });
  return page.evaluate(async ({ source, left, top, width, height }) => {
    const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const patch = ctx.getImageData(image.width / 2 + left, image.height / 2 + top, width, height).data;
    const green = Array.from({ length: patch.length / 4 }, (_, i) => patch[4 * i + 1]);
    const blue = green.map((g, i) => patch[4 * i + 2] - g);
    return { greenMin: Math.min(...green), blueMargin: Math.min(...blue) };
  }, { source: png.toString('base64'), left, top, width, height });
}

test('orbit Earth keeps the South Atlantic blue at the latitude of the antimeridian-crossing Fiji coast', async t => {
  const { page } = await opened(t, { viewport: { width: 1220, height: 900 }, reducedMotion: 'reduce' }, watchOrbitBake);
  await orbitFromCoordinates(page, '-16.6', '-18');

  // A line from Fiji mistakenly drawn through Greenwich crosses this patch of open ocean.
  const colors = await orbitPatch(page, -55, -7, 30, 14);
  assert.ok(colors.greenMin > 25 && colors.blueMargin > 8,
    `South Atlantic pixels should be rendered ocean blue: ${JSON.stringify(colors)}`);
});

test('orbit Earth keeps the Caspian water surrounded by land after unwrapping Eurasia', async t => {
  const { page } = await opened(t, { viewport: { width: 1220, height: 900 }, reducedMotion: 'reduce' }, watchOrbitBake);
  await orbitFromCoordinates(page, '41', '51');

  // Sample just above the marker and farther to the west on the same latitude.
  const water = await orbitPatch(page, -9, -14, 4, 4);
  const land = await orbitPatch(page, -35, -16, 6, 6);
  assert.ok(water.blueMargin > 8 && land.blueMargin < -8,
    `Caspian water and surrounding land must differ: ${JSON.stringify({ water, land })}`);
});

test('first lift-off paints before preparing either clay atlas', async t => {
  const { page } = await opened(t, { reducedMotion: 'reduce' }, watchOrbitBake);
  await button(page, 'Try demo sky').click();
  assert.equal(await page.evaluate(() => window.orbitBake.reads), 0);
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await page.waitForFunction(() => window.orbitBake.uploads >= 2);
  await button(page, 'Frame Moon').click();
  await page.waitForFunction(() => window.orbitBake.uploads >= 4);

  const trace = await page.evaluate(() => window.orbitBake);
  assert.deepEqual(trace, { reads: 1, frameReads: 0, uploads: 4, firstDraw: { reads: 0, uploads: 0 } });
});

test('a ride before orbit draws immediately, then orbit reuses both uploaded clay atlases', { timeout: 35000 }, async t => {
  const { page, errors, requests } = await opened(t, { viewport: { width: 1220, height: 900 } }, watchOrbitBake);
  await manualSite(page, '23', '-26');
  await button(page, 'Travel').click();
  await button(page, 'Apollo 11 · Near side').click();
  await rocket(page).waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.orbitBake.uploads >= 4, null, { timeout: 16000 });
  assert.deepEqual(await page.evaluate(() => window.orbitBake), {
    reads: 1, frameReads: 0, uploads: 4, firstDraw: { reads: 0, uploads: 0 },
  });

  await skipRide(page).click();
  await heading(page, 'Lunar sky');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button(page, 'Return to Earth').click();
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await button(page, 'Frame Moon').click();
  await region(page).screenshot();
  assert.deepEqual(await page.evaluate(() => [window.orbitBake.reads, window.orbitBake.uploads]), [1, 4]);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));
});

test('the observer-free pin preview redraws itself when Earth relief is ready', async t => {
  const { page } = await opened(t, {}, watchOrbitBake);
  await button(page, 'Pick a place').click();
  await button(page, 'Place globe pin').click();
  await heading(page, 'Pick a globe location');
  await page.waitForFunction(() => window.orbitBake.uploads >= 2);
  const trace = await page.evaluate(() => window.orbitBake);
  assert.deepEqual(trace, { reads: 1, frameReads: 0, uploads: 2, firstDraw: { reads: 0, uploads: 0 } });
});

test('a failed Earth atlas keeps orbit and pinning available while the Moon atlas finishes', async t => {
  const { page, errors } = await opened(t, { reducedMotion: 'reduce' }, watchOrbitBake);
  await page.evaluate(() => { window.orbitBakeFault = 'readback'; });
  await button(page, 'Try demo sky').click();
  await button(page, 'Pause').click();
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await page.waitForFunction(() => window.orbitBake.reads === 1);

  assert.equal(await page.evaluate(() => window.orbitContextLost()), false);
  assert.equal(await button(page, 'Frame Moon').isVisible(), true);
  assert.equal(await button(page, 'Frame Moon').isEnabled(), true);
  await button(page, 'Frame Moon').click();
  await page.waitForFunction(() => window.orbitBake.uploads === 2);
  await button(page, 'Frame Earth').click();
  await button(page, 'Place globe pin').click();
  await region(page).press('Enter');
  await page.getByText('Globe pin', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => [window.orbitBake.reads, window.orbitBake.uploads]), [1, 2]);
  assert.deepEqual(errors, []);
});

test('actual WebGL context loss during atlas baking still disables orbit', async t => {
  const { page, errors } = await opened(t, { reducedMotion: 'reduce' }, watchOrbitBake);
  await page.evaluate(() => { window.orbitBakeFault = 'context-loss'; });
  await button(page, 'Try demo sky').click();
  await button(page, 'Lift off ↗').click();
  await page.getByText(/The 3D globe needs WebGL 2/).waitFor();
  await heading(page, 'Surface sky');

  assert.equal(await page.evaluate(() => window.orbitContextLost()), true);
  assert.equal(await button(page, 'Lift off ↗').isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => [window.orbitBake.reads, window.orbitBake.uploads]), [1, 0]);
  assert.deepEqual(errors, []);
});

test('emulated phone: touch drag/pinch/orbit/return, no overflow, no stale location override', async t => {
  const { page, errors } = await opened(t, { ...devices['iPhone 13'], defaultBrowserType: undefined, reducedMotion: 'reduce' }, () => {
    window.locationRequests = [];
    navigator.geolocation.getCurrentPosition = (success, reject) => {
      window.locationRequests.push({ success, reject });
    };
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await inCheese(page);
  const session = await page.context().newCDPSession(page);
  async function locate(requestCount) {
    await button(page, 'Use my location').tap();
    await button(page, 'Locating…').waitFor({ timeout: 5000 });
    assert.equal(await page.evaluate(() => window.locationRequests.length), requestCount);
  }
  const bounds = await region(page).boundingBox(), x = bounds.x + 120, y = bounds.y + 120;
  const interior = await region(page).screenshot();
  await touchGesture(session, [[[x, y]], [[x + 50, y + 22]]]);
  assert.notDeepEqual(await region(page).screenshot(), interior);
  await locate(1);
  await button(page, 'Pick a place').tap();
  await chooseCity(page, 'Sydney');
  await page.evaluate(() => window.locationRequests[0].success({ coords: { latitude: 1, longitude: -130 } }));
  assert.equal(await page.locator('#site').textContent(), 'Sydney');
  const bearing = await page.locator('#bearing').textContent();
  const surface = await region(page).boundingBox();
  await touchGesture(session, [[[surface.x + 120, surface.y + 120]], [[surface.x + 170, surface.y + 142]]]);
  await page.waitForFunction(before => document.getElementById('bearing').textContent !== before, bearing);
  await locate(2);
  await page.evaluate(() => window.locationRequests[1].reject({ code: 3 }));
  assert.match(await page.locator('#location-status').textContent(), /timed out/);
  assert.equal(await page.locator('#site').textContent(), 'Sydney');
  await locate(3);
  await page.evaluate(() => window.locationRequests[2].success({ coords: { latitude: 12, longitude: -130 } }));
  assert.equal(await page.locator('#site').textContent(), 'Your location');
  await magnify(page).tap();
  assert.equal(await magnification(page).textContent(), '2×');
  await button(page, 'Lift off ↗').tap();
  await heading(page, 'Globe view');
  assert.equal(await telescope(page).isVisible(), false);
  const orbit = await region(page).boundingBox(), ox = orbit.x + 120, oy = orbit.y + 100;
  await touchGesture(session, [[[ox, oy]], [[ox + 40, oy + 15]]]);
  await touchGesture(session, [[[ox, oy], [ox + 40, oy]], [[ox - 20, oy], [ox + 60, oy]]]);
  await button(page, 'Zoom in').tap();
  await button(page, 'Return to surface ↓').tap();
  await heading(page, 'Surface sky');
  assert.equal(await page.locator('#site').textContent(), 'Your location');
  assert.equal(await magnification(page).textContent(), '2×');
  await chooseCity(page, 'Tokyo');
  assert.equal(await magnification(page).textContent(), '1×');
  assert.deepEqual(errors, []);
});

test('WebGL unavailable leaves working sky, clock and manual location', async t => {
  const { page, errors } = await opened(t, {}, () => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : original.call(this, type, ...args);
    };
    const ellipse = CanvasRenderingContext2D.prototype.ellipse;
    window.textureEllipses = 0;
    CanvasRenderingContext2D.prototype.ellipse = function (...args) {
      if (!this.canvas.isConnected) window.textureEllipses++;
      return ellipse.apply(this, args);
    };
    Object.defineProperty(navigator, 'geolocation', { value: undefined });
  });
  await inCheese(page);
  // Sample after first paint so moving the same bake into the first frame cannot pass.
  await region(page).screenshot();
  const textureEllipses = await page.evaluate(() => window.textureEllipses);
  t.diagnostic(`Startup offscreen ellipse draws: ${textureEllipses}`);
  assert.ok(textureEllipses <= 2000, `startup texture exceeds the 2000-ellipse budget: ${textureEllipses}`);
  assert.match(await page.locator('#compatibility').textContent(), /needs WebGL 2/);
  await button(page, 'Use my location').click();
  assert.match(await page.locator('#location-status').textContent(), /unavailable/);
  await inCheese(page);
  await button(page, 'Pick a place').click();
  assert.equal(await button(page, 'Place globe pin').isDisabled(), true);
  await chooseCity(page, 'London');
  await page.locator('#zone').getByText(/Europe\/London/).waitFor();
  assert.equal(await button(page, 'Lift off ↗').isDisabled(), true);
  assert.equal(await button(page, 'Travel').isDisabled(), true);
  assert.equal(await button(page, 'Apollo 11 · Near side').isVisible(), false);
  assert.match(await page.locator('#compatibility').textContent(), /Lunar travel from Earth is unavailable/);
  await page.reload();
  await inCheese(page);
  await button(page, 'Pick a place').click();
  await page.getByText('Enter coordinates', { exact: true }).click();
  await page.getByLabel('Latitude').fill('25.125');
  await page.getByLabel('Longitude').fill('-45.5');
  await button(page, 'Set coordinates').click();
  await heading(page, 'Surface sky');
  assert.equal(await page.locator('#coordinates').textContent(), '25.125°, -45.500°');
  await page.reload();
  await inCheese(page);
  await button(page, 'Try demo sky').click();
  await page.locator('#site').getByText(/Reykjavík · demo sky/).waitFor();
  assert.deepEqual(errors, []);
});

test('globe bounds playback samples without delaying camera input or paused edits', async t => {
  const { page, errors } = await opened(t, { reducedMotion: 'reduce' }, controlledFrames, false);
  const frames = (count = 1, delta = 10) => page.evaluate(([n, ms]) => window.stepFrames(n, ms), [count, delta]);
  const badge = page.locator('#view-badge');
  const speed = page.getByLabel('Playback speed');
  await button(page, 'Try demo sky').dispatchEvent('click');
  await button(page, 'Lift off ↗').dispatchEvent('click');
  await frames();
  await heading(page, 'Globe view');
  const initial = await badge.textContent();
  await speed.evaluate(select => { select.value = '3600'; select.dispatchEvent(new Event('change')); });
  const updates = await badge.evaluate(element => {
    const observer = new MutationObserver(() => {});
    observer.observe(element, { childList: true });
    window.stepFrames(100, 10);
    const count = observer.takeRecords().length;
    observer.disconnect();
    return count;
  });
  t.diagnostic(`Distance badge updates in 100 frames over 1 s: ${updates}`);
  assert.ok(updates >= 10 && updates <= 20, `globe samples in 100 frames over 1 s: ${updates}`);
  assert.notEqual(await badge.textContent(), initial);
  const beforeOrbit = await region(page).screenshot();
  await region(page).dispatchEvent('keydown', { key: 'ArrowRight' });
  await frames(1, 1); // Only 1 ms since last astronomy sample; camera must still repaint.
  assert.notDeepEqual(await region(page).screenshot(), beforeOrbit);
  await button(page, 'Pause').dispatchEvent('click');
  await frames(1, 1);
  const beforeEdit = await badge.textContent();
  await page.getByLabel('Enter local date').evaluate(input => {
    input.value = '2024-05-26'; input.dispatchEvent(new Event('change'));
  });
  await frames(1, 1);
  assert.notEqual(await badge.textContent(), beforeEdit);
  assert.match(await clock(page), /^2024-05-26T/);
  await button(page, 'Now').dispatchEvent('click');
  await frames(1, 1);
  assert.equal(await badge.textContent(), initial);
  assert.equal(await clock(page), fixed);
  assert.deepEqual(errors, []);
});

test('playback changes speed continuously and Now restores live wall time', async t => {
  const { page, errors } = await opened(t, {}, controlledFrames, false);
  const frame = ms => page.evaluate(delta => window.stepFrames(1, delta), ms);
  const wall = iso => page.evaluate(time => window.setWallTime(time), iso);
  const speed = page.getByLabel('Playback speed');
  await button(page, 'Try demo sky').dispatchEvent('click');
  await wall('2024-04-08T12:00:04.000Z');
  await frame(10);
  assert.equal(await clock(page), '2024-04-08T12:00:04.000Z');

  await wall('2024-04-08T12:00:06.000Z');
  await speed.selectOption('60');
  await frame(0);
  assert.equal(await clock(page), '2024-04-08T12:00:06.000Z');
  await frame(1000);
  assert.equal(await clock(page), '2024-04-08T12:01:06.000Z');
  await speed.selectOption('3600');
  await frame(0);
  assert.equal(await clock(page), '2024-04-08T12:01:06.000Z');
  await frame(1000);
  assert.equal(await clock(page), '2024-04-08T13:01:06.000Z');

  await wall('2024-04-08T12:00:08.000Z');
  await button(page, 'Now').dispatchEvent('click');
  await frame(0);
  assert.equal(await clock(page), '2024-04-08T12:00:08.000Z');
  assert.equal(await speed.inputValue(), '1');
  await wall('2024-04-08T12:00:17.000Z');
  await frame(10);
  assert.equal(await clock(page), '2024-04-08T12:00:17.000Z');
  assert.ok(await button(page, 'Pause').isEnabled());
  assert.deepEqual(errors, []);
});

test('editing civil time pauses running playback at the selected instant', async t => {
  const { page, errors } = await opened(t, {}, controlledFrames, false);
  await button(page, 'Try demo sky').dispatchEvent('click');
  await page.getByLabel('Playback speed').selectOption('60');
  await page.getByLabel('Enter local time').fill('12:30:00');
  await page.evaluate(() => window.stepFrames(1, 1000));

  assert.ok(await button(page, 'Play').isEnabled());
  assert.equal(await clock(page), '2024-04-08T12:30:00.000Z');
  assert.deepEqual(errors, []);
});

test('playback stops at the range end and a site change preserves that instant', async t => {
  const { page, errors } = await opened(t, {}, controlledFrames, false);
  await button(page, 'Try demo sky').dispatchEvent('click');
  await page.getByLabel('Enter local date').fill('2100-12-31');
  await page.getByLabel('Enter local time').fill('23:59:59');
  await button(page, 'Play').dispatchEvent('click');
  await page.evaluate(() => window.stepFrames(1, 1000));

  const end = '2100-12-31T23:59:59.999Z';
  assert.equal(await clock(page), end);
  assert.ok(await button(page, 'Play').isEnabled());
  await page.getByRole('status').filter({ hasText: 'Playback stopped at the supported local date boundary.' }).waitFor();

  await chooseCity(page, 'Tokyo');
  await page.evaluate(() => window.stepFrames(1, 1000));
  assert.equal(await clock(page), end);
  assert.ok(await button(page, 'Play').isEnabled());
  await page.getByRole('status').filter({ hasText: 'The same instant falls just outside this location’s supported dates.' }).waitFor();
  assert.deepEqual(errors, []);
});

const rocket = page => page.locator('#rocket-ride');
const flag = page => page.getByRole('img', { name: 'Cheese flag planted on the ground' });
const skipRide = page => button(page, 'Skip ride');
const telescope = page => page.getByRole('group', { name: 'Surface telescope' });
const magnification = page => page.getByRole('status', { name: 'Telescope magnification' });
const magnify = page => button(page, 'Increase telescope magnification');
const reduceMagnification = page => button(page, 'Decrease telescope magnification');
const resetTelescope = page => button(page, 'Reset telescope to 1×');
const earthPaint = page => page.locator('#sky').evaluate(async canvas => {
  // View labels change synchronously, but the new observer is painted on RAF.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let lit = 0, dark = 0, shift = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] === 135 && pixels[i + 1] === 206 && pixels[i + 2] === 230) {
      lit++; shift += Math.floor(i / (4 * width)) - (height - 1) / 2;
    } else if (pixels[i] === 24 && pixels[i + 1] === 38 && pixels[i + 2] === 53) dark++;
  }
  return { lit, dark, shift };
});

async function manualSite(page, lat, lon) {
  await button(page, 'Pick a place').click();
  await page.getByText('Enter coordinates', { exact: true }).click();
  await page.getByLabel('Latitude').fill(lat);
  await page.getByLabel('Longitude').fill(lon);
  await button(page, 'Set coordinates').click();
}

test('desktop telescope enlarges the centered lunar Earth without changing its phase or observer', async t => {
  const { page, errors } = await opened(t, { viewport: { width: 1220, height: 900 }, reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2025-01-06T00:00:00.000Z'));
  assert.equal(await telescope(page).isVisible(), false);
  await button(page, 'Pick a place').click();
  await chooseCity(page, 'Tokyo');
  await button(page, 'Pause').click();
  const sunPixels = () => page.locator('#sky').evaluate(async canvas => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { width, height } = canvas;
    const pixels = canvas.getContext('2d').getImageData(width / 2 - 16, height / 2 - 16, 32, 32).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 255 && pixels[i + 1] === 240 && pixels[i + 2] === 189) count++;
    }
    return count;
  });
  const normalSun = await sunPixels();
  assert.ok(normalSun > 0);
  await magnify(page).press('Enter');
  assert.equal(await magnification(page).textContent(), '2×');
  assert.ok(await sunPixels() > 3 * normalSun);
  await button(page, 'Travel').click();
  await button(page, 'Apollo 11 · Near side').click();
  await heading(page, 'Lunar sky');
  assert.equal(await magnification(page).textContent(), '1×');
  await page.getByText('Object directions', { exact: true }).click();
  const snapshot = () => Promise.all([
    clock(page), ...['site', 'coordinates', 'bearing', 'earth-visibility', 'directions']
      .map(id => page.locator(`#${id}`).innerText()),
    button(page, 'Play').isVisible(), page.getByLabel('Playback speed').inputValue(),
  ]);
  const normal = await earthPaint(page);
  const before = await snapshot();
  assert.ok(normal.lit > 0 && normal.dark > 0, JSON.stringify(normal));

  await region(page).focus();
  await page.keyboard.press('Tab'); // Decrease
  await page.keyboard.press('Tab'); // Increase
  assert.ok(await magnify(page).evaluate(el => el.matches(':focus-visible')));
  for (const [step, key] of [[2, 'Enter'], [4, 'Space'], [8, 'Enter']]) {
    await page.keyboard.press(key);
    assert.equal(await magnification(page).textContent(), `${step}×`);
  }
  assert.equal(await magnify(page).getAttribute('aria-disabled'), 'true');
  await page.keyboard.press('Enter');
  assert.equal(await magnification(page).textContent(), '8×');
  const zoomed = await earthPaint(page);
  assert.ok(zoomed.lit + zoomed.dark > 55 * (normal.lit + normal.dark), JSON.stringify({ normal, zoomed }));
  const litFraction = ({ lit, dark }) => lit / (lit + dark);
  assert.ok(Math.abs(litFraction(zoomed) - litFraction(normal)) < .04, JSON.stringify({ normal, zoomed }));
  assert.deepEqual(await snapshot(), before);

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  assert.equal(await magnification(page).textContent(), '4×');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  assert.equal(await magnification(page).textContent(), '1×');
  assert.equal(await resetTelescope(page).getAttribute('aria-disabled'), 'true');
  assert.ok(await resetTelescope(page).evaluate(el => el.matches(':focus-visible')));
  assert.deepEqual(await snapshot(), before);
  const reset = await earthPaint(page);
  // Exact-color counts exclude antialiased edge pixels, which can differ on repaint.
  assert.ok(Math.abs((reset.lit + reset.dark) / (normal.lit + normal.dark) - 1) < .06, JSON.stringify({ normal, reset }));
  assert.ok(Math.abs(reset.shift / reset.lit - normal.shift / normal.lit) < .5, JSON.stringify({ normal, reset }));
  await magnify(page).press('Enter');
  await button(page, 'Return to Earth').click();
  await heading(page, 'Surface sky');
  assert.equal(await magnification(page).textContent(), '1×');
  assert.deepEqual(errors, []);
});

test('phone telescope works by touch during playback and cannot reveal far-side Earth', async t => {
  const { page, errors } = await opened(t, {
    ...devices['iPhone 13'], defaultBrowserType: undefined, reducedMotion: 'reduce',
  });
  await button(page, 'Try demo sky').tap();
  await page.waitForFunction(() => document.getElementById('bearing').textContent !== '');
  assert.ok(await button(page, 'Pause').isVisible());
  const initialBearing = await page.locator('#bearing').innerText();
  await magnify(page).tap();
  assert.equal(await magnification(page).textContent(), '2×');
  assert.equal(await page.locator('#bearing').innerText(), initialBearing);
  assert.ok(await button(page, 'Pause').isVisible());
  await page.clock.setFixedTime(new Date('2024-04-08T12:00:03.000Z'));
  await page.waitForFunction(() => document.getElementById('local-clock').dateTime === '2024-04-08T12:00:03.000Z');
  await button(page, 'Pause').tap();

  await button(page, 'Travel').tap();
  await button(page, 'Far-side equator').tap();
  await page.getByText(/Moon blocks the view/).waitFor();
  const normal = await earthPaint(page);
  for (const step of [2, 4, 8]) {
    await magnify(page).tap();
    assert.equal(await magnification(page).textContent(), `${step}×`);
  }
  assert.deepEqual(await earthPaint(page), normal);
  assert.deepEqual(normal, { lit: 0, dark: 0, shift: 0 });
  await reduceMagnification(page).tap();
  assert.equal(await magnification(page).textContent(), '4×');
  await resetTelescope(page).tap();
  assert.equal(await magnification(page).textContent(), '1×');
  for (const control of [magnify(page), reduceMagnification(page), resetTelescope(page)]) {
    const box = await control.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
});

test('normal-motion 3D round trip from manual coordinates completes and keeps the clock running', { timeout: 60000 }, async t => {
  const { page, errors, requests } = await opened(t, { viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' }, controlledFrames, false);
  await page.evaluate(() => {
    const phase = document.getElementById('ride-phase');
    const gl = document.getElementById('space').getContext('webgl2');
    window.runRide = async () => {
      // The software renderer may miss wall-clock deadlines. Advance through the
      // actual app RAF one frame at a time and keep every observed phase change.
      const seen = [phase.textContent];
      for (let i = 0; i < 60 && !document.getElementById('rocket-ride').hidden; i++) {
        window.stepFrames(1, i === 0 ? 3000 : 300);
        if (phase.textContent !== seen.at(-1)) seen.push(phase.textContent);
        // Keep software WebGL from queuing the entire ride in one browser task.
        // The next pointer action still needs native frames for its stability check.
        gl.finish();
        await scheduler.yield();
      }
      return seen;
    };
  });
  page.setDefaultTimeout(5000);
  await manualSite(page, '35.681', '139.767');
  await page.getByLabel('Playback speed').selectOption('60');
  await button(page, 'Travel').click();

  for (const [departure, destination, station] of [
    ['Apollo 11 · Near side', 'Lunar sky', 'Apollo 11 · Near side'],
    ['Return to Earth', 'Surface sky', 'Manual coordinates'],
  ]) {
    await button(page, departure).click();
    await rocket(page).waitFor({ state: 'visible' });
    const [width, height] = await page.locator('#space').evaluate(canvas => [canvas.width, canvas.height]);
    assert.ok(width >= 1280 && height >= 720, `${width}×${height}`);
    t.diagnostic(`1280×720 CSS viewport ride buffer: ${width}×${height}`);
    assert.equal(await flag(page).isVisible(), false);
    assert.ok(await button(page, 'Pause').isEnabled());
    const before = await clock(page);
    await page.evaluate(() => window.stepFrames(2, 300));
    const inFlight = await clock(page);
    assert.ok(Date.parse(inFlight) > Date.parse(before));
    assert.deepEqual(await page.evaluate(() => window.runRide()), [
      'Launch', 'Across space', 'Descent', 'Touchdown', 'Cheese alien', 'Crumb burst', 'Unfurling', 'Flag planted',
    ]);
    await heading(page, destination);
    assert.equal(await rocket(page).isVisible(), false);
    assert.equal(await skipRide(page).isVisible(), false);
    assert.equal(await page.locator('#site').textContent(), station);
    assert.ok(await button(page, 'Pause').isEnabled());
    const arrival = await clock(page);
    assert.ok(Date.parse(arrival) >= Date.parse(inFlight), `${destination} clock moved backwards`);
    await page.evaluate(() => window.stepFrames(1, 100));
    assert.ok(Date.parse(await clock(page)) > Date.parse(arrival));
  }
  assert.equal(await page.locator('#coordinates').textContent(), '35.681°, 139.767°');
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));
});

test('desktop lands at Apollo 11, renders two physical Earth phases, jumps in UTC and restores Tokyo', async t => {
  const { page, errors, requests } = await opened(t, { viewport: { width: 1220, height: 900 } });
  const first = '2025-01-06T00:00:00.000Z';
  await page.clock.setFixedTime(new Date(first));
  await button(page, 'Pick a place').click();
  await chooseCity(page, 'Tokyo');
  await button(page, 'Pause').click();
  await button(page, 'Travel').click();
  await button(page, 'Apollo 11 · Near side').press('Enter');
  await rocket(page).waitFor({ state: 'visible' });
  assert.equal(await skipRide(page).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Enter');
  await heading(page, 'Lunar sky');
  await flag(page).waitFor({ state: 'visible' });
  await heading(page, 'Lunar time (UTC)');
  assert.equal(await clock(page), first);
  assert.match(await page.locator('#earth-visibility').textContent(), /61% lit · 1.98° wide/);
  const fuller = await earthPaint(page);
  assert.ok(fuller.lit > fuller.dark && fuller.shift < 0, JSON.stringify(fuller));

  await button(page, 'Return to Earth').press('Enter');
  await rocket(page).waitFor({ state: 'visible' });
  await skipRide(page).press('Enter');
  await heading(page, 'Surface sky');
  await flag(page).waitFor({ state: 'visible' });
  await page.locator('#local-clock').getByText(/09:00:00/).waitFor();
  assert.equal(await page.locator('#site').textContent(), 'Tokyo');
  assert.equal(await clock(page), first);

  await page.getByLabel('Enter local date').fill('2025-01-20');
  await button(page, 'Travel').click();
  await button(page, 'Apollo 11 · Near side').click();
  await skipRide(page).click();
  await page.getByText(/33% lit · 1.82° wide/).waitFor();
  await page.waitForFunction(() => document.getElementById('bearing').textContent.includes('68° altitude'));
  const crescent = await earthPaint(page);
  assert.ok(crescent.lit < crescent.dark && crescent.shift > 0, JSON.stringify(crescent));
  for (const event of ['sunrise', 'sunset']) {
    const readout = page.locator(`#next-${event}`);
    const target = (await readout.textContent()).replace(' · ', 'T').replace(' UTC', '.000Z');
    await button(page, 'Play').click();
    await button(page, `Jump to ${event}`).click();
    await button(page, 'Play').waitFor();
    assert.equal(await clock(page), target);
    assert.notEqual(await readout.textContent(), target.replace('T', ' · ').replace('.000Z', ' UTC'));
  }
  await page.getByLabel('Enter local date').fill('2100-12-31');
  await page.getByLabel('Enter local time').fill('23:59:59');
  await page.waitForFunction(() => document.getElementById('jump-sunrise').disabled && document.getElementById('jump-sunset').disabled);
  assert.match(await page.locator('#next-sunrise').textContent(), /None before the supported UTC date limit/);
  await button(page, 'Return to Earth').click();
  await skipRide(page).click();
  assert.equal(await clock(page), '2100-12-31T23:59:59.000Z');
  assert.match(await page.locator('#clock-status').textContent(), /same instant is outside/);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));
});

test('phone touch reaches the far side, looks around, and returns with a running clock; reduced motion is immediate', async t => {
  const { page, errors } = await opened(t, { ...devices['iPhone 13'], defaultBrowserType: undefined });
  await button(page, 'Pick a place').tap();
  await chooseCity(page, 'Sydney');
  await page.getByLabel('Playback speed').selectOption('3600');
  await button(page, 'Travel').tap();
  const before = await clock(page);
  await button(page, 'Far-side equator').tap();
  await rocket(page).waitFor({ state: 'visible' });
  await skipRide(page).tap();
  await heading(page, 'Lunar sky');
  await flag(page).waitFor({ state: 'visible' });
  assert.equal(await flag(page).evaluate(el => el.getAnimations().length), 0);
  assert.ok(Date.parse(await clock(page)) > Date.parse(before));
  await page.getByText(/Moon blocks the view/).waitFor();
  assert.deepEqual(await earthPaint(page), { lit: 0, dark: 0, shift: 0 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const oldBearing = await page.locator('#bearing').textContent();
  const { x, y } = await region(page).boundingBox();
  const touch = await page.context().newCDPSession(page);
  await touchGesture(touch, [[[x + 100, y + 120]], [[x + 154, y + 55]]]);
  await page.waitForFunction(old => document.getElementById('bearing').textContent !== old, oldBearing);
  const returnedFrom = await clock(page);
  await button(page, 'Return to Earth').tap();
  await rocket(page).waitFor({ state: 'visible' });
  await skipRide(page).tap();
  await heading(page, 'Surface sky');
  await flag(page).waitFor({ state: 'visible' });
  assert.ok(Date.parse(await clock(page)) > Date.parse(returnedFrom));
  assert.ok(await button(page, 'Pause').isEnabled());

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button(page, 'Pause').tap();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const paused = await clock(page);
  await button(page, 'Travel').tap();
  await button(page, 'Far-side equator').tap();
  await heading(page, 'Lunar sky');
  assert.equal(await skipRide(page).isVisible(), false);
  assert.equal(await rocket(page).isVisible(), false);
  assert.equal(await clock(page), paused);
  await flag(page).waitFor({ state: 'visible' });
  assert.equal(await flag(page).evaluate(el => el.getAnimations().length), 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await button(page, 'Return to Earth').tap();
  await rocket(page).waitFor({ state: 'visible' });
  await page.locator('#space').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('status').filter({ hasText: '3D was interrupted' }).waitFor();
  await heading(page, 'Lunar sky');
  assert.equal(await clock(page), paused);
  assert.equal(await page.locator('#site').textContent(), 'Far-side equator');
  await button(page, 'Return to Earth').tap();
  await heading(page, 'Surface sky');
  await flag(page).waitFor({ state: 'visible' });
  assert.equal(await clock(page), paused);
  assert.equal(await page.locator('#site').textContent(), 'Sydney');
  await page.getByRole('status').filter({ hasText: '3D is unavailable' }).waitFor();
  assert.deepEqual(errors, []);
});
