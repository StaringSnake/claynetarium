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

function* paintLand(ctx, color, wrap = false) {
  ctx.fillStyle = color;
  for (const { geometry } of feature(land, land.objects.land).features) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      const [outer, ...holes] = wrap ? polygon.map(unwrapRing) : [];
      const first = wrap ? Math.ceil((-180 - outer.right) / 360) : 0;
      const last = wrap ? Math.floor((180 - outer.left) / 360) : 0;
      for (let copy = first; copy <= last; copy++) {
        ctx.beginPath();
        if (wrap) {
          traceRing(ctx, outer.points, copy * 360);
          for (const hole of holes) {
            // Shift each independently unwrapped hole into its exterior ring's chart.
            const wraps = Math.round((outer.middle - hole.middle) / 360);
            traceRing(ctx, hole.points, (copy + wraps) * 360);
          }
        } else {
          for (const ring of polygon) traceRing(ctx, ring, 0);
        }
        ctx.fill('evenodd');
      }
      yield;
    }
  }
}

export function rocketEarthMap() {
  const canvas = mapCanvas(), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#234f79'; ctx.fillRect(0, 0, width, height);
  for (const _ of paintLand(ctx, '#80ae95')) { /* Keep the legacy rocket atlas synchronous. */ }
  ctx.strokeStyle = '#cadbcc36'; ctx.lineWidth = 1;
  for (let x = 0; x < width; x += width / 12) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = height / 6; y < height; y += height / 6) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// Round the land step without moving the coastline in the color map.
function* softenCoast(mask) {
  const across = new Float32Array(count), bevel = new Float32Array(count);
  const radius = 4, diameter = 2 * radius + 1;
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

function* bakeClay(seed, bumpScale, paint) {
  const albedo = new Uint8ClampedArray(count * 4), relief = new Uint8ClampedArray(count);
  const random = seededRandom(seed);
  const marbling = noiseField(random, 27, 18), grain = noiseField(random, 240, 112);
  for (let y = 0; y < height; y++) {
    const marblingRow = marbling(y), grainRow = grain(y);
    // Atlas rows run north to south; typed GPU uploads start at UV y = 0 (south).
    for (let x = 0; x < width; x++) {
      const tint = marblingRow(x), tooth = grainRow(x) * .8 + (random() - .5) * .4;
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
  return new T.MeshLambertMaterial({
    map: texture(albedo, T.RGBAFormat, T.SRGBColorSpace),
    bumpMap: texture(relief, T.RedFormat, T.NoColorSpace),
    bumpScale,
  });
}

export function* clayEarth() {
  const ctx = mapCanvas().getContext('2d', { willReadFrequently: true });
  yield* paintLand(ctx, '#fff', true);
  const mask = ctx.getImageData(0, 0, width, height).data;
  yield;
  const bevel = yield* softenCoast(mask);
  return yield* bakeClay(172, 1.5, (albedo, relief, i, source, marble, grain) => {
    const j = i * 4, land = mask[source * 4 + 3] / 255, height = bevel[source];
    const edge = Math.max(0, land - height), contact = Math.max(0, height - land);
    const flecks = 11 * marble + 6 * grain;
    albedo[j] = lerp(47, 133 + 20 * marble, land) + flecks - 16 * edge - 18 * contact;
    albedo[j + 1] = lerp(106, 166 + 6 * marble, land) + flecks - 12 * edge - 44 * contact;
    albedo[j + 2] = lerp(147, 111 - 8 * marble, land) + flecks - 8 * edge - 53 * contact;
    albedo[j + 3] = 255;
    relief[i] = 77 + 106 * height + 10 * marble + 7 * grain;
  });
}

function* lunarImpressions() {
  const stamps = new Float32Array(count);
  const angle = 2 * Math.PI / width, random = seededRandom(531);
  for (let crater = 0; crater < 160; crater++) {
    const lon = (random() * 2 - 1) * Math.PI, lat = Math.asin(random() * 2 - 1);
    const radius = .023 + .22 * random() ** 3, depth = .28 + .72 * radius / .243;
    const north = Math.max(0, Math.floor((Math.PI / 2 - lat - radius) / angle));
    const south = Math.min(height - 1, Math.floor((Math.PI / 2 - lat + radius) / angle));
    const sag = 1 - Math.cos(radius);
    for (let y = north; y <= south; y++) {
      const rowLat = Math.PI / 2 - (y + .5) * angle;
      const a = Math.sin(rowLat) * Math.sin(lat), b = Math.cos(rowLat) * Math.cos(lat);
      const reach = Math.acos(clamp((1 - sag - a) / b, -1, 1));
      const west = Math.ceil((lon - reach + Math.PI) / angle - .5);
      const east = Math.floor((lon + reach + Math.PI) / angle - .5);
      for (let x = west; x <= east; x++) {
        const distance = Math.sqrt(Math.max(0, (1 - a - b * Math.cos((x + .5) * angle - Math.PI - lon)) / sag));
        const bowl = 1 - smoothstep(distance, .20, .76);
        const lip = smoothstep(distance, .52, .79) * (1 - smoothstep(distance, .79, 1));
        const i = y * width + ((x + width) % width);
        stamps[i] = clamp(stamps[i] + depth * (.34 * lip - bowl), -1.35, .60);
      }
      if ((y - north) % 8 === 7) yield;
    }
    yield;
  }
  return stamps;
}

export function* clayMoon() {
  const stamps = yield* lunarImpressions();
  return yield* bakeClay(389, 1.65, (albedo, relief, i, source, marble, grain) => {
    const j = i * 4, impression = stamps[source];
    const tint = 15 * marble + 6 * grain + 32 * impression;
    albedo[j] = 166 + tint;
    albedo[j + 1] = 151 + tint;
    albedo[j + 2] = 148 + tint;
    albedo[j + 3] = 255;
    relief[i] = 153 + 81 * impression + 8 * marble + 9 * grain;
  });
}
