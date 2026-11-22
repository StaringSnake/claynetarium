// Stock Three.js meshes, sculpted profiles and small procedural clay textures.
import * as T from 'three';

export function seededRandom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function paintedTexture(width, height, paint) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  paint(canvas.getContext('2d'), width, height);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export function clayPalette() {
  const grain = paintedTexture(128, 128, (ctx, w, h) => {
    const random = seededRandom(81), image = ctx.createImageData(w, h);
    for (let i = 0; i < image.data.length; i += 4) {
      const x = (i / 4) % w, y = Math.floor(i / (4 * w));
      const swathe = 10 * Math.cos(y * .092 + 1.1 * Math.sin(x * .048)) * Math.sin(x * .061 + y * .02);
      const gray = 226 + swathe + 3 * Math.sin(x * .39 + Math.sin(y * .2)) * Math.cos(y * .49) - random() * 10;
      image.data.set([gray, gray, gray, 255], i);
    }
    ctx.putImageData(image, 0, 0);
    ctx.lineWidth = .8;
    for (const [x, y] of [[29, 38], [91, 87]]) {
      for (let r = 6; r < 21; r += 2.8) {
        ctx.strokeStyle = '#998b815e';
        ctx.beginPath(); ctx.ellipse(x, y, r * .65, r, -.38, .1, 4.1); ctx.stroke();
      }
    }
  });
  return (color, extras) => new T.MeshStandardMaterial({ color, map: grain, bumpMap: grain,
    bumpScale: .033, roughness: .83, ...extras });
}

export function piece(parent, shape, material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const mesh = new T.Mesh(shape, material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh);
  return mesh;
}

const ball = new T.SphereGeometry(1, 20, 12);
const ring = new T.TorusGeometry(1, .1, 10, 40);

function moldedProfile(points, amplitude) {
  const path = new T.SplineCurve(points.map(([r, y]) => new T.Vector2(r, y)));
  const geometry = new T.LatheGeometry(path.getPoints(48), 64);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const ripple = 1 + amplitude * (Math.sin(3 * a + 2 * y) + .4 * Math.sin(7 * a - 5 * y));
    p.setXYZ(i, x * ripple + .035 * Math.sin(2 * y), y, z * ripple);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function roundedShape(shape, depth, bevel) {
  const geometry = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3,
    bevelSize: bevel, bevelThickness: bevel, steps: 1, curveSegments: 12 });
  // ExtrudeGeometry supplies UVs in model units; map the sculpt onto the clay grain.
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, .39 + uv.getX(i) * .23, .18 + uv.getY(i) * .32);
  return geometry;
}

export function clayRocket(clay) {
  const model = new T.Group();
  const cream = clay('#ffe0ac'), rust = clay('#d4674e'), dark = clay('#522638');
  const bronze = clay('#e2a257'), pale = clay('#fff1ca');
  const glass = clay('#387a88', { roughness: .59 });
  piece(model, moldedProfile([[0, .37], [.61, .39], [.85, .58], [.99, 1.16], [.98, 1.95],
    [.83, 2.55], [.61, 3.02], [.33, 3.43], [0, 3.65]], .033), cream);
  piece(model, moldedProfile([[.65, 2.96], [.54, 3.17], [.34, 3.48], [.16, 3.65], [0, 3.69]], .038), rust);
  piece(model, moldedProfile([[.04, .38], [.40, .38], [.43, .57], [.28, .77]], .04), dark);
  piece(model, ring, bronze, 0, .43, 0, .38).rotation.x = Math.PI / 2;
  for (const [y, radius, color] of [[.67, .875, rust], [2.91, .653, bronze]]) {
    const band = piece(model, ring, color, 0, y, 0, radius, radius, .44);
    band.rotation.set(Math.PI / 2, .018, .012);
  }
  const fin = new T.Shape();
  fin.moveTo(.61, 1.47); fin.bezierCurveTo(1.13, 1.28, 1.27, .66, 1.49, .16);
  fin.quadraticCurveTo(1.05, .30, .69, .48); fin.closePath();
  const finGeometry = roundedShape(fin, .19, .095);
  for (let n = 0; n < 3; n++) {
    const spoke = new T.Group(); spoke.rotation.y = n * 2 * Math.PI / 3 + .38; model.add(spoke);
    piece(spoke, finGeometry, rust, 0, 0, -.095);
    piece(spoke, ball, dark, 1.27, .11, 0, .28, .11, .20); // soles touch the pad at y=0
    piece(spoke, ball, bronze, 1.20, .23, 0, .17, .11, .15);
  }
  // Portholes wrap around the hull; reflected glints and hand-pressed fasteners stand proud.
  for (const angle of [-.23, 2.02, 4.08]) {
    const port = new T.Group(); port.rotation.y = angle; model.add(port);
    piece(port, ball, dark, 0, 2.19, .858, .52, .49, .155);
    piece(port, ring, bronze, 0, 2.19, 1.004, .421, .399, .59);
    piece(port, ball, glass, 0, 2.19, .971, .366, .348, .12);
    piece(port, ball, pale, -.116, 2.34, 1.067, .115, .034, .021).rotation.z = .62;
    piece(port, ball, pale, .065, 2.36, 1.076, .025, .025, .014);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      piece(port, ball, cream, .419 * Math.cos(a), 2.19 + .395 * Math.sin(a), 1.066, .027);
    }
  }
  const hatch = new T.Group(); hatch.position.set(.79, .92, .58); hatch.rotation.y = .93;
  model.add(hatch);
  piece(hatch, ball, dark, 0, 0, 0, .35, .28, .10);
  const door = new T.Group(); door.position.y = -.21; hatch.add(door);
  piece(door, ball, rust, 0, .21, .062, .30, .227, .085);
  piece(door, ball, bronze, 0, .32, .139, .126, .035, .042);
  return { model, door };
}

export function cheeseAlien(clay) {
  const alien = new T.Group();
  const cheese = clay('#ffc15c'), rind = clay('#e58c49'), socket = clay('#ad6339');
  const eye = clay('#fff4d5'), pupil = clay('#2e2635');
  const wedge = new T.Shape();
  wedge.moveTo(-.51, .18); wedge.quadraticCurveTo(-.58, .23, -.47, .43);
  wedge.lineTo(-.10, 1.02); wedge.quadraticCurveTo(.03, 1.28, .18, .96);
  wedge.lineTo(.51, .34); wedge.quadraticCurveTo(.58, .16, .39, .15); wedge.closePath();
  piece(alien, roundedShape(wedge, .37, .115), cheese, 0, 0, -.19);
  for (const side of [-1, 1]) {
    piece(alien, ball, rind, side * .32, .10, .07, .24, .105, .21);
    piece(alien, ball, cheese, side * .47, .48, .025, .26, .10, .11).rotation.z = side * .5;
    piece(alien, ball, cheese, side * .66, .56, .04, .117);
    piece(alien, ball, eye, side * .19, .70, .28, .21, .225, .15);
    piece(alien, ball, pupil, side * .19 + .037, .72, .416, .079, .109, .027);
    piece(alien, ball, eye, side * .19 + .013, .77, .442, .026);
  }
  piece(alien, ball, socket, .03, .426, .302, .108, .067, .024);
  for (const [x, y, r] of [[-.32, .35, .053], [.36, .32, .066], [.22, .48, .039], [.01, .98, .05]]) {
    piece(alien, ball, socket, x, y, .286, r, r * .78, .02);
  }
  return alien;
}
