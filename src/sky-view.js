import { patterns, RAD } from './astronomy.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const direction = ({ azimuth, altitude }) => {
  const a = azimuth * RAD, e = altitude * RAD;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a, b, t) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(' ')})`;

// Clip a projected chord to the square around the optical field before sampling.
// The lens pushes outward, so none of the excluded geometry can re-enter.
function fieldSpan(a, b, x, y, radius) {
  let from = 0, to = 1;
  for (const key of ['x', 'y']) {
    const center = key === 'x' ? x : y;
    const offset = a[key] - center, delta = b[key] - a[key];
    if (!delta) {
      if (Math.abs(offset) > radius) return null;
      continue;
    }
    const low = (-radius - offset) / delta, high = (radius - offset) / delta;
    from = Math.max(from, Math.min(low, high));
    to = Math.min(to, Math.max(low, high));
    if (from >= to) return null;
  }
  return [from, to];
}

export function skyView(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  function draw(sky, camera, options, width, height, dpi, eyepiece = false) {
    ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    const cx = width / 2, cy = height / 2, field = Math.min(cx, cy);
    // Keep the optical axis fixed; increase focal length to narrow the field of view.
    const f = camera.magnification * height / (2 * Math.tan(32 * RAD));
    const az = camera.az * RAD, pitch = camera.alt * RAD;
    const forward = direction({ azimuth: camera.az, altitude: camera.alt });
    const right = [Math.cos(az), 0, -Math.sin(az)];
    const up = [-Math.sin(pitch) * Math.sin(az), Math.cos(pitch), -Math.sin(pitch) * Math.cos(az)];
    const horizon = clamp(height / 2 + f * Math.tan(pitch), 0, height);
    const hasHorizon = horizon > 0 && horizon < height;
    function throughLens(x, y) {
      const dx = x - cx, dy = y - cy;
      const r2 = (dx * dx + dy * dy) / (field * field);
      // Pincushion: little displacement at the axis, stronger toward the rim.
      // Extend the radial curve with its tangent outside the field to stay monotone.
      const scale = r2 <= 1 ? 1 + .18 * r2 * r2 : 1.9 - .72 / Math.sqrt(r2);
      return { x: cx + scale * dx, y: cy + scale * dy };
    }
    const lensPath = (path, x, y, first) => {
      const p = throughLens(x, y);
      if (first) path.moveTo(p.x, p.y);
      else path.lineTo(p.x, p.y);
    };
    let horizonLine, skyClip, groundClip;
    if (eyepiece && hasHorizon) {
      horizonLine = new Path2D();
      const left = throughLens(0, horizon), right = throughLens(width, horizon);
      // Only the central square can show through the aperture. Sample that
      // span at a fixed density on wide layouts as well as portrait ones.
      horizonLine.moveTo(left.x, left.y);
      for (let i = 0; i <= 48; i++) lensPath(horizonLine, cx + field * (i / 24 - 1), horizon);
      horizonLine.lineTo(right.x, right.y);
      const closeAt = y => {
        const path = new Path2D(horizonLine);
        path.lineTo(right.x, y); path.lineTo(left.x, y); path.closePath();
        return path;
      };
      skyClip = closeAt(0); groundClip = closeAt(height);
    }
    const glare = sky.airless ? 0 : options.glare * clamp((sky.sun.altitude + 13) / 19, 0, 1);
    if (sky.airless) ctx.fillStyle = '#070910';
    else {
      const grad = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
      grad.addColorStop(0, mix([4, 9, 20], [32, 87, 141], glare));
      grad.addColorStop(1, mix([16, 30, 47], [113, 162, 185], glare));
      ctx.fillStyle = grad;
    }
    ctx.fillRect(0, 0, width, height);

    function project(v) {
      const depth = dot(v, forward);
      return depth > 0.015 ? { x: cx + f * dot(v, right) / depth,
        y: cy - f * dot(v, up) / depth, depth } : null;
    }
    function constellationChord(a, b) {
      const da = dot(a, forward), db = dot(b, forward), near = .02;
      if (da < near && db < near) return;
      const interpolate = (from, to, t) => from.map((v, i) => v + (to[i] - v) * t);
      // Perspective still makes the chord straight. Clip it first, then bend
      // the visible portion instead of spending samples outside the aperture.
      const start = project(da < near ? interpolate(a, b, (near - da) / (db - da)) : a);
      const end = project(db < near ? interpolate(b, a, (near - db) / (da - db)) : b);
      const span = fieldSpan(start, end, cx, cy, field);
      if (!span) return;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const t = span[0] + (span[1] - span[0]) * i / 16;
        lensPath(ctx, start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t, i === 0);
      }
      ctx.stroke();
    }
    function label(text, x, y) {
      ctx.strokeStyle = '#101926'; ctx.lineWidth = 3;
      ctx.strokeText(text, x, y); ctx.fillStyle = '#f1f6ff'; ctx.fillText(text, x, y);
    }
    function circle(x, y, r, color) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
    }
    function lensEllipse(x, y, rx, ry, color) {
      ctx.beginPath();
      for (let i = 0; i < 64; i++) {
        const a = i * Math.PI / 32;
        lensPath(ctx, x + rx * Math.cos(a), y + ry * Math.sin(a), i === 0);
      }
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }

    ctx.save();
    if (skyClip) ctx.clip(skyClip);
    else { ctx.beginPath(); ctx.rect(0, 0, width, horizon); ctx.clip(); }
    ctx.font = '14px system-ui';
    ctx.globalAlpha = Math.max(0, 1 - glare * 1.14);
    if (options.lines) {
      const byName = new Map(sky.stars.map(star => [star.name, star]));
      ctx.strokeStyle = '#76a6bd'; ctx.lineWidth = 1;
      for (const names of patterns) {
        for (let i = 1; i < names.length; i++) {
          const a = direction(byName.get(names[i - 1])), b = direction(byName.get(names[i]));
          if (eyepiece) { constellationChord(a, b); continue; }
          // Project segments of the great-circle chord; the horizon clip removes the hidden part.
          let previous = project(a);
          for (let j = 1; j <= 12; j++) {
            const next = project(a.map((v, k) => v + (b[k] - v) * j / 12));
            if (previous && next) {
              ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(next.x, next.y); ctx.stroke();
            }
            previous = next;
          }
        }
      }
    }
    const occupied = [];
    for (const obj of [...sky.planets, ...sky.stars]) {
      if (obj.altitude <= 0) continue;
      const pt = project(direction(obj));
      if (!pt || pt.x < 0 || pt.x > width || pt.y < 0 || pt.y > horizon) continue;
      const p = eyepiece ? throughLens(pt.x, pt.y) : pt;
      if (eyepiece && Math.hypot(p.x - cx, p.y - cy) > field + 5) continue;
      const planet = obj.diameter !== undefined;
      circle(p.x, p.y, clamp((planet ? 3.4 : 2.3) - obj.magnitude * .29, 1, 5), planet ? '#ffddb0' : '#eaf5ff');
      if (options.labels && (planet || obj.magnitude < 1.5 || obj.name === 'Polaris')) {
        const x = p.x + 8, y = p.y - 5, w = ctx.measureText(obj.name).width;
        if (x + w < width && y > 14 && !occupied.some(b => x < b.x + b.w && x + w > b.x && Math.abs(y - b.y) < 15)) {
          label(obj.name, x, y); occupied.push({ x, y, w });
        }
      }
    }
    ctx.globalAlpha = 1;
    const sunVector = direction(sky.sun);
    for (const obj of sky.airless ? [sky.sun] : [sky.sun, sky.moon]) {
      if (obj.altitude < -obj.diameter / 2) continue;
      const v = direction(obj), projected = project(v);
      if (!projected) continue;
      const { x, y, depth } = projected;
      const r = f * Math.tan(obj.diameter * RAD / 2) / depth;
      if (x + r < 0 || x - r > width || y + r < 0 || y - r > horizon) continue;
      if (obj === sky.sun) {
        if (eyepiece) lensEllipse(x, y, r, r, '#fff0bd');
        else circle(x, y, r, '#fff0bd');
      } else {
        const toward = sunVector.map((x, i) => v[i] + .01 * (x - dot(sunVector, v) * v[i]));
        const light = project(toward);
        const angle = light ? Math.atan2(light.y - y, light.x - x) : 0;
        if (eyepiece) {
          const cos = Math.cos(angle), sin = Math.sin(angle);
          const point = (u, w, first) => lensPath(ctx, x + u * cos - w * sin, y + u * sin + w * cos, first);
          const disk = (terminator, color) => {
            ctx.beginPath();
            for (let i = 0; i <= 32; i++) {
              const a = Math.PI * (i / 32 - .5);
              point(r * Math.cos(a), r * Math.sin(a), i === 0);
            }
            for (let i = 1; i <= 32; i++) {
              const a = Math.PI * i / 32;
              point(terminator * r * Math.sin(a), r * Math.cos(a));
            }
            ctx.closePath(); ctx.fillStyle = color; ctx.fill();
          };
          disk(-1, '#34404e');
          disk(1 - 2 * sky.illumination, '#f4ead7');
        } else {
          circle(x, y, r, '#34404e');
          ctx.save(); ctx.translate(x, y);
          if (light) ctx.rotate(angle);
          ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
          for (let i = 1; i <= 24; i++) {
            const a = Math.PI * i / 24;
            ctx.lineTo((1 - 2 * sky.illumination) * r * Math.sin(a), r * Math.cos(a));
          }
          ctx.closePath(); ctx.fillStyle = '#f4ead7'; ctx.fill(); ctx.restore();
        }
      }
      if (options.labels) {
        // Map the pre-lens limb once; the text offset stays in screen pixels.
        const limb = eyepiece ? throughLens(projected.x + r, projected.y) : { x: x + r, y };
        label(obj.name, limb.x + 6, limb.y - 4);
      }
    }
    if (sky.earth?.visible) {
      const earth = sky.earth, v = direction(earth), p = project(v);
      // Build the disk in its own angular tangent plane, then project the limb
      // and terminator. This preserves scale and orientation off camera centre.
      if (p && p.depth > .25) {
        const east = [Math.cos(earth.azimuth * RAD), 0, -Math.sin(earth.azimuth * RAD)];
        const north = direction({ azimuth: earth.azimuth + 180, altitude: 90 - earth.altitude });
        const angle = Math.atan2(dot(earth.light, north), dot(earth.light, east));
        const radius = Math.tan(earth.diameter * RAD / 2);
        function point(x, y, first) {
          const u = radius * (x * Math.cos(angle) - y * Math.sin(angle));
          const w = radius * (x * Math.sin(angle) + y * Math.cos(angle));
          const pt = project(v.map((value, i) => value + u * east[i] + w * north[i]));
          if (eyepiece) lensPath(ctx, pt.x, pt.y, first);
          else if (first) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        function limb() {
          for (let i = 0; i <= 32; i++) {
            const a = Math.PI * i / 32 - Math.PI / 2;
            point(Math.cos(a), Math.sin(a), i === 0);
          }
        }
        function disk(terminator, color) {
          ctx.beginPath(); limb();
          for (let i = 1; i <= 32; i++) {
            const a = Math.PI * i / 32;
            point(terminator * Math.sin(a), Math.cos(a));
          }
          ctx.closePath(); ctx.fillStyle = color; ctx.fill();
        }
        disk(-1, '#182635');
        disk(1 - 2 * earth.illumination, '#87cee6');
        if (options.labels) {
          const x = p.x + f * radius / p.depth;
          const anchor = eyepiece ? throughLens(x, p.y) : { x, y: p.y };
          label('Earth', anchor.x + 6, anchor.y - 4);
        }
      }
    }
    ctx.restore();

    ctx.fillStyle = sky.airless ? '#3a373f' : '#111d22';
    if (groundClip) ctx.fill(groundClip);
    else ctx.fillRect(0, horizon, width, height - horizon);
    if (sky.airless && horizon < height) {
      const depth = height - horizon;
      // Map the regolith with the same geometry as the horizon.
      for (const [x, y, size] of [[.18, .25, .07], [.59, .58, .11], [.85, .83, .14], [.35, .9, .09]]) {
        const location = ((x - camera.az / 180) % 1 + 1) % 1;
        if (eyepiece) {
          lensEllipse(location * width, horizon + y * depth, size * width, .065 * depth, '#514b54');
          lensEllipse(location * width, horizon + (y - .016) * depth, size * width * .87, .047 * depth, '#2c2a32');
          continue;
        }
        ctx.beginPath();
        ctx.ellipse(location * width, horizon + y * depth, size * width, .065 * depth, 0, 0, 2 * Math.PI);
        ctx.fillStyle = '#514b54'; ctx.fill();
        ctx.beginPath();
        ctx.ellipse(location * width, horizon + (y - .016) * depth, size * width * .87, .047 * depth, 0, 0, 2 * Math.PI);
        ctx.fillStyle = '#2c2a32'; ctx.fill();
      }
    }
    if (hasHorizon) {
      const color = sky.airless ? '#8a838c' : '#6b9292';
      if (horizonLine) {
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(horizonLine);
      } else {
        ctx.fillStyle = color; ctx.fillRect(0, horizon, width, 1);
      }
      ctx.font = '14px system-ui';
      for (const [azimuth, name] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
        const p = project(direction({ azimuth, altitude: 0 }));
        if (p) {
          const anchor = eyepiece ? throughLens(p.x, horizon) : { x: p.x, y: horizon };
          label(name, anchor.x - 4, anchor.y + (anchor.y > height - 24 ? -8 : 22));
        }
      }
    }
  }
  return { draw };
}
