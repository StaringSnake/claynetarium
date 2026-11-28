import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium, devices } from 'playwright-core';
import { Vector3 } from 'three';
import { solarGuideVertices, solarReference } from './fixtures/solar-horizons.js';
import { solarDisplayPosition } from '../src/solar-display.js';
import { FULL_SYSTEM, INNER_SYSTEM, solarBodyExtent, solarCamera } from '../src/solar-view.js';

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
async function openPanel(page, name) {
  const toggle = button(page, name);
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}
const clock = page => page.locator('#local-clock').getAttribute('datetime');
const heading = (page, name) => page.getByRole('heading', { name, exact: true, level: 2 }).waitFor({ timeout: 5000 });
async function captureLayout(page, name, folder = process.env.LAYOUT_SCREENSHOTS) {
  if (!folder) return;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: `${folder}/${name}.png`, scale: 'css' });
}
function controlledFrames() {
  let now = 0, wall = Date.parse('2024-04-08T12:00:00.000Z'), callbacks = [];
  window.solarDraws = 0;
  window.guideDraws = [];
  const clear = WebGL2RenderingContext.prototype.clear;
  WebGL2RenderingContext.prototype.clear = function (mask) {
    if (document.getElementById('viewport')?.classList.contains('solar')) window.solarDraws++;
    return clear.call(this, mask);
  };
  const instanced = WebGL2RenderingContext.prototype.drawElementsInstanced;
  WebGL2RenderingContext.prototype.drawElementsInstanced = function (mode, count, type, offset, instances) {
    if (document.getElementById('viewport')?.classList.contains('solar')) window.guideDraws.push(instances);
    return instanced.call(this, mode, count, type, offset, instances);
  };
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
const solarPicker = page => page.getByRole('combobox', { name: 'Center on a Solar System body' });
async function inSolar(page) {
  await heading(page, 'Solar System');
  await page.locator('#space').waitFor({ state: 'visible' });
  for (const id of ['cheese', 'sky', 'site', 'coordinates', 'sky-panel']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), false, id);
  }
}
async function earthEntry(page, name, interaction = 'click') {
  await openPanel(page, 'Location');
  await button(page, name)[interaction]();
}
async function inEarthSky(page) {
  await heading(page, 'Surface sky');
  const sky = page.locator('#sky');
  await sky.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const sky = document.getElementById('sky');
    return getComputedStyle(sky).opacity === '1' && sky.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 255;
  });
  for (const id of ['space', 'solar-welcome', 'solar-body', 'solar-labels', 'solar-paths', 'zoom', 'view-badge']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), false, id);
  }
}
async function fallback(page) {
  await heading(page, 'Earth location');
  for (const id of ['cheese', 'space', 'solar-welcome']) assert.equal(await page.locator(`#${id}`).isVisible(), false);
  for (const name of ['Use my location', 'Pick a place', 'Try demo sky']) {
    assert.ok(await button(page, name).isEnabled(), name);
  }
}
const drag = async (page, x, y, dx, dy) => {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 }); await page.mouse.up();
};
async function touchGesture(session, steps, end = 'touchEnd') {
  // Model a stationary release, not a fling that Linux Chromium can use to
  // suppress the following tap. Timestamp the events without sleeping.
  const releasedAt = Date.now() / 1000;
  for (let i = 0; i < steps.length; i++) await session.send('Input.dispatchTouchEvent', {
    type: i === 0 ? 'touchStart' : 'touchMove',
    touchPoints: steps[i].map(([x, y], id) => ({ x, y, id })),
    timestamp: releasedAt - .2 - (steps.length - 1 - i) * .05,
  });
  await session.send('Input.dispatchTouchEvent', { type: end, touchPoints: [], timestamp: releasedAt });
}
async function wheelScene(page, delta) {
  const scene = region(page);
  await scene.scrollIntoViewIfNeeded();
  const { x, y, width, height } = await scene.boundingBox();
  await page.mouse.move(x + width / 2, y + height / 2);
  await page.mouse.wheel(0, delta);
}
async function chooseCity(page, name) {
  await openPanel(page, 'Location');
  await page.getByRole('searchbox', { name: 'Search built-in cities' }).fill(name);
  await button(page, 'Select').click();
  await page.locator('#site').getByText(name, { exact: true }).waitFor({ state: 'attached' });
}

const captureSolar = (page, name) => captureLayout(page, name, process.env.SOLAR_SCREENSHOTS);
const waitForSceneLayout = scene => scene.evaluate(view => new Promise(resolve => {
  const observer = new ResizeObserver(() => { observer.disconnect(); resolve(); });
  observer.observe(view);
}));
const solarPoints = new Map([['Sun', new Vector3()], ...solarReference[0][1].map(([body, , ...xyz]) =>
  [body, new Vector3(...solarDisplayPosition(xyz))])]);

async function solarPoint(page, radius, body) {
  const { x, y, width, height } = await region(page).boundingBox();
  const camera = solarCamera(width, height, radius, solarPoints.get('Sun'));
  const point = solarPoints.get(body).clone().project(camera);
  return [x + width * (1 + point.x) / 2, y + height * (1 - point.y) / 2];
}

async function samplePathPixels(scene, points) {
  const image = await scene.screenshot({ scale: 'css' });
  return scene.evaluate(async (_, { png, points }) => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return points.map(([x, y]) => {
      const data = ctx.getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data;
      let maxGreen = 0;
      for (let i = 1; i < data.length; i += 4) maxGreen = Math.max(maxGreen, data[i]);
      return maxGreen;
    });
  }, { png: image.toString('base64'), points });
}

// Check rendered pixels at the projections of independently sampled heliocentric coordinates.
async function solarPixels(page, radius, names, focus = 'Sun') {
  const view = region(page);
  const { width, height } = await view.boundingBox();
  const camera = solarCamera(width, height, radius, solarPoints.get(focus));
  const checks = names.map(body => {
    const { x, y } = solarPoints.get(body).clone().project(camera);
    return [body, Math.round(width * (1 + x) / 2), Math.round(height * (1 - y) / 2)];
  });
  const image = await view.screenshot({ scale: 'css' });
  const results = await page.evaluate(async ({ png, checks }) => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixel = (x, y) => ctx.getImageData(x, y, 1, 1).data;
    const brightness = ([r, g, b]) => r + g + b;
    // A nearby world can extend into a corner when the camera follows a planet.
    const background = Math.min(...[[0, 0], [image.width - 1, 0],
      [0, image.height - 1], [image.width - 1, image.height - 1]].map(([x, y]) => brightness(pixel(x, y))));
    return checks.map(([body, x, y]) => {
      const center = brightness(pixel(x, y));
      // Read across the sphere's interior, not its antialiased silhouette.
      const width = Math.min(x, image.width - x);
      const row = ctx.getImageData(x - width, y, width * 2, 1).data;
      const value = i => row[4 * i] + row[4 * i + 1] + row[4 * i + 2];
      let left = width, right = width;
      while (left > 0 && value(left - 1) > background + 30) left--;
      while (right + 1 < width * 2 && value(right + 1) > background + 30) right++;
      const quarter = Math.floor((right - left) / 4);
      const interior = [value(left + quarter), value(width), value(right - quarter)];
      return [body, center - background, right - left + 1, Math.max(...interior) - Math.min(...interior)];
    });
  }, { png: image.toString('base64'), checks });
  for (const [body, contrast] of results) assert.ok(contrast > 30, `${body} has visible pixels: ${JSON.stringify(results)}`);
  return Object.fromEntries(results.map(([body, , diameter, shading]) => [body, { diameter, shading }]));
}
const allSolarBodies = ['Sun', ...solarReference[0][1].map(([body]) => body)];

test('fresh live Solar System opens and reloads without cheese; keyboard dismissal and picking preserve playback', async t => {
  const { page, errors, requests } = await opened(t, { viewport: { width: 1220, height: 900 } }, controlledFrames, false);
  const frame = async date => page.evaluate(date => {
    window.setWallTime(date); window.stepFrames(1, 1000);
  }, date);
  await inSolar(page);
  const welcome = page.getByRole('region', { name: 'Welcome to the Solar System' });
  await welcome.waitFor();
  const picker = solarPicker(page);
  assert.equal(await picker.inputValue(), 'Sun');
  assert.deepEqual(await picker.locator('option').allTextContents(),
    ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto (dwarf planet)']);
  await frame(fixed);
  await page.getByText('Not to scale', { exact: true }).waitFor();
  await openPanel(page, 'Time');
  assert.ok(await button(page, 'Pause').isEnabled());
  await page.getByLabel('Playback speed').selectOption('3600');
  await button(page, 'Close Time').click();
  await button(page, 'Explore').press('Enter');
  assert.ok(await picker.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
  await welcome.waitFor({ state: 'hidden' });
  await frame('2024-04-08T12:00:01.000Z');
  assert.equal(await clock(page), '2024-04-08T13:00:00.000Z');
  await picker.press('p');
  assert.equal(await picker.inputValue(), 'Pluto');
  await frame('2024-04-08T12:00:02.000Z');
  assert.equal(await clock(page), '2024-04-08T14:00:00.000Z');
  await button(page, 'Full system').press('Enter');
  assert.equal(await picker.inputValue(), 'Sun');
  await earthEntry(page, 'Try demo sky');
  // Revealing Telescope changes the stage height. Let native layout deliver
  // the resize, then step the controlled frames through buffer clear and paint.
  await waitForSceneLayout(region(page));
  await page.evaluate(() => window.stepFrames(2, 0));
  await inEarthSky(page);
  assert.ok(await region(page).evaluate(el => el === document.activeElement));
  assert.equal(await clock(page), '2024-04-08T14:00:00.000Z');
  assert.equal(await page.getByLabel('Playback speed').inputValue(), '3600');
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));
  await page.reload();
  await inSolar(page);
  await welcome.waitFor();
  assert.equal(await picker.inputValue(), 'Sun');
  assert.deepEqual(errors, []);
});

test('Escape dismisses the visible welcome from body focus without taking over other controls', async t => {
  const { page, errors } = await opened(t, {});
  await inSolar(page);
  const welcome = page.getByRole('region', { name: 'Welcome to the Solar System' });
  await welcome.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'BODY');
  await page.keyboard.press('Escape');
  assert.equal(await welcome.isVisible(), false, 'Escape from body dismisses the welcome');
  assert.ok(await solarPicker(page).evaluate(el => el === document.activeElement && el.matches(':focus-visible')));

  await page.reload();
  await welcome.waitFor();
  await solarPicker(page).press('Escape');
  assert.equal(await welcome.isVisible(), true, 'the native picker keeps its Escape behavior');
  await openPanel(page, 'Time');
  await button(page, 'Close Time').press('Escape');
  await welcome.waitFor();
  assert.ok(await button(page, 'Time').evaluate(el => el === document.activeElement));
  await page.keyboard.press('Escape');
  assert.equal(await welcome.isVisible(), false);
  assert.ok(await button(page, 'Time').evaluate(el => el === document.activeElement));
  assert.deepEqual(errors, []);
});

test('solar render work is bounded and paused clock edits repaint without waiting for playback', async t => {
  const { page, errors } = await opened(t, { viewport: { width: 390, height: 664 } }, controlledFrames, false);
  const draws = (count, delta) => page.evaluate(([count, delta]) => {
    window.solarDraws = 0; window.stepFrames(count, delta);
    return window.solarDraws;
  }, [count, delta]);
  assert.equal(await draws(1, 10), 1, 'the first Solar paint shows the worlds without guides');
  assert.deepEqual(await page.evaluate(() => window.guideDraws), []);
  assert.equal(await draws(2, 10), 1, 'the next paint adds guides and then idles within the live second');
  assert.deepEqual(await page.evaluate(() => window.guideDraws.splice(0)), Array(9).fill(256));
  await openPanel(page, 'Time');
  await page.getByLabel('Playback speed').selectOption('3600');
  const accelerated = await draws(100, 10);
  t.diagnostic(`At 3600×: ${accelerated} scene paints over 100 frames spanning 1 second`);
  assert.equal(accelerated, 20, 'one scene render every 50 ms at accelerated playback');
  assert.deepEqual(await page.evaluate(() => window.guideDraws.splice(0)), Array(20 * 9).fill(256));
  await button(page, 'Pause').click();
  // Flush the pending instant from the Pause click before measuring idle work.
  await draws(1, 1);
  await page.evaluate(() => { window.guideDraws.length = 0; });
  assert.equal(await draws(100, 10), 0, 'paused view does no WebGL work');
  assert.deepEqual(await page.evaluate(() => window.guideDraws), []);
  await page.getByLabel('Enter local date').fill('2040-01-01');
  assert.equal(await draws(1, 1), 1, 'editing while paused draws on the very next frame');
  assert.match(await clock(page), /^2040-01-01T/);
  await button(page, 'Close Time').click();
  await button(page, 'Explore').click();
  await button(page, 'Inner planets').click();
  assert.ok(await draws(1, 1) > 0, 'zoom repaints without another time change');
  assert.deepEqual(errors, []);
});

for (const phone of [false, true]) test(`orbit guides render and can be picked or hidden on ${phone ? 'phone' : 'desktop'}`, async t => {
  const { page, errors } = await opened(t, phone ?
    { ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, reducedMotion: 'reduce' } :
    { viewport: { width: 1220, height: 900 }, reducedMotion: 'reduce' }, controlledFrames, false);
  const act = phone ? 'tap' : 'click';
  const input = (x, y) => (phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const step = () => page.evaluate(() => window.stepFrames(2, 16));
  const scene = region(page), picker = solarPicker(page), paths = button(page, 'Orbit paths');
  const save = async name => {
    if (process.env.SOLAR_SCREENSHOTS) await page.screenshot({
      path: `${process.env.SOLAR_SCREENSHOTS}/${phone ? 'phone' : 'desktop'}-paths-${name}.png`, scale: 'css',
    });
  };
  await openPanel(page, 'Time');
  await button(page, 'Pause')[act]();
  await button(page, 'Close Time')[act]();
  await button(page, 'Explore')[act]();
  await step();
  const { x, y, width, height } = await scene.boundingBox();
  const camera = solarCamera(width, height, FULL_SYSTEM, new Vector3());
  const local = solarGuideVertices.filter(([body]) => body === 'Pluto').map(([, , , xyz]) => {
    const point = new Vector3(...solarDisplayPosition(xyz)).project(camera);
    return [width * (1 + point.x) / 2, height * (1 - point.y) / 2];
  });
  const hit = [x + local[0][0], y + local[0][1]];
  const jupiterHit = await solarPoint(page, FULL_SYSTEM, 'Jupiter');
  const before = await samplePathPixels(scene, local);
  assert.ok(before.every(green => green > 43 && green < 140), `visible guide pixels at both Horizons projections: ${before}`);
  if (!phone) {
    const highlighted = page.locator('#solar-labels').getByText('Pluto', { exact: true });
    const burst = leave => scene.evaluate((viewport, { hit, leave }) => {
      // Production reads viewport bounds once per hover check, never per raw event.
      const bounds = viewport.getBoundingClientRect;
      let reads = 0;
      viewport.getBoundingClientRect = function () { reads++; return bounds.call(this); };
      try {
        for (let i = 0; i < 120; i++) viewport.dispatchEvent(new PointerEvent('pointermove', {
          pointerType: 'mouse', bubbles: true, clientX: i === 119 ? hit[0] : hit[0] + 30, clientY: hit[1],
        }));
        const before = reads;
        if (leave) viewport.dispatchEvent(new PointerEvent('pointerleave'));
        window.stepFrames(1, 16);
        return { before, after: reads, cursor: getComputedStyle(viewport).cursor };
      } finally { delete viewport.getBoundingClientRect; }
    }, { hit, leave });
    assert.deepEqual(await burst(true), { before: 0, after: 0, cursor: 'grab' },
      'pointer leave invalidates unprocessed input');
    assert.deepEqual(await burst(false), { before: 0, after: 1, cursor: 'pointer' },
      'the burst resolves only the latest hover at the next frame');
    await page.mouse.move(x + 10, y + 10);
    await step();
    await page.mouse.move(...hit);
    await step();
    assert.equal(await highlighted.evaluate(el => getComputedStyle(el).textDecorationLine), 'underline');
    assert.equal(await scene.evaluate(el => getComputedStyle(el).cursor), 'pointer');
    const highlightedPixels = await samplePathPixels(scene, local);
    assert.ok(highlightedPixels.every((green, i) => green > before[i] + 55));
    await save('hover');
    await page.mouse.move(x + 10, y + 10);
    await step();
    assert.deepEqual(await samplePathPixels(scene, local), before, 'leaving the guide restores its normal color');
    await page.mouse.move(...jupiterHit);
    await step();
    assert.equal(await scene.evaluate(el => getComputedStyle(el).cursor), 'pointer',
      'a frontmost globe is a hover hit even over its guide');
    assert.equal(await page.locator('#solar-labels').getByText('Jupiter', { exact: true })
      .evaluate(el => getComputedStyle(el).textDecorationLine), 'underline');
    await save('body-hover');
  }
  if (phone) {
    const session = await page.context().newCDPSession(page);
    const [hx, hy] = hit;
    await touchGesture(session, [[[hx, hy]], [[hx + 28, hy + 14]]]);
    await step();
    assert.equal(await picker.inputValue(), 'Sun', 'dragging from a guide does not pick');
    await button(page, 'Full system').tap();
    await step();
    await touchGesture(session, [[[hx, hy], [hx + 40, hy]], [[hx, hy], [hx + 80, hy]]]);
  } else await drag(page, ...hit, 16, 10);
  await step();
  assert.equal(await picker.inputValue(), 'Sun', 'the gesture release is not a guide selection');
  await picker.selectOption('Sun');
  await step();
  await input(...hit);
  await step();
  assert.equal(await picker.inputValue(), 'Pluto');
  await solarPixels(page, FULL_SYSTEM, ['Pluto'], 'Pluto');

  await button(page, 'View')[act]();
  assert.equal(await paths.getAttribute('aria-pressed'), 'true', 'default is on; focus keeps it on');
  if (phone) {
    const size = await paths.boundingBox();
    assert.ok(size.width >= 44 && size.height >= 44);
    await paths.tap();
  } else {
    await page.keyboard.press('Tab'); // Move from Close View to the first panel control.
    assert.ok(await paths.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
    await paths.press('Space');
  }
  assert.equal(await paths.getAttribute('aria-pressed'), 'false');
  await step();
  await save('off-control');
  await button(page, 'Close View')[act]();
  await picker.selectOption('Sun');
  await page.evaluate(() => { window.guideDraws.length = 0; });
  await step();
  assert.deepEqual(await page.evaluate(() => window.guideDraws), [], 'hidden paths are not submitted to WebGL');
  const hidden = await samplePathPixels(scene, local);
  assert.ok(hidden.every(green => green < 24), `background replaces guide pixels: ${hidden}`);
  await save('off-overview');
  if (!phone) {
    await page.mouse.move(...hit);
    await step();
    assert.equal(await scene.evaluate(el => getComputedStyle(el).cursor), 'grab');
    const sunHit = await solarPoint(page, FULL_SYSTEM, 'Sun');
    await page.mouse.move(...sunHit);
    await step();
    assert.equal(await scene.evaluate(el => getComputedStyle(el).cursor), 'pointer',
      'even the Sun, which has no guide, highlights with paths off');
    assert.equal(await page.locator('#solar-labels').getByText('Sun', { exact: true })
      .evaluate(el => getComputedStyle(el).textDecorationLine), 'underline');
    await page.mouse.down();
    assert.equal(await scene.evaluate(el => getComputedStyle(el).cursor), 'grabbing',
      'starting a drag clears the hover');
    await page.mouse.move(sunHit[0] + 20, sunHit[1]);
    await page.mouse.up();
    await picker.selectOption('Sun');
    await step();
  }
  await input(...hit);
  assert.equal(await picker.inputValue(), 'Sun', 'the same point cannot pick while guides are hidden');
  await input(...jupiterHit);
  await step();
  assert.equal(await picker.inputValue(), 'Jupiter', 'direct body picking is unchanged');
  await picker.selectOption('Neptune');
  await step();
  assert.equal(await picker.inputValue(), 'Neptune', 'the picker remains an unambiguous alternative');
  await picker.selectOption('Sun');
  await step();
  if (!phone) {
    await earthEntry(page, 'Pick a place');
    await button(page, 'Place globe pin').click();
    await heading(page, 'Pick a globe location');
    await openPanel(page, 'View');
    assert.equal(await paths.isVisible(), false, 'the true-scale globe has no Solar paths control');
    await button(page, 'Back to Solar System').click();
    await inSolar(page);
    await step();
  }
  await button(page, 'View')[act]();
  assert.equal(await paths.getAttribute('aria-pressed'), 'false', 'off survives focus and Sun reset');
  await paths[act]();
  await button(page, 'Close View')[act]();
  await step();
  assert.deepEqual(await samplePathPixels(scene, local), before);
  // Neptune and Pluto cross left of the Sun at the default camera angle;
  // Pluto is in front at this crossing, on both widths.
  const crossing = phone ? [68.47, 270.77] : [365.38, 466.22];
  for (let i = 0; i < 2; i++) {
    await input(x + crossing[0], y + crossing[1]);
    await step();
    assert.equal(await picker.inputValue(), 'Pluto', 'frontmost path wins repeatably where guides cross');
    await picker.selectOption('Sun');
    await step();
  }
  assert.equal(await clock(page), fixed);
  await button(page, 'View')[act]();
  await paths[act]();
  await page.reload();
  await inSolar(page);
  await openPanel(page, 'View');
  assert.equal(await paths.getAttribute('aria-pressed'), 'true', 'a new visit defaults back to on');
  assert.deepEqual(errors, []);
});

for (const phone of [false, true]) test(`3D Solar System framing, shading and zoom on ${phone ? 'phone' : 'desktop'}`, async t => {
  const { page, errors } = await opened(t, phone ?
    { ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, reducedMotion: 'reduce' } :
    { viewport: { width: 1220, height: 900 }, reducedMotion: 'reduce' }, phone ? watchOrbitBake : undefined);
  const act = phone ? 'tap' : 'click';
  await inSolar(page);
  await captureSolar(page, `${phone ? 'phone' : 'desktop'}-welcome`);
  await button(page, 'Explore')[act]();
  const full = await solarPixels(page, FULL_SYSTEM, allSolarBodies);
  await captureSolar(page, `${phone ? 'phone' : 'desktop'}-full`);
  await button(page, 'Inner planets')[act]();
  const inner = await solarPixels(page, INNER_SYSTEM, allSolarBodies.slice(0, 5));
  assert.ok(inner.Sun.diameter > full.Sun.diameter * 4);
  await captureSolar(page, `${phone ? 'phone' : 'desktop'}-inner`);
  await page.getByText('Not to scale', { exact: true }).waitFor();
  if (phone) {
    for (const target of [solarPicker(page), button(page, 'Full system'), button(page, 'Zoom in'), button(page, 'Zoom out')]) {
      const { width, height } = await target.boundingBox();
      assert.ok(width >= 44 && height >= 44);
    }
    const session = await page.context().newCDPSession(page);
    const { x, y } = await region(page).boundingBox();
    await touchGesture(session, [[[x + 110, y + 120], [x + 190, y + 120]], [[x + 70, y + 120], [x + 230, y + 120]]]);
    const closer = await solarPixels(page, INNER_SYSTEM / 2, ['Sun']);
    assert.ok(closer.Sun.diameter > inner.Sun.diameter * 1.5);
    await solarPicker(page).tap();
    // Native OS chooser contents are not scriptable in emulated Chromium.
    await solarPicker(page).selectOption('Earth');
    await page.waitForFunction(() => window.orbitBake.uploads >= 2);
    await captureSolar(page, 'phone-earth-centered');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } else {
    await wheelScene(page, 100);
    const farther = await solarPixels(page, INNER_SYSTEM * Math.exp(.2), ['Sun']);
    assert.ok(farther.Sun.diameter < inner.Sun.diameter * .9);
  }
  const body = phone ? 'Pluto' : 'Saturn';
  await solarPicker(page).selectOption(body);
  const focused = await solarPixels(page, 2.65 * solarBodyExtent(allSolarBodies.indexOf(body)), [body], body);
  assert.ok(focused[body].diameter > 30 && focused[body].shading > 20, JSON.stringify(focused));
  await captureSolar(page, `${phone ? 'phone' : 'desktop'}-${body.toLowerCase()}-centered`);
  if (phone) {
    await solarPicker(page).selectOption('Saturn');
    const saturn = await solarPixels(page, 2.65 * solarBodyExtent(allSolarBodies.indexOf('Saturn')), ['Saturn'], 'Saturn');
    assert.ok(saturn.Saturn.diameter > 30 && saturn.Saturn.shading > 20, JSON.stringify(saturn));
    await captureSolar(page, 'phone-saturn-centered');
  }
  await button(page, 'Full system')[act]();
  await solarPixels(page, FULL_SYSTEM, ['Sun', 'Pluto']);
  assert.deepEqual(errors, []);
});

test('normal Solar focus glides from the painted view, tracks the latest selection, and restores the overview', async t => {
  const { page, errors } = await opened(t, {
    viewport: { width: 1220, height: 900 }, reducedMotion: 'no-preference',
  }, controlledFrames, false);
  const step = (delta, count = 1) => page.evaluate(([count, delta]) => window.stepFrames(count, delta), [count, delta]);
  const diameter = async body => (await solarPixels(page, FULL_SYSTEM, [body], body))[body].diameter;
  const picker = solarPicker(page);
  const scene = region(page);
  await openPanel(page, 'Time');
  await button(page, 'Pause').click();
  await button(page, 'Close Time').click();
  await button(page, 'Explore').click();
  await step(1);
  const sunCenter = await solarPoint(page, FULL_SYSTEM, 'Sun');
  // At the fixed instant this view angle puts Mercury directly in front of the Sun.
  await drag(page, ...sunCenter, 271, -159);
  await step(1);
  assert.equal(await picker.inputValue(), 'Sun', 'overview drag alone does not pick');
  await page.mouse.move(sunCenter[0], sunCenter[1]);
  await step(1);
  assert.equal(await page.locator('#solar-labels').getByText('Mercury', { exact: true })
    .evaluate(el => getComputedStyle(el).textDecorationLine), 'underline', 'hover also favors the front body');
  await page.mouse.click(...sunCenter);
  assert.equal(await picker.inputValue(), 'Mercury', 'the front body wins where visible meshes overlap');
  await picker.selectOption('Sun');
  await button(page, 'Inner planets').click();
  await step(1);
  const inner = await diameter('Sun');
  const hit = await solarPoint(page, INNER_SYSTEM, 'Mars');
  await page.mouse.click(5, hit[1]);
  assert.equal(await picker.inputValue(), 'Sun', 'empty background is not a hit');
  await page.mouse.click(...hit);
  assert.equal(await picker.inputValue(), 'Mars', 'the visible globe uses the same picker state');
  await page.mouse.move(...sunCenter);
  await step(0);
  assert.equal(await scene.evaluate(el => getComputedStyle(el).cursor), 'grab',
    'hover does not introduce first-use highlight rendering into an active focus move');
  assert.equal(await diameter('Sun'), inner, 'the first frame retains the inner-system framing');
  await step(390);
  const transit = await scene.screenshot();

  await picker.selectOption('Jupiter');
  await step(0);
  assert.deepEqual(await scene.screenshot(), transit, 'retarget starts from the currently painted scene');
  await page.setViewportSize({ width: 980, height: 760 });
  await waitForSceneLayout(scene);
  await step(760, 2);
  const followed = await diameter('Jupiter');
  assert.ok(followed > 100, `latest selection reaches close-up after resize: ${followed}px`);
  const { x, y, width, height } = await scene.boundingBox();
  await page.mouse.move(x + width / 2 + 1, y + height / 2);
  await step(16);
  assert.equal(await scene.evaluate(el => getComputedStyle(el).cursor), 'pointer',
    'direct body hover resumes immediately after focus settles');
  await page.mouse.move(x + width / 2, y - 10);
  await step(16);
  const beforeDrag = await scene.screenshot();
  await drag(page, x + width / 2, y + height / 2, 150, -70);
  await step(16);
  assert.notDeepEqual(await scene.screenshot(), beforeDrag, 'drag changes the view angle');
  assert.equal(await picker.inputValue(), 'Jupiter', 'a drag starting on the globe does not pick');
  assert.ok(Math.abs(await diameter('Jupiter') - followed) < 6, 'rotating keeps the surface centered at the same zoom');
  const beforeKey = await scene.screenshot();
  await scene.press('ArrowRight');
  await step(16);
  assert.notDeepEqual(await scene.screenshot(), beforeKey, 'the focused viewport can rotate with the keyboard');
  await wheelScene(page, -100);
  await step(16);
  const zoomed = await diameter('Jupiter');
  assert.ok(zoomed > followed * 1.1, 'wheel zoom stays centered on the followed body');
  assert.equal(await clock(page), fixed);

  await openPanel(page, 'Time');
  await page.getByLabel('Playback speed').selectOption('3600');
  await button(page, 'Play').click();
  await button(page, 'Close Time').click();
  const playbackBefore = Date.parse(await clock(page));
  await step(1000, 120);
  assert.equal(Date.parse(await clock(page)) - playbackBefore, 5 * 24 * 3600 * 1000);
  assert.ok(Math.abs(await diameter('Jupiter') - zoomed) < 6, 'Jupiter stays centered as its position advances five days');
  if (process.env.SOLAR_SCREENSHOTS) {
    await scene.screenshot({ path: `${process.env.SOLAR_SCREENSHOTS}/desktop-following-jupiter.png`, scale: 'css' });
  }
  await picker.selectOption('Sun');
  await step(900);
  assert.ok(await diameter('Sun') < inner * .4, 'Sun restores wide overview rather than a Sun close-up');
  const afterReturn = Date.parse(await clock(page));
  assert.equal(afterReturn - playbackBefore, 5 * 24 * 3600 * 1000 + 900 * 3600,
    'playback advances at the same rate while returning to the Sun');
  await earthEntry(page, 'Try demo sky');
  await waitForSceneLayout(scene);
  await step(0, 2);
  await inEarthSky(page);
  assert.equal(Date.parse(await clock(page)), afterReturn);
  assert.equal(await page.getByLabel('Playback speed').inputValue(), '3600');
  t.diagnostic(`Jupiter centered ${followed}→${zoomed}px while advancing five days`);
  assert.deepEqual(errors, []);
});

test('a phone body tap animates, then switching to reduced motion finishes on the next frame', async t => {
  const { page, errors } = await opened(t, {
    ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, reducedMotion: 'no-preference',
  }, controlledFrames, false);
  const draws = (count, delta) => page.evaluate(([count, delta]) => {
    window.solarDraws = 0;
    window.stepFrames(count, delta);
    return window.solarDraws;
  }, [count, delta]);
  await openPanel(page, 'Time');
  await button(page, 'Pause').tap();
  await button(page, 'Close Time').tap();
  await button(page, 'Explore').tap();
  await button(page, 'Inner planets').tap();
  await draws(2, 16);
  const inner = (await solarPixels(page, INNER_SYSTEM, ['Sun'])).Sun.diameter;
  await page.touchscreen.tap(...await solarPoint(page, INNER_SYSTEM, 'Venus'));
  assert.equal(await solarPicker(page).inputValue(), 'Venus', 'the exact tap selects before the next frame');
  assert.equal(await draws(1, 0), 1);
  assert.equal((await solarPixels(page, INNER_SYSTEM, ['Sun'])).Sun.diameter, inner,
    'the first frame at the selection time retains the old framing');
  assert.equal(await draws(10, 16), 10, 'one render per frame during the move');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await draws(1, 16), 1);
  const settled = (await solarPixels(page, FULL_SYSTEM, ['Venus'], 'Venus')).Venus.diameter;
  assert.ok(settled > 120, 'the preference change finishes at the centered close-up');
  assert.equal(await draws(60, 16), 0, 'no transition repaints once settled while paused');
  assert.equal(await clock(page), fixed);
  assert.deepEqual(errors, []);
});

test('phone Solar drag and pinch do not pick, and a body tap follows directly with reduced motion', async t => {
  const { page, errors } = await opened(t, {
    ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, reducedMotion: 'reduce',
  }, controlledFrames, false);
  const step = (count = 1) => page.evaluate(n => window.stepFrames(n, 16), count);
  const picker = solarPicker(page);
  const scene = region(page);
  const session = await page.context().newCDPSession(page);
  await button(page, 'Explore').tap();
  await button(page, 'Inner planets').tap();
  await step(2); // Compare the same fully initialized scene before and after the gesture.
  // Clip above the overlays so transient touch feedback stays out of the
  // comparison without injecting CSS or changing the visible controls.
  const bounds = await scene.boundingBox();
  const zoom = await scene.getByRole('group', { name: 'Scene zoom' }).boundingBox();
  const badge = await scene.getByText('Not to scale', { exact: true }).boundingBox();
  const x0 = Math.ceil(bounds.x), y0 = Math.ceil(bounds.y);
  const clip = { x: x0, y: y0, width: Math.floor(bounds.x + bounds.width) - x0,
    height: Math.floor(Math.min(zoom.y, badge.y)) - y0 };
  const solarFrame = () => page.screenshot({ clip });
  const hit = await solarPoint(page, INNER_SYSTEM, 'Venus');
  const [x, y] = hit;
  const original = await solarFrame();
  const sun = await solarPoint(page, INNER_SYSTEM, 'Sun');
  await touchGesture(session, [[sun], [[sun[0] - 55, sun[1] - 30]], [sun]]);
  await step();
  assert.equal(await picker.inputValue(), 'Sun');
  assert.ok((await solarFrame()).equals(original), 'round trip restores the angle without selecting the Sun');
  await touchGesture(session, [[hit], [[x + 40, y + 35]], [[x + 85, y + 55]]]);
  await step();
  assert.equal(await picker.inputValue(), 'Sun');
  assert.notDeepEqual(await solarFrame(), original, 'touch drag visibly rotates the overview');
  await button(page, 'Full system').tap();
  await button(page, 'Inner planets').tap();
  await step();
  await touchGesture(session, [[hit, [x - 42, y]], [[x + 20, y], [x - 62, y]]]);
  await step();
  assert.equal(await picker.inputValue(), 'Sun');
  const pinched = (await solarPixels(page, INNER_SYSTEM, ['Sun'])).Sun.diameter;
  assert.ok(pinched > 85, 'pinch increases the diameter without changing the target');
  const innerHit = await solarPoint(page, INNER_SYSTEM * 42 / 82, 'Venus');
  await page.touchscreen.tap(...innerHit);
  await step();
  assert.equal(await picker.inputValue(), 'Venus');
  const closeup = (await solarPixels(page, FULL_SYSTEM, ['Venus'], 'Venus')).Venus.diameter;
  assert.ok(closeup > 120, 'one frame reaches the centered close-up with reduced motion');
  if (process.env.SOLAR_SCREENSHOTS) {
    await scene.screenshot({ path: `${process.env.SOLAR_SCREENSHOTS}/phone-following-venus.png`, scale: 'css' });
  }
  const center = await solarPoint(page, FULL_SYSTEM, 'Sun');
  const [cx, cy] = center;
  await touchGesture(session, [[center], [[cx + 45, cy - 30]], [[cx + 70, cy - 40]]]);
  await step();
  assert.ok(Math.abs((await solarPixels(page, FULL_SYSTEM, ['Venus'], 'Venus')).Venus.diameter - closeup) < 6);
  await touchGesture(session, [[[cx - 40, cy], [cx + 40, cy]], [[cx - 56, cy], [cx + 56, cy]]]);
  await step();
  assert.equal(await picker.inputValue(), 'Venus');
  assert.ok((await solarPixels(page, FULL_SYSTEM, ['Venus'], 'Venus')).Venus.diameter > closeup * 1.25);
  await picker.selectOption('Sun');
  await step();
  assert.ok((await solarPixels(page, FULL_SYSTEM, ['Sun', 'Pluto'])).Sun.diameter < pinched / 5);
  t.diagnostic(`Touch drag rotated without picking; pinch kept Sun selected; tap centered Venus at ${closeup}px in one frame`);
  assert.deepEqual(errors, []);
});

test('desktop viewport panels open and dismiss without resetting aim or paused time', async t => {
  const { page, errors } = await opened(t, { viewport: { width: 1220, height: 900 }, reducedMotion: 'reduce' });
  const location = button(page, 'Location');
  await inSolar(page);
  assert.equal(await location.getAttribute('aria-expanded'), 'false');
  await captureLayout(page, 'desktop-first-visit');
  await earthEntry(page, 'Try demo sky');
  assert.equal(await location.getAttribute('aria-expanded'), 'false');
  const scene = region(page);
  const before = await scene.boundingBox();
  assert.equal(before.width, 1220);
  assert.ok(before.height >= 690, `scene should occupy most of 900 CSS px, got ${before.height}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), 900);
  await captureLayout(page, 'desktop-earth-collapsed');

  const time = button(page, 'Time');
  await time.press('Enter');
  const closeTime = button(page, 'Close Time');
  assert.ok(await closeTime.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
  await button(page, 'Pause').click();
  await closeTime.press('Escape');
  assert.equal(await time.getAttribute('aria-expanded'), 'false');
  assert.ok(await time.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
  const initialAim = await page.locator('#bearing').textContent();
  await scene.press('ArrowRight');
  await page.waitForFunction(before => document.getElementById('bearing').textContent !== before, initialAim);
  const aim = await page.locator('#bearing').textContent();

  await openPanel(page, 'Location');
  await openPanel(page, 'Travel');
  assert.equal(await location.getAttribute('aria-expanded'), 'false');
  assert.equal(await button(page, 'Travel').getAttribute('aria-expanded'), 'true');
  await captureLayout(page, 'desktop-earth-travel');
  await button(page, 'Close Travel').click();
  assert.ok(await button(page, 'Travel').evaluate(el => el === document.activeElement));
  assert.deepEqual(await scene.boundingBox(), before);
  assert.equal(await page.locator('#bearing').textContent(), aim);
  assert.equal(await clock(page), fixed);

  await button(page, 'Telescope').click();
  await telescopeRange(page).fill('8');
  assert.deepEqual(await scene.boundingBox(), before);
  await captureLayout(page, 'desktop-earth-telescope');
  await openPanel(page, 'Travel');
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await openPanel(page, 'View');
  const badge = page.locator('#view-badge');
  await badge.getByText(/True Earth–Moon scale/).waitFor();
  const badgeBox = await badge.boundingBox();
  const orbitPanel = await page.getByRole('region', { name: 'View', exact: true }).boundingBox();
  assert.ok(orbitPanel.y + orbitPanel.height <= badgeBox.y);
  await captureLayout(page, 'desktop-orbit-view');
  await openPanel(page, 'Travel');
  await button(page, 'Return to surface ↓').click();
  await heading(page, 'Surface sky');
  await openPanel(page, 'Travel');
  await button(page, 'Apollo 11 · Near side').click();
  await heading(page, 'Lunar sky');
  assert.equal(await button(page, 'Travel').getAttribute('aria-expanded'), 'false');
  await captureLayout(page, 'desktop-lunar-collapsed');
  assert.equal(await clock(page), fixed);
  assert.deepEqual(errors, []);
});

test('phone panels stay in the viewport and scroll without changing telescope zoom', async t => {
  const { page, errors } = await opened(t, { ...devices['iPhone 13'], defaultBrowserType: undefined, reducedMotion: 'reduce' });
  await inSolar(page);
  await captureLayout(page, 'phone-first-visit');
  await earthEntry(page, 'Try demo sky', 'tap');
  await inEarthSky(page);
  const scene = region(page);
  await captureLayout(page, 'phone-earth-collapsed');
  const bounds = await scene.boundingBox();
  const { width, height } = page.viewportSize();
  assert.ok(bounds.height >= height * .65 && bounds.width === width, JSON.stringify(bounds));
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), height);
  await button(page, 'Telescope').tap();
  await telescopeRange(page).fill('8');
  await captureLayout(page, 'phone-earth-telescope');
  await button(page, 'Time').tap();
  const panel = page.getByRole('region', { name: 'Time', exact: true });
  const box = await panel.boundingBox();
  const session = await page.context().newCDPSession(page);
  const x = box.x + 10, y = box.y + box.height - 28;
  await touchGesture(session, [[[x, y]], [[x, y - 90]], [[x, y - 150]]]);
  await page.waitForFunction(() => document.getElementById('clock-panel').scrollTop > 0);
  assert.equal(await telescopeRange(page).inputValue(), '8');
  await captureLayout(page, 'phone-earth-time');
  for (const target of [button(page, 'Time'), button(page, 'Close Time')]) {
    const { width, height } = await target.boundingBox();
    assert.ok(width >= 44 && height >= 44);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await button(page, 'Close Time').tap();
  assert.equal(await button(page, 'Time').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(await scene.boundingBox(), bounds);
  await page.setViewportSize({ width: 320, height: 568 });
  assert.deepEqual(await page.evaluate(() => [
    document.documentElement.scrollWidth, document.documentElement.scrollHeight,
  ]), [320, 568]);
  assert.ok((await telescopeRange(page).boundingBox()).width >= 44);
  assert.deepEqual(errors, []);
});

test('mobile canvas buffers resize once per effective size and ignore unchanged notifications', async t => {
  const { page, errors } = await opened(t, {
    viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  }, () => {
    const NativeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback) {
        super(callback);
        window.repeatSceneObservation = () => callback([], this);
      }
    };
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = matchMedia(query);
      // CDP DPR-only overrides can change the value without dispatching a change event.
      if (query.startsWith('(resolution:')) window.sceneDprQuery = result;
      return result;
    };
    window.canvasSizeWrites = { sky: 0, space: 0 };
    for (const property of ['width', 'height']) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
      Object.defineProperty(HTMLCanvasElement.prototype, property, {
        ...descriptor,
        set(value) {
          if (Object.hasOwn(window.canvasSizeWrites, this.id)) window.canvasSizeWrites[this.id]++;
          descriptor.set.call(this, value);
        },
      });
    }
  });
  const frames = () => page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }));
  const writes = () => page.evaluate(() => ({ ...window.canvasSizeWrites }));
  const reset = () => page.evaluate(() => { window.canvasSizeWrites.sky = window.canvasSizeWrites.space = 0; });
  const assertBuffers = async scale => {
    await page.waitForFunction(scale => {
      const { clientWidth: w, clientHeight: h } = document.getElementById('viewport');
      const sky = document.getElementById('sky'), space = document.getElementById('space');
      return sky.width === Math.round(w * scale) && sky.height === Math.round(h * scale) &&
        space.width === Math.floor(w * scale) && space.height === Math.floor(h * scale);
    }, scale, { timeout: 5000 });
  };

  await assertBuffers(2);
  await earthEntry(page, 'Try demo sky', 'tap');
  await openPanel(page, 'Time');
  await button(page, 'Pause').tap();
  await button(page, 'Close Time').tap();
  await frames();
  await reset();
  for (const name of ['Location', 'Time', 'Travel', 'View']) {
    await button(page, name).tap();
    await button(page, `Close ${name}`).tap();
  }
  await frames();
  assert.deepEqual(await writes(), { sky: 0, space: 0 }, 'panel toggles keep both backing buffers');

  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) {
      window.repeatSceneObservation();
      window.dispatchEvent(new Event('resize'));
    }
  });
  await frames();
  const duplicateWrites = await writes();
  t.diagnostic(`Six duplicate observations at DPR 2: ${JSON.stringify(duplicateWrites)} dimension writes`);
  assert.deepEqual(duplicateWrites, { sky: 0, space: 0 });

  const session = await page.context().newCDPSession(page);
  async function emulate(width, height, deviceScaleFactor, landscape) {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor, mobile: true,
      screenOrientation: { type: landscape ? 'landscapePrimary' : 'portraitPrimary', angle: landscape ? 90 : 0 },
    });
    await frames();
    await page.evaluate(() => {
      const query = window.sceneDprQuery;
      if (!query.matches) query.dispatchEvent(new MediaQueryListEvent('change', { media: query.media }));
    });
    await frames();
  }
  await emulate(390, 664, 3, false);
  assert.equal(await page.evaluate(() => devicePixelRatio), 3);
  await assertBuffers(2);
  assert.deepEqual(await writes(), { sky: 0, space: 0 }, 'DPR 3 is capped to the existing scale');

  await emulate(664, 390, 3, true);
  assert.equal(await page.evaluate(() => screen.orientation.type), 'landscape-primary');
  await assertBuffers(2);
  const orientationWrites = await writes();
  t.diagnostic(`Portrait to landscape at DPR 3 (capped to 2): ${JSON.stringify(orientationWrites)} dimension writes`);
  assert.deepEqual(orientationWrites, { sky: 2, space: 2 }, 'one width/height pair per canvas');

  await reset();
  const burst = await page.evaluate(() => {
    const scene = document.getElementById('viewport');
    const width = scene.clientWidth;
    // Deliver several real intermediate layouts in a single render opportunity.
    for (const next of [width - 4, width - 8, width - 12]) {
      scene.style.width = `${next}px`;
      window.repeatSceneObservation();
      window.dispatchEvent(new Event('resize'));
    }
    return window.canvasSizeWrites.sky;
  });
  assert.equal(burst, 0, 'notifications defer canvas writes until the frame');
  await assertBuffers(2);
  await frames();
  assert.deepEqual(await writes(), { sky: 1, space: 2 }, 'only the final geometry is applied');
  await region(page).evaluate(scene => scene.style.removeProperty('width'));
  await assertBuffers(2);
  await frames();

  await reset();
  const viewport = await region(page).boundingBox();
  await emulate(664, 390, 1.5, true);
  assert.equal(await page.evaluate(() => devicePixelRatio), 1.5);
  await assertBuffers(1.5);
  await frames();
  assert.equal(await page.evaluate(() => window.sceneDprQuery.media), '(resolution: 1.5dppx)');
  assert.deepEqual(await region(page).boundingBox(), viewport, 'DPR changed without a CSS resize');
  assert.deepEqual(await writes(), { sky: 2, space: 2 });
  await page.waitForFunction(() => {
    const sky = document.getElementById('sky');
    return sky.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 255;
  });
  assert.deepEqual(errors, []);
});

test('the scene keeps its mode-specific accessible description when View closes', async t => {
  const { page, errors } = await opened(t, { reducedMotion: 'reduce' });
  const session = await page.context().newCDPSession(page);
  const { root } = await session.send('DOM.getDocument');
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#viewport' });
  const description = async () => {
    const { nodes: [scene] } = await session.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    assert.equal(scene.name.value, 'Planetarium view');
    return scene.description?.value;
  };
  async function check(pattern) {
    const closed = await description();
    assert.match(closed, pattern);
    assert.ok(await region(page).evaluate(scene => {
      const help = document.getElementById(scene.getAttribute('aria-describedby'));
      return help && !help.closest('[hidden]');
    }), 'the description source is outside the collapsed panel');
    await openPanel(page, 'View');
    assert.ok(await page.getByRole('region', { name: 'View', exact: true }).getByText(closed, { exact: true }).isVisible());
    assert.equal(await description(), closed);
    await button(page, 'Close View').click();
    assert.equal(await description(), closed);
  }
  await check(/Drag or use arrow keys to orbit.*Click or tap a world or its orbit path, or use the body picker/);
  await openPanel(page, 'Location');
  await button(page, 'Try demo sky').click();
  await check(/Open Telescope/);
  await button(page, 'Telescope').click();
  await check(/Scroll or pinch to zoom/);
  await openPanel(page, 'Travel');
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await check(/use arrow keys to orbit/);
  assert.deepEqual(errors, []);
});

test('granted permission still starts in the Solar System; only an explicit request applies browser coordinates', async t => {
  const { page, errors, requests } = await opened(t, {
    permissions: ['geolocation'], geolocation: { latitude: 38.722, longitude: -9.139 },
  }, () => {
    window.locationCalls = 0;
    const api = navigator.geolocation;
    const original = api.getCurrentPosition.bind(api);
    api.getCurrentPosition = (...args) => { window.locationCalls++; original(...args); };
  });
  await inSolar(page);
  assert.equal(await page.evaluate(() => window.locationCalls), 0);

  const selectedAt = '2024-04-08T12:04:05.000Z';
  await page.clock.setFixedTime(new Date(selectedAt));
  await earthEntry(page, 'Use my location');
  await inEarthSky(page);
  await page.locator('#site').getByText('Your location', { exact: true }).waitFor({ state: 'attached' });
  assert.equal(await page.locator('#coordinates').textContent(), '38.722°, -9.139°');
  assert.equal(await clock(page), selectedAt);
  assert.equal(await page.evaluate(() => window.locationCalls), 1);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0, 0, '']);
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));

  await page.reload();
  await inSolar(page);
  assert.equal(await page.evaluate(() => window.locationCalls), 0);
  assert.deepEqual(errors, []);
});

test('place picker cancellation and invalid coordinates preserve the Solar System; a globe pin selects the first site', async t => {
  const { page, errors } = await opened(t, {});
  await earthEntry(page, 'Pick a place');
  await page.getByText('Enter coordinates', { exact: true }).click();
  await page.getByLabel('Latitude').fill('91');
  await page.getByLabel('Longitude').fill('20');
  await button(page, 'Set coordinates').click();
  assert.equal(await page.getByLabel('Latitude').evaluate(input => input.validity.rangeOverflow), true);
  await inSolar(page);

  await button(page, 'Place globe pin').click();
  await heading(page, 'Pick a globe location');
  assert.equal(await page.locator('#clock-panel').isVisible(), false);
  assert.equal(await page.locator('#site').isVisible(), false);
  await region(page).click({ position: { x: 12, y: 12 } });
  await page.getByRole('status').filter({ hasText: 'No Earth surface' }).waitFor();
  await region(page).press('Escape');
  await inSolar(page);
  assert.equal(await page.getByText(/No Earth surface/).isVisible(), false);
  await button(page, 'Cancel').click();
  assert.equal(await page.getByRole('searchbox').isVisible(), false);
  await inSolar(page);

  await button(page, 'Pick a place').click();
  await button(page, 'Place globe pin').click();
  await page.waitForFunction(() => document.getElementById('sky').style.opacity === '0');
  await page.evaluate(() => {
    window.addEventListener('keydown', () => {
      const sky = document.getElementById('sky');
      window.pinEntrySkyOpacity = getComputedStyle(sky).opacity;
    }, { once: true });
  });
  await region(page).press('Enter');
  assert.equal(await page.evaluate(() => window.pinEntrySkyOpacity), '1', 'first pin must not inherit the globe fade');
  await inEarthSky(page);
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
  const locate = () => earthEntry(page, 'Use my location');
  const status = text => page.getByRole('status').filter({ hasText: text }).waitFor();
  await locate();
  assert.equal(await button(page, 'Locating…').isDisabled(), true);
  await page.evaluate(() => window.locationRequests[0].reject({ code: 1 }));
  await status(/not granted/);
  await inSolar(page);

  await locate();
  await page.evaluate(() => window.locationRequests[1].reject({ code: 2 }));
  await status(/could not determine/);
  await inSolar(page);

  await locate();
  await page.evaluate(() => window.locationRequests[2].resolve({ coords: { latitude: -91, longitude: 0 } }));
  await status(/invalid position/);
  await inSolar(page);

  await locate();
  await page.clock.fastForward(10000);
  await status(/timed out/);
  await inSolar(page);

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
  await openPanel(page, 'Location');
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
  await earthEntry(page, 'Try demo sky');
  await page.locator('#site').getByText('Reykjavík · demo sky', { exact: true }).waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => window.locationCalls), 0);
  await openPanel(page, 'Time');
  await button(page, 'Pause').click();
  assert.equal(await clock(page), fixed);
  await region(page).press('ArrowDown');
  await region(page).press('ArrowDown');
  // Aim toward Aldebaran; the taller canvas has a narrower horizontal field.
  for (let i = 0; i < 4; i++) await region(page).press('ArrowLeft');
  await openPanel(page, 'View');
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
  await openPanel(page, 'Location');
  await button(page, 'Use my location').click();
  assert.match(await page.locator('#location-status').textContent(), /not granted/);
  await chooseCity(page, 'Tokyo');
  await openPanel(page, 'Time');
  await page.locator('#local-clock').getByText(/21:00:00/).waitFor();
  assert.equal(await clock(page), fixed);
  await page.getByLabel('Enter local date').fill('2024-04-09');
  await page.getByLabel('Enter local time').fill('22:10:00');
  await page.waitForFunction(() => document.getElementById('local-clock').dateTime === '2024-04-09T13:10:00.000Z');
  const paused = await clock(page);
  await openPanel(page, 'Travel');
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
  await openPanel(page, 'View');
  await button(page, 'Orbit overview').click();
  await page.locator('#view-badge').getByText(/Not to scale/).waitFor();
  await button(page, 'Frame Moon').click();
  await button(page, 'Frame Earth').click();
  await openPanel(page, 'Location');
  await button(page, 'Place globe pin').click();
  await region(page).press('Enter');
  assert.equal(await page.locator('#site').textContent(), 'Globe pin');
  assert.equal(await page.locator('#coordinates').textContent(), '35.681°, 139.767°');
  await page.locator('#zone').getByText(/^UTC/).waitFor({ state: 'attached' });
  await openPanel(page, 'Travel');
  await button(page, 'Return to surface ↓').click();
  await heading(page, 'Surface sky');
  assert.equal(await clock(page), paused);
  await openPanel(page, 'Time');
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
  await earthEntry(page, 'Pick a place');
  await page.getByText('Enter coordinates', { exact: true }).click();
  await page.getByLabel('Latitude').fill(latitude);
  await page.getByLabel('Longitude').fill(longitude);
  await button(page, 'Set coordinates').click();
  await openPanel(page, 'Time');
  await button(page, 'Pause').click();
  await openPanel(page, 'Travel');
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await button(page, 'Zoom in').click();
  await button(page, 'Zoom in').click();
}

function watchOrbitBake() {
  const trace = window.orbitBake = { reads: 0, frameReads: 0, uploads: 0, firstDraw: null };
  let inFrame = false, orbitContext, cruiseStart;
  let uploaded;
  window.bothOrbitAtlasesUploaded = new Promise(resolve => { uploaded = resolve; });
  window.orbitContextLost = () => orbitContext?.isContextLost();
  const request = window.requestAnimationFrame;
  window.requestAnimationFrame = callback => request(now => {
    inFrame = true;
    // Freeze only the ride's RAF timeline in the atlas-reuse case. Both globes
    // stay in the cruise shot while real time and the bake tasks keep running.
    if (window.holdRideInCruise && !document.getElementById('rocket-ride').hidden) {
      cruiseStart ??= now;
      now = Math.min(now, cruiseStart + 4500);
    }
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
    const result = upload.apply(this, args);
    if (args[4] === 1024 && args[5] === 512 && ArrayBuffer.isView(args[8]) && ++trace.uploads === 4) uploaded();
    return result;
  };
  const draw = WebGL2RenderingContext.prototype.drawElements;
  WebGL2RenderingContext.prototype.drawElements = function (...args) {
    orbitContext ??= this;
    if (!document.getElementById('viewport').classList.contains('solar')) {
      trace.firstDraw ??= { reads: trace.reads, uploads: trace.uploads };
    }
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
    // The camera's vertical field of view is fixed. Preserve the sample's
    // angular location relative to the original 486 CSS px reference render.
    const scale = image.height / 486;
    const patch = ctx.getImageData(image.width / 2 + left * scale, image.height / 2 + top * scale,
      Math.round(width * scale), Math.round(height * scale)).data;
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
  await earthEntry(page, 'Try demo sky');
  assert.equal(await page.evaluate(() => window.orbitBake.reads), 0);
  await openPanel(page, 'Travel');
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await page.waitForFunction(() => window.orbitBake.uploads >= 2);
  await openPanel(page, 'View');
  await button(page, 'Frame Moon').click();
  await page.waitForFunction(() => window.orbitBake.uploads >= 4);

  const trace = await page.evaluate(() => window.orbitBake);
  assert.deepEqual(trace, { reads: 1, frameReads: 0, uploads: 4, firstDraw: { reads: 0, uploads: 0 } });
});

test('a ride before orbit draws immediately, then orbit reuses both uploaded clay atlases', { timeout: 35000 }, async t => {
  // Keep desktop framing but rasterize fewer pixels in SwiftShader. This test
  // checks upload order and reuse; the ride buffer dimensions are tested separately.
  const { page, errors, requests } = await opened(t, {
    viewport: { width: 1220, height: 900 }, deviceScaleFactor: .65,
  }, watchOrbitBake);
  await manualSite(page, '23', '-26');
  await page.evaluate(() => { window.holdRideInCruise = true; });
  await button(page, 'Travel').click();
  await button(page, 'Apollo 11 · Near side').click();
  await rocket(page).waitFor({ state: 'visible' });
  await page.evaluate(() => window.bothOrbitAtlasesUploaded);
  assert.deepEqual(await page.evaluate(() => window.orbitBake), {
    reads: 1, frameReads: 0, uploads: 4, firstDraw: { reads: 0, uploads: 0 },
  });

  await skipRide(page).click();
  await heading(page, 'Lunar sky');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPanel(page, 'Travel');
  await button(page, 'Return to Earth').click();
  await openPanel(page, 'Travel');
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await openPanel(page, 'View');
  await button(page, 'Frame Moon').click();
  await region(page).screenshot();
  assert.deepEqual(await page.evaluate(() => [window.orbitBake.reads, window.orbitBake.uploads]), [1, 4]);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));
});

test('the observer-free pin preview redraws itself when Earth relief is ready', async t => {
  const { page } = await opened(t, {}, watchOrbitBake);
  await earthEntry(page, 'Pick a place');
  await button(page, 'Place globe pin').click();
  await heading(page, 'Pick a globe location');
  await page.waitForFunction(() => window.orbitBake.uploads >= 2);
  const trace = await page.evaluate(() => window.orbitBake);
  assert.deepEqual(trace, { reads: 1, frameReads: 0, uploads: 2, firstDraw: { reads: 0, uploads: 0 } });
});

test('a failed Earth atlas keeps orbit and pinning available while the Moon atlas finishes', async t => {
  const { page, errors } = await opened(t, { reducedMotion: 'reduce' }, watchOrbitBake);
  await page.evaluate(() => { window.orbitBakeFault = 'readback'; });
  await earthEntry(page, 'Try demo sky');
  await openPanel(page, 'Time');
  await button(page, 'Pause').click();
  await openPanel(page, 'Travel');
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  await page.waitForFunction(() => window.orbitBake.reads === 1);

  assert.equal(await page.evaluate(() => window.orbitContextLost()), false);
  await openPanel(page, 'View');
  assert.equal(await button(page, 'Frame Moon').isVisible(), true);
  assert.equal(await button(page, 'Frame Moon').isEnabled(), true);
  await button(page, 'Frame Moon').click();
  await page.waitForFunction(() => window.orbitBake.uploads === 2);
  await button(page, 'Frame Earth').click();
  await openPanel(page, 'Location');
  await button(page, 'Place globe pin').click();
  await region(page).press('Enter');
  assert.equal(await page.locator('#site').textContent(), 'Globe pin');
  assert.deepEqual(await page.evaluate(() => [window.orbitBake.reads, window.orbitBake.uploads]), [1, 2]);
  assert.deepEqual(errors, []);
});

test('actual WebGL context loss during atlas baking still disables orbit', async t => {
  const { page, errors } = await opened(t, { reducedMotion: 'reduce' }, watchOrbitBake);
  await page.evaluate(() => { window.orbitBakeFault = 'context-loss'; });
  await earthEntry(page, 'Try demo sky');
  await openPanel(page, 'Travel');
  await button(page, 'Lift off ↗').click();
  await page.getByText(/The 3D globe needs WebGL 2/).waitFor();
  await heading(page, 'Surface sky');

  assert.equal(await page.evaluate(() => window.orbitContextLost()), true);
  await openPanel(page, 'Travel');
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
  await inSolar(page);
  const session = await page.context().newCDPSession(page);
  async function locate(requestCount) {
    await openPanel(page, 'Location');
    await button(page, 'Use my location').tap();
    await button(page, 'Locating…').waitFor({ timeout: 5000 });
    assert.equal(await page.evaluate(() => window.locationRequests.length), requestCount);
  }
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
  await button(page, 'Telescope').tap();
  await telescopeRange(page).fill('23.35');
  await openPanel(page, 'Travel');
  await button(page, 'Lift off ↗').tap();
  await heading(page, 'Globe view');
  assert.equal(await telescope(page).isVisible(), false);
  assert.equal(await region(page).evaluate(el => el.classList.contains('eyepiece')), false);
  const orbit = await region(page).boundingBox(), ox = orbit.x + 120, oy = orbit.y + 100;
  await touchGesture(session, [[[ox, oy]], [[ox + 40, oy + 15]]]);
  const beforePinch = await region(page).screenshot();
  await touchGesture(session, [[[ox, oy], [ox + 40, oy]], [[ox - 20, oy], [ox + 60, oy]]]);
  assert.notDeepEqual(await region(page).screenshot(), beforePinch);
  const beforeWheel = await region(page).screenshot();
  await wheelScene(page, 180);
  assert.notDeepEqual(await region(page).screenshot(), beforeWheel);
  await button(page, 'Zoom in').tap();
  await openPanel(page, 'Travel');
  await button(page, 'Return to surface ↓').tap();
  await heading(page, 'Surface sky');
  assert.equal(await page.locator('#site').textContent(), 'Your location');
  assert.equal(await telescopeRange(page).isVisible(), false);
  await button(page, 'Telescope').tap();
  assert.equal(await telescopeRange(page).inputValue(), '23.35');
  await chooseCity(page, 'Tokyo');
  await button(page, 'Telescope').tap();
  assert.equal(await telescopeRange(page).inputValue(), '1');
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
  await fallback(page);
  // Sample after first paint so moving the same bake into the first frame cannot pass.
  await region(page).screenshot();
  const textureEllipses = await page.evaluate(() => window.textureEllipses);
  t.diagnostic(`Startup offscreen ellipse draws: ${textureEllipses}`);
  assert.ok(textureEllipses <= 2000, `startup texture exceeds the 2000-ellipse budget: ${textureEllipses}`);
  assert.match(await page.locator('#compatibility').textContent(), /needs WebGL 2/);
  await captureSolar(page, 'desktop-no-webgl');
  await captureLayout(page, 'desktop-no-webgl');
  await button(page, 'Use my location').click();
  assert.match(await page.locator('#location-status').textContent(), /unavailable/);
  await fallback(page);
  await button(page, 'Pick a place').click();
  assert.equal(await button(page, 'Place globe pin').isDisabled(), true);
  await chooseCity(page, 'London');
  await inEarthSky(page);
  await openPanel(page, 'Time');
  await page.locator('#zone').getByText(/Europe\/London/).waitFor();
  assert.ok(await button(page, 'Telescope').isEnabled());
  await openPanel(page, 'Travel');
  assert.equal(await button(page, 'Lift off ↗').isDisabled(), true);
  assert.equal(await button(page, 'Travel').isEnabled(), true);
  assert.equal(await button(page, 'Apollo 11 · Near side').isVisible(), false);
  assert.match(await page.locator('#compatibility').textContent(), /Lunar travel from Earth is unavailable/);
  await page.reload();
  await fallback(page);
  await button(page, 'Pick a place').click();
  await page.getByText('Enter coordinates', { exact: true }).click();
  await page.getByLabel('Latitude').fill('25.125');
  await page.getByLabel('Longitude').fill('-45.5');
  await button(page, 'Set coordinates').click();
  await heading(page, 'Surface sky');
  assert.equal(await page.locator('#coordinates').textContent(), '25.125°, -45.500°');
  await page.reload();
  await fallback(page);
  await button(page, 'Try demo sky').click();
  await page.locator('#site').getByText(/Reykjavík · demo sky/).waitFor({ state: 'attached' });
  assert.deepEqual(errors, []);
});

test('without a sky renderer the observer readouts work but the telescope is unavailable', async t => {
  const { page, errors } = await opened(t, {}, () => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return this.id === 'sky' && type === '2d' ? null : original.call(this, type, ...args);
    };
  });
  await button(page, 'Try demo sky').click();
  assert.match(await page.locator('#compatibility').textContent(), /cannot draw the sky/);
  assert.equal(await clock(page), fixed);
  assert.equal(await telescope(page).isVisible(), false);
  assert.deepEqual(errors, []);
});

test('globe bounds playback samples without delaying camera input or paused edits', async t => {
  const { page, errors } = await opened(t, { reducedMotion: 'reduce' }, controlledFrames, false);
  const frames = (count = 1, delta = 10) => page.evaluate(([n, ms]) => window.stepFrames(n, ms), [count, delta]);
  const badge = page.locator('#view-badge');
  const speed = page.getByLabel('Playback speed');
  await earthEntry(page, 'Try demo sky');
  await openPanel(page, 'Travel');
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
  await openPanel(page, 'Time');
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
  await earthEntry(page, 'Try demo sky');
  await wall('2024-04-08T12:00:04.000Z');
  await frame(10);
  assert.equal(await clock(page), '2024-04-08T12:00:04.000Z');

  await openPanel(page, 'Time');
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
  await earthEntry(page, 'Try demo sky');
  await openPanel(page, 'Time');
  await page.getByLabel('Playback speed').selectOption('60');
  await page.getByLabel('Enter local time').fill('12:30:00');
  await page.evaluate(() => window.stepFrames(1, 1000));

  assert.ok(await button(page, 'Play').isEnabled());
  assert.equal(await clock(page), '2024-04-08T12:30:00.000Z');
  assert.deepEqual(errors, []);
});

test('playback stops at the range end and a site change preserves that instant', async t => {
  const { page, errors } = await opened(t, {}, controlledFrames, false);
  await earthEntry(page, 'Try demo sky');
  await openPanel(page, 'Time');
  await page.getByLabel('Enter local date').fill('2100-12-31');
  await page.getByLabel('Enter local time').fill('23:59:59');
  await button(page, 'Play').dispatchEvent('click');
  await page.evaluate(() => window.stepFrames(1, 1000));

  const end = '2100-12-31T23:59:59.999Z';
  assert.equal(await clock(page), end);
  assert.ok(await button(page, 'Play').isEnabled());
  await page.getByRole('status').filter({ hasText: 'Playback stopped at the supported local date boundary.' }).waitFor();

  await chooseCity(page, 'Tokyo');
  await openPanel(page, 'Time');
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
const telescopeRange = page => page.getByRole('slider', { name: 'Magnification' });
const exitTelescope = page => button(page, 'Exit telescope');
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

async function captureTelescope(page, device) {
  if (process.env.TELESCOPE_SCREENSHOTS) {
    const zoom = await telescopeRange(page).inputValue();
    await page.locator('.observatory').screenshot({ path: `${process.env.TELESCOPE_SCREENSHOTS}/telescope-${device}-${zoom}x.png` });
  }
}

async function assertAperture(page, normal) {
  const eyepiece = await region(page).screenshot();
  const colors = png => page.evaluate(async png => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const x = image.width / 2, y = image.height / 2, radius = Math.min(x, y);
    const sample = (x, y) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
    return [
      sample(x + radius * .15, y), sample(x, y - radius * .8), sample(x + radius * .8, y),
      sample(x + radius * .8, y - radius * .8), sample(x - radius * .8, y + radius * .8),
    ];
  }, png.toString('base64'));
  const [inside, outside] = await Promise.all([colors(eyepiece), colors(normal)]);
  assert.ok(inside.slice(0, 3).every((rgb, i) => rgb.every((value, channel) =>
    Math.abs(value - outside[i][channel]) <= 1)), 'central and cardinal sky samples stay unfiltered');
  for (const corner of inside.slice(3)) assert.deepEqual(corner, [7, 9, 16], 'diagonal samples are outside the aperture');
  assert.notDeepEqual(outside.slice(3), inside.slice(3), 'closed eyepiece has no mask');
}

async function manualSite(page, lat, lon) {
  await earthEntry(page, 'Pick a place');
  await page.getByText('Enter coordinates', { exact: true }).click();
  await page.getByLabel('Latitude').fill(lat);
  await page.getByLabel('Longitude').fill(lon);
  await button(page, 'Set coordinates').click();
}

async function aimNearHorizon(page, azimuth, previousBearing = '') {
  const bearing = page.locator('#bearing');
  // The heading updates on arrival, but the bearing still describes the
  // departure camera until the first frame at the new site has been drawn.
  const painted = await page.waitForFunction(previous => {
    const text = document.getElementById('bearing').textContent;
    return text && text !== previous ? text : false;
  }, previousBearing);
  const [, az, alt] = (await painted.jsonValue()).match(/(\d+)° · (-?\d+)° altitude/);
  const yawToTarget = current => (azimuth - Number(current) + 540) % 360 - 180;
  const yaw = yawToTarget(az);
  const pitch = -Number(alt);
  for (const [change, positive, negative] of [[yaw, 'ArrowRight', 'ArrowLeft'], [pitch, 'ArrowUp', 'ArrowDown']]) {
    for (let i = 0; i < Math.round(Math.abs(change) / 6.16); i++) {
      await region(page).press(change > 0 ? positive : negative);
    }
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const actual = await bearing.innerText();
  const [, actualAz, actualAlt] = actual.match(/(\d+)° · (-?\d+)° altitude/);
  assert.ok(Math.abs(yawToTarget(actualAz)) <= 4 && Math.abs(Number(actualAlt)) <= 4,
    `expected aim near ${azimuth}° along the horizon; painted bearing was ${actual}`);
  return actual;
}

async function surfaceColors(page, { airless = false } = {}) {
  return page.locator('#sky').evaluate(async (canvas, airless) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const ctx = canvas.getContext('2d');
    const color = (x, y) => Array.from(ctx.getImageData(
      Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1).data.slice(0, 3));
    const colors = { sky: color(.5, .3), left: color(.28, .7), right: color(.72, .7) };
    if (airless) {
      const isSky = ([r, g, b]) => r === 7 && g === 9 && b === 16;
      if (!isSky(colors.sky) || isSky(colors.left) || isSky(colors.right)) {
        throw new Error(`expected lunar sky above two foreground samples, got ${JSON.stringify(colors)}`);
      }
    }
    return colors;
  }, airless);
}

const captureSunlight = (page, name) => process.env.SUNLIGHT_SCREENSHOTS &&
  captureLayout(page, name, process.env.SUNLIGHT_SCREENSHOTS);
const brightness = rgb => rgb.reduce((sum, channel) => sum + channel, 0);

test('Earth foreground follows low Sun from either side and retains only diffuse twilight below the horizon', async t => {
  const { page, errors } = await opened(t, { viewport: { width: 1220, height: 900 } }, () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...args);
    };
  });
  await manualSite(page, '35', '0');
  await openPanel(page, 'Time');
  await button(page, 'Pause').click();
  await button(page, 'Time').click();
  const bearing = await aimNearHorizon(page, 180);
  const noon = await surfaceColors(page);
  await captureSunlight(page, 'desktop-earth-noon');

  async function time(value) {
    await openPanel(page, 'Time');
    await page.getByLabel('Enter local time').fill(value);
    await button(page, 'Time').click();
    assert.equal(await clock(page), `2024-04-08T${value}.000Z`);
    assert.equal(await page.locator('#bearing').innerText(), bearing, 'time edits preserve aim');
    return surfaceColors(page);
  }

  // At 35° N, 0° on this date, the modeled Sun is low in the east at 06:00
  // and low in the west at 18:00, with both samples above the horizon.
  const dawn = await time('06:00:00');
  assert.ok(brightness(dawn.left) > brightness(dawn.right) + 35, JSON.stringify(dawn));
  await captureSunlight(page, 'desktop-earth-low-east');
  const dusk = await time('18:00:00');
  assert.ok(brightness(dusk.right) > brightness(dusk.left) + 35, JSON.stringify(dusk));
  assert.ok(dusk.right[0] > dusk.right[2] + 10, `the directly lit ground is warm: ${JSON.stringify(dusk)}`);
  assert.ok(dusk.left[2] > dusk.left[0], 'the unlit side does not pick up the warm tint');
  assert.ok(noon.right[2] > noon.right[0] + 10, 'high Sun keeps the existing cool palette');
  assert.ok(brightness(noon.right) > brightness(dusk.right) + 35);
  await captureSunlight(page, 'desktop-earth-low-west');
  await button(page, 'Telescope').click();
  const eyepiece = await surfaceColors(page);
  assert.ok(eyepiece.right[0] > eyepiece.left[0] + 20);
  await captureSunlight(page, 'desktop-earth-low-west-eyepiece');
  await exitTelescope(page).click();

  const twilight = await time('18:35:00');
  assert.deepEqual(twilight.left, twilight.right, 'below the horizon there is no directional direct contribution');
  await captureSunlight(page, 'desktop-earth-twilight');
  const night = await time('21:00:00');
  assert.deepEqual(night.left, night.right);
  assert.ok(brightness(twilight.left) > brightness(night.left));
  assert.ok(brightness(twilight.sky) > brightness(night.sky));
  await captureSunlight(page, 'desktop-earth-night');

  await chooseCity(page, 'Honolulu');
  assert.equal(await clock(page), '2024-04-08T21:00:00.000Z');
  await heading(page, 'Surface sky');
  await aimNearHorizon(page, 180, bearing);
  assert.ok(brightness((await surfaceColors(page)).left) > brightness(night.left) + 100);
  assert.deepEqual(errors, []);
});

test('phone lunar foreground changes with the Sun without atmospheric warmth or twilight', async t => {
  const { page, errors } = await opened(t, {
    ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, reducedMotion: 'reduce',
  });
  await page.clock.setFixedTime(new Date('2025-01-06T00:00:00.000Z'));
  await earthEntry(page, 'Try demo sky', 'tap');
  await openPanel(page, 'Time');
  await button(page, 'Pause').tap();
  await openPanel(page, 'Travel');
  const earthBearing = await page.locator('#bearing').innerText();
  await button(page, 'Apollo 11 · Near side').tap();
  await heading(page, 'Lunar sky');
  const bearing = await aimNearHorizon(page, 180, earthBearing);
  const lunarColors = () => surfaceColors(page, { airless: true });
  const east = await lunarColors();
  await captureSunlight(page, 'phone-moon-sunlit-east');

  async function date(value) {
    await openPanel(page, 'Time');
    await page.getByLabel('Enter local date').fill(value);
    await button(page, 'Time').tap();
    assert.equal(await clock(page), `${value}T00:00:00.000Z`);
    assert.equal(await page.locator('#bearing').innerText(), bearing);
    return lunarColors();
  }

  const west = await date('2025-01-19');
  await captureSunlight(page, 'phone-moon-sunlit-west');
  assert.ok(brightness(east.left) > brightness(east.right) + 40, JSON.stringify(east));
  assert.ok(brightness(west.right) > brightness(west.left) + 40, JSON.stringify(west));
  await button(page, 'Telescope').tap();
  const eyepiece = await lunarColors();
  assert.ok(brightness(eyepiece.right) > brightness(eyepiece.left) + 40, JSON.stringify(eyepiece));
  await captureSunlight(page, 'phone-moon-sunlit-west-eyepiece');
  await exitTelescope(page).tap();

  const below = await date('2025-01-20');
  await captureSunlight(page, 'phone-moon-unlit');
  await button(page, 'Telescope').tap();
  await captureSunlight(page, 'phone-moon-unlit-eyepiece');
  await exitTelescope(page).tap();
  const night = await date('2025-01-23');
  assert.deepEqual(below, night, 'Sun just below the horizon renders like deep lunar night');
  assert.deepEqual(west.sky, night.sky, 'there is no solar scattering in the lunar sky');
  const lunarRedBlue = ([r, , b]) => r - b;
  assert.ok(Math.abs(lunarRedBlue(west.right) - lunarRedBlue(night.right)) <= 2,
    'the direct light raises all channels equally even at low altitude');
  assert.deepEqual(errors, []);
});

test('the eyepiece keeps the optical axis fixed and displaces the Sun and horizon near the rim without WebGL', async t => {
  const { page, errors } = await opened(t, { viewport: { width: 1220, height: 900 } }, () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...args);
    };
  });
  await page.clock.setFixedTime(new Date('2025-01-06T00:00:00.000Z'));
  await manualSite(page, '35.681', '139.767');
  await openPanel(page, 'Time');
  await button(page, 'Pause').click();
  await button(page, 'Time').click();
  const optics = () => page.locator('#sky').evaluate(async canvas => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { width, height } = canvas;
    const cx = width / 2, cy = height / 2, radius = Math.min(cx, cy);
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    const matches = (i, r, g, b) => pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b;
    let sunX = 0, sunY = 0, sunCount = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (!matches(i, 255, 240, 189)) continue;
      const x = (i / 4) % width, y = Math.floor(i / (4 * width));
      if (Math.hypot(x - cx, y - cy) >= radius - 10) continue;
      sunX += x; sunY += y; sunCount++;
    }
    const groundAt = offset => {
      const x = Math.round(cx + radius * offset);
      const ground = [];
      // Stop inside the visible aperture, not at the edge of the backing canvas.
      const limit = cy + Math.sqrt((radius - 10) ** 2 - (x - cx) ** 2);
      // The lit ground varies across the frame, but is constant down a column
      // apart from one-channel-step gradient dithering.
      const reference = 4 * ((Math.floor(limit) - 1) * width + x);
      const groundColor = pixels.subarray(reference, reference + 3);
      for (let y = Math.floor(cy); y < limit; y++) {
        const index = 4 * (y * width + x);
        if (groundColor.every((value, channel) => Math.abs(pixels[index + channel] - value) <= 1)) ground.push(y);
      }
      return { start: ground[0], end: ground.at(-1), count: ground.length };
    };
    return { radius, sunCount, sun: [sunX / sunCount - cx, sunY / sunCount - cy],
      horizon: [groundAt(0), groundAt(.63), groundAt(-.63)] };
  });
  const normal = await optics();
  assert.ok(normal.sunCount > 0 && Math.hypot(...normal.sun) < 2, JSON.stringify(normal));
  await button(page, 'Telescope').click();
  const lensed = await optics();
  assert.deepEqual(lensed.sun, normal.sun);
  const [center, left, right] = lensed.horizon;
  const [flat] = normal.horizon;
  assert.ok(normal.horizon.every(line => line.start === flat.start), JSON.stringify(normal.horizon));
  assert.ok(Math.abs(center.start - flat.start) < .025 * lensed.radius);
  assert.ok(left.start - center.start > .025 * lensed.radius, JSON.stringify(lensed.horizon));
  assert.ok(Math.abs(left.start - right.start) <= 1);
  for (const line of lensed.horizon) {
    assert.equal(line.count, line.end - line.start + 1, 'no sky-colored holes in the ground');
  }
  await captureTelescope(page, 'desktop-horizon');
  await exitTelescope(page).click();

  const scene = region(page);
  await scene.scrollIntoViewIfNeeded();
  const { x, y, width, height } = await scene.boundingBox();
  await drag(page, x + width / 2, y + height / 2, 125, 0);
  const normalEdge = await optics();
  const bearing = await page.locator('#bearing').innerText();
  await button(page, 'Telescope').click();
  const lensedEdge = await optics();
  const shift = lensedEdge.sun[0] - normalEdge.sun[0];
  t.diagnostic(`Optical axis unchanged; rimward Sun shift ${shift.toFixed(1)} px; horizon sag ${(left.start - center.start)} px`);
  assert.ok(normalEdge.sun[0] > .7 * normalEdge.radius);
  assert.ok(shift > .035 * normalEdge.radius, JSON.stringify({ normalEdge, lensedEdge }));
  assert.equal(await page.locator('#bearing').innerText(), bearing);
  await exitTelescope(page).click();
  assert.deepEqual((await optics()).sun, normalEdge.sun);
  assert.deepEqual(errors, []);
});

test('the Moon label stays beside the disk at high zoom, including near the eyepiece rim', async t => {
  const { page, errors } = await opened(t, { viewport: { width: 1220, height: 900 }, deviceScaleFactor: 1 }, () => {
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...args) {
      if (this.canvas.id !== 'sky' || text !== 'Moon') return fillText.call(this, text, x, y, ...args);
      const m = this.measureText(text);
      const left = x - m.actualBoundingBoxLeft, right = x + m.actualBoundingBoxRight;
      const top = y - m.actualBoundingBoxAscent, bottom = y + m.actualBoundingBoxDescent;
      const pixels = () => this.getImageData(Math.floor(left), Math.floor(top),
        Math.max(1, Math.ceil(right) - Math.floor(left)), Math.max(1, Math.ceil(bottom) - Math.floor(top))).data;
      // Compare the real fill against the same canvas immediately before it;
      // there is no assumption about font coverage or exact glyph colors.
      const before = pixels();
      fillText.call(this, text, x, y, ...args);
      const painted = pixels().some((value, i) => value !== before[i]);
      window.moonLabel = { x, y, left, right, top, bottom, painted };
    };
  });
  await page.clock.setFixedTime(new Date('2025-01-06T12:00:00.000Z'));
  await manualSite(page, '35.681', '139.767');
  await openPanel(page, 'Time');
  await button(page, 'Pause').click();
  await button(page, 'Time').click();
  const moonAndLabel = rimInset => page.locator('#sky').evaluate(async (canvas, rimInset) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { width, height } = canvas;
    const cx = width / 2, cy = height / 2, radius = Math.min(cx, cy);
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let left = Infinity, right = -Infinity;
    for (let y = Math.floor(cy) - 30; y <= cy + 30; y++) {
      for (let x = Math.floor(cx - radius); x < cx + radius; x++) {
        if (Math.hypot(x - cx, y - cy) > radius - rimInset) continue;
        const i = 4 * (y * width + x);
        const matches = (r, g, b) => pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b;
        if (matches(244, 234, 215) || matches(52, 64, 78)) {
          left = Math.min(left, x); right = Math.max(right, x);
        }
      }
    }
    const label = window.moonLabel;
    const distances = label ? [label.left - 1.5, label.right + 1.5].flatMap(x =>
      [label.top - 1.5, label.bottom + 1.5].map(y => Math.hypot(x - cx, y - cy))) : [];
    return { left, right, label, room: radius - rimInset - Math.max(...distances) };
  }, rimInset);
  const assertGap = (paint, view, side = 'right') => {
    assert.ok(paint.label && Number.isFinite(paint.right), `${view}: expected a Moon limb and label; got ${JSON.stringify(paint)}`);
    assert.ok(paint.room >= 0, `${view}: label bounds cross the clear field: ${JSON.stringify(paint)}`);
    assert.ok(paint.label.painted, `${view}: Moon label fill did not change pixels: ${JSON.stringify(paint)}`);
    const gap = side === 'right' ? paint.label.x - paint.right : paint.left - paint.label.right;
    // The intended gap is 6 CSS px; allow for the rasterized disk edge.
    assert.ok(gap >= 4 && gap <= 8,
      `${view}: expected the label just ${side} of the limb; got ${JSON.stringify(paint)}, gap ${gap}px`);
  };

  assertGap(await moonAndLabel(0), 'normal 1×');
  await button(page, 'Telescope').click();
  await telescopeRange(page).fill('32');
  const scene = region(page);
  await scene.scrollIntoViewIfNeeded();
  const { x, y, width, height } = await scene.boundingBox();
  const cx = x + width / 2, cy = y + height / 2;
  // Exclude the CSS mask and rim from the backing-canvas sample.
  await drag(page, cx, cy, 80, 0);
  assertGap(await moonAndLabel(10), 'off-axis 32×');
  await drag(page, cx, cy, 31, 0);
  const nearRim = await moonAndLabel(10);
  assertGap(nearRim, 'near-rim 32×', 'left');
  assert.ok(width / 2 + Math.min(width, height) / 2 - 10 - nearRim.right < 24, JSON.stringify(nearRim));
  assert.deepEqual(errors, []);
});

test('desktop telescope enlarges the centered lunar Earth without changing its phase or observer', async t => {
  const { page, errors } = await opened(t, { viewport: { width: 1220, height: 900 }, reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2025-01-06T00:00:00.000Z'));
  assert.equal(await telescope(page).isVisible(), false);
  await earthEntry(page, 'Pick a place');
  await chooseCity(page, 'Tokyo');
  await openPanel(page, 'Time');
  await button(page, 'Pause').click();
  await button(page, 'Time').click();
  const sunPixels = size => page.locator('#sky').evaluate(async (canvas, size) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { width, height } = canvas;
    // Isolate the centered disk, with sky at the left edge and no label ink.
    const pixels = canvas.getContext('2d').getImageData(width / 2 - size / 2, height / 2 - size / 2, size, size).data;
    let area = 0;
    for (let row = 0; row < pixels.length; row += size * 4) {
      const skyRed = pixels[row]; // The canvas sky gradient is constant across each row.
      for (let pixel = row + 4; pixel < row + size * 4; pixel += 4) {
        // Include fractional coverage from the tiny disk's antialiased edge.
        area += Math.max(0, pixels[pixel] - skyRed) / (255 - skyRed);
      }
    }
    return area;
  }, size);
  const normalSun = await sunPixels(12);
  assert.ok(normalSun > 0);
  await wheelScene(page, 120);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  const normalView = await region(page).screenshot();
  await region(page).focus();
  await page.keyboard.press('Tab');
  assert.ok(await button(page, 'Telescope').evaluate(el => el.matches(':focus-visible')));
  await page.keyboard.press('Enter');
  assert.equal(await exitTelescope(page).getAttribute('aria-expanded'), 'true');
  await assertAperture(page, normalView);
  const beforeWheel = await page.evaluate(() => window.scrollY);
  await wheelScene(page, -250);
  await page.waitForFunction(() => document.getElementById('telescope-range').value === '2.25');
  const sunRatio = await sunPixels(18) / normalSun;
  assert.ok(sunRatio > 4 && sunRatio < 6.5, `fractional focal length scaled Sun area by ${sunRatio}`);
  assert.equal(await page.evaluate(() => window.scrollY), beforeWheel);
  await captureTelescope(page, 'desktop');
  await wheelScene(page, 100);
  await page.waitForFunction(() => document.getElementById('telescope-range').value === '1.75');
  await exitTelescope(page).hover();
  const beforeControlWheel = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 160);
  assert.equal(await page.evaluate(() => window.scrollY), beforeControlWheel);
  assert.equal(await telescopeRange(page).inputValue(), '1.75');
  assert.equal(await region(page).evaluate(scene => scene.dispatchEvent(new WheelEvent('wheel', {
    deltaY: -2, deltaMode: WheelEvent.DOM_DELTA_LINE, bubbles: true, cancelable: true,
  }))), false);
  assert.equal(await telescopeRange(page).inputValue(), '1.91');

  await button(page, 'Travel').click();
  await button(page, 'Apollo 11 · Near side').click();
  await heading(page, 'Lunar sky');
  assert.equal(await telescopeRange(page).isVisible(), false);
  await openPanel(page, 'View');
  await page.getByText('Object directions', { exact: true }).click();
  await button(page, 'View').click();
  const snapshot = () => Promise.all([
    clock(page), ...['site', 'coordinates', 'bearing', 'earth-visibility', 'directions']
       .map(id => page.locator(`#${id}`).textContent()),
    page.locator('#play').textContent(), page.getByLabel('Playback speed', { exact: true }).inputValue(),
  ]);
  const normal = await earthPaint(page);
  const before = await snapshot();
  assert.ok(normal.lit > 0 && normal.dark > 0, JSON.stringify(normal));

  await region(page).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  assert.ok(await telescopeRange(page).evaluate(el => el.matches(':focus-visible')));
  assert.equal(await telescopeRange(page).inputValue(), '1');
  await page.keyboard.press('ArrowRight');
  assert.equal(await telescopeRange(page).getAttribute('aria-valuetext'), '1.01×');
  await telescopeRange(page).fill('8');
  const eight = await earthPaint(page);
  const litFraction = ({ lit, dark }) => lit / (lit + dark);
  assert.ok(eight.lit + eight.dark > 55 * (normal.lit + normal.dark), JSON.stringify({ normal, eight }));
  assert.ok(Math.abs(litFraction(eight) - litFraction(normal)) < .04, JSON.stringify({ normal, eight }));
  await page.keyboard.press('End');
  assert.equal(await telescopeRange(page).getAttribute('aria-valuetext'), '32×');
  await page.keyboard.press('ArrowRight');
  assert.equal(await telescopeRange(page).inputValue(), '32');
  assert.equal(await region(page).evaluate(scene => scene.dispatchEvent(new WheelEvent('wheel', {
    deltaY: -1000, bubbles: true, cancelable: true,
  }))), false);
  assert.equal(await telescopeRange(page).inputValue(), '32');
  const zoomed = await earthPaint(page);
  assert.ok(zoomed.lit + zoomed.dark > 900 * (normal.lit + normal.dark), JSON.stringify({ normal, zoomed }));
  // At 32× Earth can fill the field; the clipped light/dark ratio is not its phase.
  assert.ok(zoomed.lit > eight.lit && zoomed.dark > eight.dark);
  assert.deepEqual(await snapshot(), before);
  await captureTelescope(page, 'desktop');

  await page.keyboard.press('Escape');
  assert.equal(await telescopeRange(page).isVisible(), false);
  assert.ok(await button(page, 'Telescope').evaluate(el => el.matches(':focus-visible') && el === document.activeElement));
  assert.deepEqual(await snapshot(), before);
  const reset = await earthPaint(page);
  // Exact-color counts exclude antialiased edge pixels, which can differ on repaint.
  assert.ok(Math.abs((reset.lit + reset.dark) / (normal.lit + normal.dark) - 1) < .06, JSON.stringify({ normal, reset }));
  assert.ok(Math.abs(reset.shift / reset.lit - normal.shift / normal.lit) < .5, JSON.stringify({ normal, reset }));
  await button(page, 'Telescope').press('Enter');
  assert.equal(await telescopeRange(page).inputValue(), '32');
  await region(page).press('Escape');
  assert.equal(await telescopeRange(page).isVisible(), false);
  await button(page, 'Telescope').click();
  await openPanel(page, 'Travel');
  await button(page, 'Return to Earth').click();
  await heading(page, 'Surface sky');
  await button(page, 'Telescope').click();
  assert.equal(await telescopeRange(page).inputValue(), '1');
  assert.deepEqual(errors, []);
});

test('trackpad-style Ctrl+wheel zooms only over the active telescope scene', async t => {
  const { page, errors } = await opened(t, { reducedMotion: 'reduce' });
  const scene = region(page);
  const wheelNotCanceled = (target, modifiers) => target.evaluate((el, modifiers) =>
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true, ...modifiers })), modifiers);
  await earthEntry(page, 'Try demo sky');
  assert.equal(await wheelNotCanceled(scene, { ctrlKey: true }), true, 'closed telescope leaves browser zoom alone');
  await button(page, 'Telescope').click();
  const slider = telescopeRange(page);
  assert.equal(await wheelNotCanceled(slider, { ctrlKey: true }), true, 'telescope controls leave browser zoom alone');
  await openPanel(page, 'Time');
  assert.equal(await wheelNotCanceled(button(page, 'Pause'), { ctrlKey: true }), true, 'outside the scene is not captured');
  await button(page, 'Time').click();
  assert.equal(await wheelNotCanceled(scene, { metaKey: true }), true, 'Command/Meta is not a pinch signal');
  assert.equal(await wheelNotCanceled(scene, { ctrlKey: true, shiftKey: true }), true, 'modified shortcuts are not pinch signals');
  assert.equal(await slider.inputValue(), '1');
  await page.evaluate(() => {
    document.addEventListener('wheel', event => {
      window.observedWheel = { ctrlKey: event.ctrlKey, canceled: event.defaultPrevented };
    }, { once: true });
  });
  await page.keyboard.down('Control');
  try { await wheelScene(page, -120); }
  finally { await page.keyboard.up('Control'); }
  const observed = await page.waitForFunction(() => window.observedWheel);
  assert.deepEqual(await observed.jsonValue(), { ctrlKey: true, canceled: true });
  assert.equal(await slider.inputValue(), '1.6');

  await openPanel(page, 'Travel');
  await button(page, 'Lift off ↗').click();
  await heading(page, 'Globe view');
  assert.equal(await wheelNotCanceled(scene, { ctrlKey: true }), true, 'orbit leaves browser zoom alone');
  assert.equal(await wheelNotCanceled(scene, { metaKey: true }), true, 'orbit leaves Command/Meta alone');
  assert.deepEqual(errors, []);
});

test('lift-off moves focus only if it hides a focused telescope control', async t => {
  const { page, errors } = await opened(t, { reducedMotion: 'reduce' });
  const scene = region(page);
  const liftOff = page.getByRole('button', { name: 'Lift off ↗', exact: true, includeHidden: true });
  await earthEntry(page, 'Try demo sky');
  await openPanel(page, 'Travel');
  await button(page, 'Telescope').press('Enter');
  await page.keyboard.press('Tab');
  assert.ok(await telescopeRange(page).evaluate(el => el === document.activeElement));
  // Activate the real lift-off action without the pointer moving focus off the slider first.
  await liftOff.dispatchEvent('click');
  await heading(page, 'Globe view');
  assert.equal(await telescopeRange(page).isVisible(), false);
  assert.ok(await scene.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));

  await openPanel(page, 'Travel');
  await button(page, 'Return to surface ↓').click();
  await heading(page, 'Surface sky');
  await button(page, 'Telescope').click();
  await openPanel(page, 'Time');
  const pause = button(page, 'Pause');
  await pause.focus();
  await liftOff.dispatchEvent('click');
  await heading(page, 'Globe view');
  assert.ok(await pause.evaluate(el => el === document.activeElement));
  assert.deepEqual(errors, []);
});

test('phone telescope works by touch during playback and cannot reveal far-side Earth', async t => {
  const { page, errors } = await opened(t, {
    ...devices['iPhone 13'], defaultBrowserType: undefined, reducedMotion: 'reduce',
  });
  await earthEntry(page, 'Try demo sky', 'tap');
  await page.waitForFunction(() => document.getElementById('bearing').textContent !== '');
  await openPanel(page, 'Time');
  assert.ok(await button(page, 'Pause').isVisible());
  await button(page, 'Time').tap();
  const initialBearing = await page.locator('#bearing').innerText();
  const normalView = await region(page).screenshot();
  await button(page, 'Telescope').tap();
  await assertAperture(page, normalView);
  await region(page).scrollIntoViewIfNeeded();
  const center = async () => {
    const { x, y, width, height } = await region(page).boundingBox();
    return [x + width / 2, y + height / 2];
  };
  let [cx, cy] = await center();
  const session = await page.context().newCDPSession(page);
  await touchGesture(session, [
    [[cx - 30, cy], [cx + 30, cy]],
    [[cx - 48, cy], [cx + 48, cy]],
    [[cx - 65, cy], [cx + 65, cy]],
  ]);
  assert.equal(await telescopeRange(page).inputValue(), '2.4');
  await captureTelescope(page, 'portrait');
  await telescopeRange(page).fill('31');
  [cx, cy] = await center();
  await touchGesture(session, [[[cx - 30, cy], [cx + 30, cy]], [[cx - 65, cy], [cx + 65, cy]]]);
  assert.equal(await telescopeRange(page).inputValue(), '32');
  await captureTelescope(page, 'portrait');
  await telescopeRange(page).fill('2.4');
  assert.equal(await page.locator('#bearing').innerText(), initialBearing);
  [cx, cy] = await center();
  await touchGesture(session, [[[cx - 65, cy], [cx + 65, cy]], [[cx - 45, cy], [cx + 45, cy]]], 'touchCancel');
  assert.equal(await telescopeRange(page).inputValue(), '1.6');
  assert.equal(await page.locator('#bearing').innerText(), initialBearing);
  await touchGesture(session, [[[cx, cy]], [[cx + 40, cy + 10]]]);
  await page.waitForFunction(before => document.getElementById('bearing').textContent !== before, initialBearing);
  assert.equal(await telescopeRange(page).inputValue(), '1.6');
  await openPanel(page, 'Time');
  assert.ok(await button(page, 'Pause').isVisible());
  await page.clock.setFixedTime(new Date('2024-04-08T12:00:03.000Z'));
  await page.waitForFunction(() => document.getElementById('local-clock').dateTime === '2024-04-08T12:00:03.000Z');
  await button(page, 'Pause').tap();

  await button(page, 'Travel').tap();
  await button(page, 'Far-side equator').tap();
  await openPanel(page, 'View');
  await page.getByText(/Moon blocks the view/).waitFor();
  await button(page, 'View').tap();
  await captureLayout(page, 'phone-lunar-collapsed');
  const normal = await earthPaint(page);
  await button(page, 'Telescope').tap();
  assert.equal(await telescopeRange(page).inputValue(), '1');
  await telescopeRange(page).fill('32');
  assert.deepEqual(await earthPaint(page), normal);
  assert.deepEqual(normal, { lit: 0, dark: 0, shift: 0 });
  for (const control of [telescopeRange(page), exitTelescope(page)]) {
    const box = await control.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
  }
  await exitTelescope(page).tap();
  assert.equal(await telescopeRange(page).isVisible(), false);
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
  await openPanel(page, 'Time');
  await page.getByLabel('Playback speed').selectOption('60');

  for (const [departure, destination, station] of [
    ['Apollo 11 · Near side', 'Lunar sky', 'Apollo 11 · Near side'],
    ['Return to Earth', 'Surface sky', 'Manual coordinates'],
  ]) {
    await openPanel(page, 'Travel');
    await button(page, departure).click();
    await rocket(page).waitFor({ state: 'visible' });
    assert.equal(await telescope(page).isVisible(), false);
    const [width, height] = await page.locator('#space').evaluate(canvas => [canvas.width, canvas.height]);
    assert.ok(width >= 1280 && height >= 720, `${width}×${height}`);
    t.diagnostic(`1280×720 CSS viewport ride buffer: ${width}×${height}`);
    assert.equal(await flag(page).isVisible(), false);
    await openPanel(page, 'Time');
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
  await earthEntry(page, 'Pick a place');
  await chooseCity(page, 'Tokyo');
  await openPanel(page, 'Time');
  await button(page, 'Pause').click();
  await button(page, 'Travel').click();
  await button(page, 'Apollo 11 · Near side').press('Enter');
  await rocket(page).waitFor({ state: 'visible' });
  assert.equal(await skipRide(page).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Enter');
  await heading(page, 'Lunar sky');
  await flag(page).waitFor({ state: 'visible' });
  await openPanel(page, 'Time');
  await page.getByText('Lunar time (UTC)', { exact: true }).waitFor();
  assert.equal(await clock(page), first);
  assert.match(await page.locator('#earth-visibility').textContent(), /61% lit · 1.98° wide/);
  const fuller = await earthPaint(page);
  assert.ok(fuller.lit > fuller.dark && fuller.shift < 0, JSON.stringify(fuller));

  await openPanel(page, 'Travel');
  await button(page, 'Return to Earth').press('Enter');
  await rocket(page).waitFor({ state: 'visible' });
  await skipRide(page).press('Enter');
  await heading(page, 'Surface sky');
  await flag(page).waitFor({ state: 'visible' });
  await openPanel(page, 'Time');
  await page.locator('#local-clock').getByText(/09:00:00/).waitFor();
  assert.equal(await page.locator('#site').textContent(), 'Tokyo');
  assert.equal(await clock(page), first);

  await page.getByLabel('Enter local date').fill('2025-01-20');
  await button(page, 'Travel').click();
  await button(page, 'Apollo 11 · Near side').click();
  await skipRide(page).click();
  await openPanel(page, 'View');
  await page.getByText(/33% lit · 1.82° wide/).waitFor();
  await page.waitForFunction(() => document.getElementById('bearing').textContent.includes('68° altitude'));
  const crescent = await earthPaint(page);
  assert.ok(crescent.lit < crescent.dark && crescent.shift > 0, JSON.stringify(crescent));
  for (const event of ['sunrise', 'sunset']) {
    const readout = page.locator(`#next-${event}`);
    const target = (await readout.textContent()).replace(' · ', 'T').replace(' UTC', '.000Z');
    await openPanel(page, 'Time');
    await button(page, 'Play').click();
    await openPanel(page, 'View');
    await button(page, `Jump to ${event}`).click();
    await openPanel(page, 'Time');
    await button(page, 'Play').waitFor();
    assert.equal(await clock(page), target);
    assert.notEqual(await readout.textContent(), target.replace('T', ' · ').replace('.000Z', ' UTC'));
  }
  await page.getByLabel('Enter local date').fill('2100-12-31');
  await page.getByLabel('Enter local time').fill('23:59:59');
  await page.waitForFunction(() => document.getElementById('jump-sunrise').disabled && document.getElementById('jump-sunset').disabled);
  assert.match(await page.locator('#next-sunrise').textContent(), /None before the supported UTC date limit/);
  await openPanel(page, 'Travel');
  await button(page, 'Return to Earth').click();
  await skipRide(page).click();
  assert.equal(await clock(page), '2100-12-31T23:59:59.000Z');
  assert.match(await page.locator('#clock-status').textContent(), /same instant is outside/);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, ['', 'styles.css', 'app.js'].map(path => ['GET', url + path]));
});

test('phone touch reaches the far side, looks around, and returns with a running clock; reduced motion is immediate', async t => {
  const { page, errors } = await opened(t, { ...devices['iPhone 13'], defaultBrowserType: undefined });
  await earthEntry(page, 'Pick a place', 'tap');
  await chooseCity(page, 'Sydney');
  await openPanel(page, 'Time');
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
  await openPanel(page, 'View');
  await page.getByText(/Moon blocks the view/).waitFor();
  await button(page, 'View').tap();
  assert.deepEqual(await earthPaint(page), { lit: 0, dark: 0, shift: 0 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const oldBearing = await page.locator('#bearing').textContent();
  const { x, y } = await region(page).boundingBox();
  const touch = await page.context().newCDPSession(page);
  await touchGesture(touch, [[[x + 100, y + 120]], [[x + 154, y + 55]]]);
  await page.waitForFunction(old => document.getElementById('bearing').textContent !== old, oldBearing);
  const returnedFrom = await clock(page);
  await openPanel(page, 'Travel');
  await button(page, 'Return to Earth').tap();
  await rocket(page).waitFor({ state: 'visible' });
  await skipRide(page).tap();
  await heading(page, 'Surface sky');
  await flag(page).waitFor({ state: 'visible' });
  assert.ok(Date.parse(await clock(page)) > Date.parse(returnedFrom));
  await openPanel(page, 'Time');
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
  await openPanel(page, 'Travel');
  await button(page, 'Return to Earth').tap();
  await rocket(page).waitFor({ state: 'visible' });
  await page.locator('#space').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('status').filter({ hasText: '3D was interrupted' }).waitFor();
  await heading(page, 'Lunar sky');
  assert.equal(await clock(page), paused);
  assert.equal(await page.locator('#site').textContent(), 'Far-side equator');
  await openPanel(page, 'Travel');
  await button(page, 'Return to Earth').tap();
  await heading(page, 'Surface sky');
  await flag(page).waitFor({ state: 'visible' });
  assert.equal(await clock(page), paused);
  assert.equal(await page.locator('#site').textContent(), 'Sydney');
  await page.getByRole('status').filter({ hasText: '3D is unavailable' }).waitFor();
  assert.deepEqual(errors, []);
});
