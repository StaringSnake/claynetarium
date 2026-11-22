import * as T from 'three';
import { feature } from 'topojson-client';
import land from 'world-atlas/land-110m.json';
import { seededRandom } from './rocket-models.js';

const width = 1024, height = 512, count = width * height;
const { clamp, lerp, smoothstep } = T.MathUtils;

function mapCanvas() {
  return Object.assign(document.createElement('canvas'), { width, height });
}

function unwrapRing(ring) {
  let last = ring[0][0], offset = 0;
  let left = last, right = last;
  const points = ring.map(([lon, lat]) => {
    if (Math.abs(lon - last) > 180) offset -= Math.sign(lon - last) * 360;
    last = lon;
    const unwrapped = lon + offset;
    left = Math.min(left, unwrapped);
    right = Math.max(right, unwrapped);
    return [unwrapped, lat];
  });
  if (offset) {
    // A ring that winds around the world closes through its pole, not across the map.
    const pole = ring[0][1] < 0 ? -90 : 90;
    points.push([last + offset, pole], [last, pole]);
  }
  return { points, left, right, middle: (left + right) / 2 };
}

function traceRing(ctx, ring, offset) {
  const x = lon => (lon + 180) * width / 360;
  const y = lat => (90 - lat) * height / 180;
  ctx.moveTo(x(ring[0][0] + offset), y(ring[0][1]));
  for (let i = 1; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    ctx.lineTo(x(lon + offset), y(lat));
  }
  ctx.closePath();
}

function* paintLand(ctx) {
  ctx.fillStyle = '#fff';
  for (const { geometry } of feature(land, land.objects.land).features) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      const [outer, ...holes] = polygon.map(unwrapRing);
      const first = Math.ceil((-180 - outer.right) / 360);
      const last = Math.floor((180 - outer.left) / 360);
      for (let copy = first; copy <= last; copy++) {
        ctx.beginPath();
        traceRing(ctx, outer.points, copy * 360);
        for (const hole of holes) {
          // Shift each independently unwrapped hole into its exterior ring's chart.
          const wraps = Math.round((outer.middle - hole.middle) / 360);
          traceRing(ctx, hole.points, (copy + wraps) * 360);
        }
        ctx.fill('evenodd');
      }
      yield;
    }
  }
}

// Round the land step without moving the coastline in the color map.
function* softenCoast(mask) {
  const across = new Float32Array(count), bevel = new Float32Array(count);
  const radius = 7, diameter = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const at = x => mask[(row + ((x + width) % width)) * 4 + 3];
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += at(x);
    for (let x = 0; x < width; x++) {
      across[row + x] = sum / diameter;
      sum += at(x + radius + 1) - at(x - radius);
    }
    if (y % 8 === 7) yield;
  }
  for (let x = 0; x < width; x++) {
    const at = y => across[clamp(y, 0, height - 1) * width + x];
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += at(y);
    for (let y = 0; y < height; y++) {
      bevel[y * width + x] = smoothstep(sum / (diameter * 255), 0, 1);
      sum += at(y + radius + 1) - at(y - radius);
    }
    if (x % 16 === 15) yield;
  }
  return bevel;
}

function noiseAxis(gridSize, pixelSize) {
  return Array.from({ length: pixelSize }, (_, i) => {
    const value = (i + .5) * gridSize / pixelSize, cell = Math.floor(value);
    return { cell, blend: smoothstep(value - cell, 0, 1) };
  });
}

function noiseField(random, columns, rows) {
  const values = Float32Array.from({ length: columns * (rows + 1) }, () => random() * 2 - 1);
  const horizontal = noiseAxis(columns, width), vertical = noiseAxis(rows, height);
  return y => {
    const row = vertical[y].cell * columns, t = vertical[y].blend;
    return x => {
      const { cell, blend } = horizontal[x];
      const a = row + cell, b = row + (cell + 1 === columns ? 0 : cell + 1);
      return lerp(lerp(values[a], values[b], blend), lerp(values[a + columns], values[b + columns], blend), t);
    };
  };
}

// A few broken, curved drag marks, not a fingerprint or scratch tile over the entire body.
function* dragMarks(marks) {
  const grooves = new Float32Array(count);
  for (const [lon, lat, radius, tilt] of marks) {
    const centerX = (180 + lon) * width / 360, centerY = (90 - lat) * height / 180;
    const stretch = Math.cos(lat * Math.PI / 180), sin = Math.sin(tilt), cos = Math.cos(tilt);
    for (let y = Math.ceil(centerY - radius); y < centerY + radius; y++) {
      for (let x = Math.ceil(centerX - radius / stretch); x < centerX + radius / stretch; x++) {
        const dx = (x - centerX) * stretch / radius, dy = (y - centerY) / radius;
        const u = dx * cos + dy * sin, v = dy * cos - dx * sin;
        const fade = 1 - smoothstep(Math.abs(u + .10), .25, .80);
        if (!fade) continue;
        const drag = v - (.53 * u * u + .03 * Math.sin(7 * u));
        const crease = 1 - smoothstep(Math.abs(drag), .015, .115);
        const echo = 1 - smoothstep(Math.abs(drag + .23), .02, .12);
        grooves[y * width + (x + width) % width] += fade * (crease + .43 * echo);
      }
      if (y % 8 === 7) yield;
    }
  }
  return grooves;
}

function* bakeClay(seed, paint) {
  const albedo = new Uint8ClampedArray(count * 4), relief = new Uint8ClampedArray(count);
  const random = seededRandom(seed);
  const folds = noiseField(random, 13, 9), grain = noiseField(random, 180, 96);
  for (let y = 0; y < height; y++) {
    const foldRow = folds(y), grainRow = grain(y);
    // Atlas rows run north to south; typed GPU uploads start at UV y = 0 (south).
    for (let x = 0; x < width; x++) {
      const tint = foldRow(x), tooth = grainRow(x);
      paint(albedo, relief, (height - 1 - y) * width + x, y * width + x, tint, tooth);
    }
    if (y % 8 === 7) yield;
  }
  const texture = (pixels, format, colorSpace) => {
    const map = new T.DataTexture(pixels, width, height, format, T.UnsignedByteType);
    map.wrapS = T.RepeatWrapping;
    map.colorSpace = colorSpace;
    map.magFilter = T.LinearFilter;
    map.minFilter = T.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  };
  return {
    map: texture(albedo, T.RGBAFormat, T.SRGBColorSpace),
    bumpMap: texture(relief, T.RedFormat, T.NoColorSpace),
  };
}

function* clayEarth() {
  const ctx = mapCanvas().getContext('2d', { willReadFrequently: true });
  yield* paintLand(ctx);
  const mask = ctx.getImageData(0, 0, width, height).data;
  yield;
  const bevel = yield* softenCoast(mask);
  const grooves = yield* dragMarks([
    [-91, 37, 38, -.65], [-58, -14, 31, -1], [-36, 9, 39, .45],
    [21, 21, 37, .48], [57, -30, 41, .88], [111, 39, 43, -.40],
    [147, -16, 38, -.65], [-153, 11, 46, .55], [176, 59, 40, .82],
  ]);
  return yield* bakeClay(172, (albedo, relief, i, source, fold, grain) => {
    const j = i * 4, land = mask[source * 4 + 3] / 255, height = bevel[source];
    const shoulder = Math.max(0, land - height), contact = Math.max(0, height - land);
    const groove = grooves[source], tint = 10 * fold + 2.5 * grain - 13 * groove;
    // A warm rolled shoulder and a darker weld on the blue underneath keep
    // the pressed slab readable even when the Sun hits the seam head-on.
    albedo[j] = lerp(56, 130 + 23 * fold, land) + tint + 42 * shoulder - 34 * contact;
    albedo[j + 1] = lerp(122, 180 + 9 * fold, land) + tint + 34 * shoulder - 62 * contact;
    albedo[j + 2] = lerp(170, 99 + 7 * fold, land) + tint + 17 * shoulder - 61 * contact;
    albedo[j + 3] = 255;
    relief[i] = 64 + (127 + 22 * fold) * height + 18 * fold + 3 * grain - 28 * groove;
  });
}

function* lunarImpressions() {
  const stamps = new Float32Array(count);
  const angle = 2 * Math.PI / width, random = seededRandom(531);
  const nearAndFar = [[-38, 12, 15], [43, 31, 13], [45, -33, 17], [-8, -37, 11],
    [-109, -14, 14], [-150, 31, 16], [138, 9, 18], [103, 35, 13], [104, -29, 12], [175, -36, 14]];
  const rad = Math.PI / 180;
  const craters = nearAndFar.map(([lon, lat, radius]) => [lon * rad, lat * rad, radius * rad]);
  for (let i = 0; i < 86; i++) {
    craters.push([(random() * 2 - 1) * Math.PI, Math.asin(random() * 2 - 1), .026 + .12 * random() ** 2.5]);
  }
  for (const [lon, lat, radius] of craters) {
    const depth = .32 + 2.25 * radius, phase = random() * 6;
    const extent = radius * 1.18;
    const north = Math.max(0, Math.floor((Math.PI / 2 - lat - extent) / angle));
    const south = Math.min(height - 1, Math.floor((Math.PI / 2 - lat + extent) / angle));
    const sag = 1 - Math.cos(radius), outer = Math.cos(extent);
    for (let y = north; y <= south; y++) {
      const rowLat = Math.PI / 2 - (y + .5) * angle;
      const rowCos = Math.cos(rowLat);
      const a = Math.sin(rowLat) * Math.sin(lat), b = rowCos * Math.cos(lat);
      const rimY = .065 * Math.sin(4.5 * (rowLat - lat) / radius - phase);
      const reach = Math.acos(clamp((outer - a) / b, -1, 1));
      const west = Math.ceil((lon - reach + Math.PI) / angle - .5);
      const east = Math.floor((lon + reach + Math.PI) / angle - .5);
      for (let x = west; x <= east; x++) {
        const delta = (x + .5) * angle - Math.PI - lon;
        const round = Math.sqrt(Math.max(0, (1 - a - b * Math.cos(delta)) / sag));
        const wobble = .095 * Math.sin(4.2 * Math.sin(delta) * rowCos / radius + phase) + rimY;
        const distance = round / (1 + wobble);
        const bowl = 1 - smoothstep(distance, .16, .84);
        const lip = smoothstep(distance, .64, .86) * (1 - smoothstep(distance, .86, 1));
        const i = y * width + ((x + width) % width);
        stamps[i] = clamp(stamps[i] + depth * (.54 * lip - bowl), -1.25, .54);
      }
      if ((y - north) % 8 === 7) yield;
    }
    yield;
  }
  return stamps;
}

function* clayMoon() {
  const stamps = yield* lunarImpressions();
  const grooves = yield* dragMarks([
    [-22, 38, 39, .50], [10, -2, 41, -.83], [-63, -28, 39, -.62],
    [69, 6, 46, .67], [112, 38, 48, -.5], [-167, 1, 43, .74], [151, -41, 46, -1.02],
  ]);
  return yield* bakeClay(389, (albedo, relief, i, source, fold, grain) => {
    const j = i * 4, impression = stamps[source];
    const groove = grooves[source], tint = 14 * fold + 2.5 * grain + 51 * impression - 12 * groove;
    albedo[j] = 175 + tint;
    albedo[j + 1] = 157 + tint;
    albedo[j + 2] = 152 + tint;
    albedo[j + 3] = 255;
    relief[i] = 149 + 92 * impression + 19 * fold + 3 * grain - 27 * groove;
  });
}

export function bodySurfaces(onReady) {
  const earth = new T.MeshLambertMaterial({ color: '#387aaa', bumpScale: 2.0 });
  const moon = new T.MeshLambertMaterial({ color: '#af9d98', bumpScale: 2.1 });
  const pending = [], jobs = [[earth, clayEarth], [moon, clayMoon]];

  function schedule() {
    // Each slice is a separate task after a frame, never inside either draw().
    requestAnimationFrame(() => setTimeout(bakeSlice, 0));
  }

  function bakeSlice() {
    if (!pending.length) return;
    const deadline = performance.now() + 4;
    const { material, steps } = pending[0];
    for (let i = 0; i < 24; i++) {
      let next;
      try {
        next = steps.next();
      } catch {
        // Keep the shared flat material on failure and let the other body finish.
        pending.shift();
        break;
      }
      if (next.done) {
        Object.assign(material, next.value);
        material.color.set(0xffffff);
        material.needsUpdate = true;
        pending.shift();
        onReady();
        break;
      }
      if (performance.now() >= deadline) break;
    }
    if (pending.length) schedule();
  }

  function request(includeMoon) {
    const baking = pending.length > 0;
    const count = includeMoon ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const [material, bake] = jobs[i];
      if (!bake) continue;
      pending.push({ material, steps: bake() });
      jobs[i][1] = null;
    }
    if (!baking && pending.length) schedule();
  }

  return { earth, moon, request, cancel: () => { pending.length = 0; } };
}
