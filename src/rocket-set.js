import * as T from 'three';
import { paintedTexture, piece, seededRandom } from './rocket-models.js';

export function starField() {
  const random = seededRandom(309);
  const field = new T.Group();
  for (const [count, size, color] of [[1150, 1.5, '#62769a'], [240, 2.4, '#b6c9e8'], [45, 3.1, '#ffe9cb']]) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const theta = random() * 2 * Math.PI, y = random() * 2 - 1, r = Math.sqrt(1 - y * y);
      positions.push(335 * r * Math.cos(theta), 335 * y, 335 * r * Math.sin(theta));
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    field.add(new T.Points(geometry, new T.PointsMaterial({ size, sizeAttenuation: false, color })));
  }
  return field;
}

export function moonTexture() {
  return paintedTexture(768, 384, (ctx, w, h) => {
    const random = seededRandom(113);
    ctx.fillStyle = '#9c9290'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const x = random() * w, y = random() * h, radius = 2 + random() ** 4 * 43;
      const tone = random() < .5 ? '#dccac0' : '#4d4c5a';
      const fade = ctx.createRadialGradient(x, y, 0, x, y, radius);
      fade.addColorStop(0, tone + '53'); fade.addColorStop(1, tone + '00');
      ctx.fillStyle = fade; ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
    }
    for (let i = 0; i < 560; i++) {
      const x = random() * w, y = random() * h, r = 1.5 + random() ** 6 * 27;
      ctx.lineWidth = .65 + r * .13;
      for (const wrap of [-w, 0, w]) {
        ctx.beginPath(); ctx.ellipse(x + wrap, y, r, r * .83, .22, 0, 2 * Math.PI);
        ctx.fillStyle = '#53506045'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + wrap, y, r, r * .83, .22, .4, 3.55);
        ctx.strokeStyle = '#ecdbce7c'; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x + wrap, y, r, r * .83, .22, 3.55, 6.68);
        ctx.strokeStyle = '#3737484f'; ctx.stroke();
      }
    }
  });
}

export function landingTerrain(clay, earth) {
  const group = new T.Group();
  const base = clay(earth ? '#3d6859' : '#766e7c');
  const paint = clay(earth ? '#c9d9a4' : '#c4b1a9');
  const rock = clay(earth ? '#678477' : '#a79ca1');
  const pad = new T.CylinderGeometry(4.33, 4.52, .18, 64);
  piece(group, pad, base, .73, -.09, .12);
  const perimeter = piece(group, new T.RingGeometry(3.95, 4.02, 64), paint, .73, .003, .12);
  perimeter.rotation.x = -Math.PI / 2;
  const stripe = new T.BoxGeometry(.09, .014, .31);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    piece(group, stripe, paint, .73 + 3.64 * Math.sin(a), .006, .12 + 3.64 * Math.cos(a)).rotation.y = a;
  }
  const rockGeometry = new T.IcosahedronGeometry(1, 1);
  const rocks = new T.InstancedMesh(rockGeometry, rock, 65);
  const random = seededRandom(earth ? 24 : 61), dummy = new T.Object3D();
  const radius = earth ? 19.055 : 6.955;
  for (let i = 0; i < rocks.count; i++) {
    const a = random() * 2 * Math.PI, r = 4.75 + random() * (earth ? 5.5 : 1.8);
    const size = .065 + .24 * random() ** 2;
    const y = Math.sqrt(radius * radius - r * r) - radius;
    dummy.position.set(r * Math.sin(a), y + size * .38, r * Math.cos(a));
    dummy.rotation.set(random(), a, random()); dummy.scale.set(size * 1.35, size, size * .83);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  group.add(rocks);
  return group;
}

export function cloud(kind) {
  const exhaust = kind === 'exhaust';
  const group = new T.Group(), random = seededRandom(exhaust ? 202 : 26);
  const chunks = new T.IcosahedronGeometry(1, 1);
  const swatches = (exhaust ? ['#fff0a2', '#ffb46d', '#e0775f'] : ['#ffd78b', '#e99848', '#ffe2ab'])
    .map(color => new T.MeshStandardMaterial({ color, roughness: .9, flatShading: true,
      ...(exhaust ? { emissive: color, emissiveIntensity: .57 } : {}) }));
  const specks = Array.from({ length: exhaust ? 20 : 36 }, (_, i) => ({
    mesh: piece(group, chunks, swatches[i % swatches.length]), phase: i / (exhaust ? 20 : 36),
    angle: random() * 2 * Math.PI, speed: .65 + 2.65 * random(), size: .065 + .17 * random(),
  }));
  function update(time, force) {
    group.visible = exhaust ? force > 0 : time >= 0 && time < .86;
    if (!group.visible) return;
    for (const { mesh, phase, angle, speed, size } of specks) {
      const age = exhaust ? (time * 2.1 + phase) % 1 : time;
      const spread = (exhaust ? .13 + age * .56 : speed * age);
      const y = exhaust ? .40 - (age * 2.25 + .13) * force : Math.max(-.65, (1.5 + speed * .43) * age - 5.1 * age * age);
      mesh.position.set(Math.cos(angle) * spread, y, Math.sin(angle) * spread);
      mesh.rotation.set(age * 8 + angle, age * 7 + phase, angle);
      mesh.scale.setScalar(size * (exhaust ? (1 - age * .8) * force * 1.64 : Math.max(0, 1 - (age / .86) ** 3)));
    }
  }
  return { group, update };
}

export function clayFlag(clay) {
  const group = new T.Group(); group.rotation.y = .23;
  const pole = new T.Group(); group.add(pole);
  const brass = clay('#e8af60'), staff = clay('#fff0c1');
  const sphere = new T.SphereGeometry(1, 16, 10);
  piece(pole, new T.CylinderGeometry(.043, .07, 2.65, 12), staff, 0, 1.325);
  piece(pole, sphere, brass, 0, 2.69, 0, .102);
  const flagPaint = paintedTexture(384, 208, (ctx, w, h) => {
    ctx.fillStyle = '#f9be56'; ctx.fillRect(0, 0, w, h);
    const random = seededRandom(25);
    for (let i = 0; i < 2800; i++) {
      ctx.fillStyle = random() < .5 ? '#ffefad45' : '#97502e24';
      ctx.fillRect(random() * w, random() * h, 2, 2);
    }
    for (const [x, y, r] of [[42, 46, 14], [90, 141, 23], [140, 83, 24], [203, 136, 14], [240, 48, 21], [304, 98, 15], [355, 57, 9]]) {
      const crater = ctx.createRadialGradient(x - r * .27, y - r * .38, 1, x, y, r);
      crater.addColorStop(0, '#b5692e'); crater.addColorStop(.74, '#d48636'); crater.addColorStop(.93, '#ffe38d'); crater.addColorStop(1, '#f9be56');
      ctx.fillStyle = crater; ctx.beginPath(); ctx.ellipse(x, y, r, r * .82, 0, 0, Math.PI * 2); ctx.fill();
    }
  });
  const cloth = new T.PlaneGeometry(1, 1, 40, 12);
  const fabric = piece(group, cloth, new T.MeshStandardMaterial({ map: flagPaint,
    bumpMap: flagPaint, bumpScale: .055, roughness: .89, side: T.DoubleSide }));
  fabric.frustumCulled = false;
  function update(time, raised, open) {
    group.visible = raised > 0;
    if (!group.visible) return;
    pole.scale.y = raised;
    const p = cloth.attributes.position, uv = cloth.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const loose = Math.min(u, open), rolled = Math.max(0, u - open);
      const wrap = rolled * 19;
      const wave = .18 * Math.sin(loose * 8 - time * 5) * loose * (1 - .85 * open);
      // Undeployed material is wound around an axis at the moving edge.
      p.setXYZ(i, .035 + 1.83 * loose + .103 * Math.sin(wrap),
        raised * (2.51 - (1 - v) * (.90 - .27 * u)) - .09 * loose,
        wave + .103 * (1 - Math.cos(wrap)));
    }
    p.needsUpdate = true; cloth.computeVertexNormals();
  }
  return { group, update };
}
