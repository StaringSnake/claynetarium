const TAU = 2 * Math.PI;
const HALF_HEIGHT = .30;
const TEXELS_PER_FLECK = 256;

// Bake a repeatable cheese-paste texture with recessed eyes, curd flecks and highlighted lips.
function texture(width, height, columns, rows, seed) {
  const tile = document.createElement('canvas');
  tile.width = width; tile.height = height;
  const ctx = tile.getContext('2d');
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  ctx.fillStyle = '#edab50'; ctx.fillRect(0, 0, width, height);
  // Keep subtle grain proportional to texture area without thousands of startup paths per tile.
  const flecks = Math.ceil(width * height / TEXELS_PER_FLECK);
  for (let i = 0; i < flecks; i++) {
    ctx.fillStyle = random() < .52 ? '#ffe2a024' : '#9b4d241c';
    ctx.beginPath();
    ctx.ellipse(random() * width, random() * height, 1 + random() * 8, .6 + random() * 2.3, random() * Math.PI, 0, TAU);
    ctx.fill();
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const x = (col + .18 + random() * .64) * width / columns;
    const y = (row + .18 + random() * .64) * height / rows;
    const r = width / columns * (.07 + random() ** 1.4 * .24);
    const stretch = .65 + random() * .55, angle = (random() - .5) * .8;
    // Repeat just across the seam of the cylindrical wall.
    for (const offset of [-width, 0, width]) {
      if (x + offset + r * 1.2 < 0 || x + offset - r * 1.2 > width) continue;
      ctx.save(); ctx.translate(x + offset, y); ctx.rotate(angle); ctx.scale(r, r * stretch);
      const rim = ctx.createLinearGradient(0, -1.1, 0, 1.1);
      rim.addColorStop(0, '#bc7133'); rim.addColorStop(1, '#ffdb89');
      ctx.fillStyle = rim;
      ctx.beginPath(); ctx.ellipse(0, 0, 1.08, 1.12, 0, 0, TAU); ctx.fill();
      const inside = ctx.createRadialGradient(-.28, -.52, .08, 0, .17, 1.18);
      inside.addColorStop(0, '#542715'); inside.addColorStop(.6, '#87431e'); inside.addColorStop(1, '#d79044');
      ctx.fillStyle = inside;
      ctx.beginPath(); ctx.ellipse(0, -.04, .97, .99, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  return ctx.getImageData(0, 0, width, height).data;
}

export function cheeseView(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  const wall = texture(1024, 256, 15, 4, 11);
  const cap = texture(384, 384, 8, 8, 23);
  let frame;
  return function draw(yaw, pitch, width, height) {
    // Render at a bounded resolution even on Retina and ultrawide displays.
    const scale = Math.min(1, 640 / width, 360 / height);
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    if (!frame || frame.width !== w || frame.height !== h) {
      canvas.width = w; canvas.height = h;
      frame = ctx.createImageData(w, h);
    }
    const focal = Math.max(h, w * .5), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), pixels = frame.data;
    for (let y = 0, i = 0; y < h; y++) {
      const up = (h / 2 - y - .5) / focal;
      const rayY = sp + up * cp, forward = cp - up * sp;
      const capDistance = HALF_HEIGHT / Math.abs(rayY);
      for (let x = 0; x < w; x++, i += 4) {
        const right = (x + .5 - w / 2) / focal;
        const rayX = forward * sy + right * cy, rayZ = forward * cy - right * sy;
        const wallDistance = 1 / Math.sqrt(forward * forward + right * right);
        let source, at, light;
        if (capDistance < wallDistance) {
          const u = rayX * capDistance, v = rayZ * capDistance;
          at = 4 * ((Math.floor((v + 1) * 192) * 384) + Math.floor((u + 1) * 192));
          source = cap;
          const ring = u * u + v * v;
          light = (rayY < 0 ? .86 : .67) + .09 * v - .18 * ring - (ring > .89 ? .15 : 0);
        } else {
          const angle = Math.atan2(rayX, rayZ);
          const againstWall = rayY * wallDistance / HALF_HEIGHT;
          at = 4 * (Math.min(255, Math.floor((1 - againstWall) * 128)) * 1024 + (Math.floor(angle / TAU * 1024) & 1023));
          source = wall;
          const edge = Math.abs(againstWall);
          const edgeSquared = edge * edge;
          light = .99 + .08 * rayZ * wallDistance - .14 * edgeSquared * edgeSquared - (edge > .91 ? .22 : 0);
        }
        pixels[i] = source[at] * light;
        pixels[i + 1] = source[at + 1] * light * (.8 + .2 * light);
        pixels[i + 2] = source[at + 2] * light * (.5 + .5 * light);
        pixels[i + 3] = 255;
      }
    }
    ctx.putImageData(frame, 0, 0);
  };
}
