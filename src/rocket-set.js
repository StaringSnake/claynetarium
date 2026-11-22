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

// Hand-pressed puck: only the perimeter drifts; the soles and flag still sit on y=0.
function padRim(angle) {
  return .075 * Math.sin(3 * angle + .45) + .041 * Math.cos(5 * angle - .8)
    + .025 * Math.sin(9 * angle);
}

function pressedPad() {
  const profile = [[0, -.18], [4.11, -.18], [4.32, -.16], [4.43, -.11],
    [4.43, -.069], [4.38, -.032], [4.26, -.007], [4.09, 0], [0, 0]];
  const pad = new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), 64);
  const p = pad.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const swell = 1 + padRim(Math.atan2(x, z)) / 4.43;
    p.setXYZ(i, x * swell, p.getY(i), z * swell);
  }
  pad.computeVertexNormals();
  // LatheGeometry wraps UVs along the profile; use the same planar finish across the puck.
  const uv = pad.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, .5 + p.getX(i) / 9.2, .5 + p.getZ(i) / 9.2);
  return pad;
}

function markPad(group, paint, random) {
  for (let quarter = 0; quarter < 4; quarter++) {
    const start = quarter * Math.PI / 2 + .05 + random() * .05;
    const points = Array.from({ length: 13 }, (_, i) => {
      const angle = start + i * .113;
      const r = 3.94 + padRim(angle) + .026 * Math.sin(i * 1.13 + quarter);
      return new T.Vector3(r * Math.sin(angle), -.005 + .006 * Math.sin(i * .61), r * Math.cos(angle));
    });
    const cord = new T.TubeGeometry(new T.CatmullRomCurve3(points), 32, .038 + random() * .012, 7, false);
    piece(group, cord, paint, .73, 0, .12);
  }
  const dab = new T.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 + (random() - .5) * .13;
    const r = 3.61 + padRim(a) + (random() - .5) * .08;
    piece(group, dab, paint, .73 + r * Math.sin(a), 0, .12 + r * Math.cos(a),
      .043 + random() * .029, .019, .11 + random() * .07).rotation.y = a + (random() - .5) * .30;
  }
}

export function landingTerrain(clay, earth) {
  const group = new T.Group();
  const base = clay(earth ? '#4b775e' : '#918178');
  const paint = clay(earth ? '#bac990' : '#c2aa98');
  const rock = clay(earth ? '#678477' : '#a3948c');
  piece(group, pressedPad(), base, .73, 0, .12);
  markPad(group, paint, seededRandom(earth ? 117 : 144));
  const rockGeometry = new T.IcosahedronGeometry(1, 1);
  const rocks = new T.InstancedMesh(rockGeometry, rock, 46);
  const random = seededRandom(earth ? 24 : 61), dummy = new T.Object3D();
  const radius = earth ? 19.055 : 6.955;
  for (let i = 0; i < rocks.count; i++) {
    const a = random() * 2 * Math.PI, r = 4.75 + random() * (earth ? 5.5 : 1.8);
    const size = .062 + .20 * random() ** 2;
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
    bumpMap: flagPaint, bumpScale: .048, roughness: .96, side: T.DoubleSide }));
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
      const rim = loose * open * (.033 * Math.sin(loose * 17 + v * 3) + .016 * Math.sin(loose * 31));
      // Undeployed material is wound around an axis at the moving edge.
      p.setXYZ(i, .035 + 1.83 * loose + .103 * Math.sin(wrap),
        raised * (2.51 - (1 - v) * (.90 - .27 * u) + rim) - .09 * loose,
        wave + .103 * (1 - Math.cos(wrap)) + rim * v);
    }
    p.needsUpdate = true; cloth.computeVertexNormals();
  }
  return { group, update };
}
