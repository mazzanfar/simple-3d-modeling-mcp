/**
 * Generates the self-contained viewer HTML page.
 * Served by the ViewerServer. Connects back via WebSocket for live updates.
 */

export function generateViewerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OpenSCAD MCP — 3D Viewer</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body { background: #1a1a2e; overflow: hidden; font-family: system-ui, sans-serif; display: flex; }
  #viewport { flex: 1; position: relative; min-height: 0; }
  canvas { display: block; }

  /* Sidebar */
  #sidebar {
    width: 240px; background: #16162a; border-left: 1px solid #333;
    display: flex; flex-direction: column; overflow-y: auto;
  }
  .sidebar-section { padding: 16px; border-bottom: 1px solid #2a2a44; }
  .sidebar-section h4 {
    color: #888; font-size: 10px; text-transform: uppercase;
    letter-spacing: 1px; margin-bottom: 8px;
  }

  /* History */
  .history-item {
    padding: 6px 8px; border-radius: 4px; margin-bottom: 4px;
    font-size: 11px; cursor: pointer; color: #666;
  }
  .history-item:hover { background: rgba(255,255,255,0.05); }
  .history-item.active { background: rgba(74,158,255,0.15); color: #4a9eff; }

  /* Dimensions */
  .dim-row {
    display: flex; justify-content: space-between; padding: 3px 0;
    color: #888; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .dim-row .val { color: #aaa; font-family: monospace; }

  /* Export buttons */
  .export-btn {
    display: block; width: 100%; padding: 8px; margin-top: 6px;
    background: rgba(74,158,255,0.15); border: 1px solid rgba(74,158,255,0.3);
    color: #4a9eff; border-radius: 6px; font-size: 12px; cursor: pointer; text-align: center;
    text-decoration: none;
  }
  .export-btn:hover { background: rgba(74,158,255,0.25); }

  /* Appearance controls */
  .appearance-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 0; font-size: 11px; color: #888;
  }
  .appearance-row input[type="color"] {
    -webkit-appearance: none; border: 1px solid #444; border-radius: 4px;
    width: 28px; height: 22px; cursor: pointer; background: none; padding: 0;
  }
  .appearance-row input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
  .appearance-row input[type="color"]::-webkit-color-swatch { border: none; border-radius: 2px; }
  .toggle-btn {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    color: #aaa; padding: 3px 10px; border-radius: 4px; font-size: 10px; cursor: pointer;
  }
  .toggle-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }

  /* Light mode overrides */
  body.light { background: #f0f0f0; }
  body.light #sidebar { background: #e8e8e8; border-left-color: #ccc; }
  body.light .sidebar-section { border-bottom-color: #d0d0d0; }
  body.light .sidebar-section h4 { color: #666; }
  body.light .dim-row { color: #555; border-bottom-color: rgba(0,0,0,0.05); }
  body.light .dim-row .val { color: #333; }
  body.light .history-item { color: #888; }
  body.light .history-item:hover { background: rgba(0,0,0,0.05); }
  body.light .history-item.active { background: rgba(74,158,255,0.15); color: #2a7de1; }
  body.light #hint { color: #999; }
  body.light #controls button { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); color: #555; }
  body.light #controls button:hover { background: rgba(0,0,0,0.12); color: #222; }
  body.light .toggle-btn { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); color: #555; }
  body.light .toggle-btn:hover { background: rgba(0,0,0,0.12); color: #222; }
  body.light .appearance-row { color: #555; }
  body.light .appearance-row input[type="color"] { border-color: #bbb; }
  body.light #slicer-select { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.12); color: #555; }

  /* Controls bar */
  #controls {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px;
  }
  #controls button {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    color: #aaa; padding: 5px 12px; border-radius: 5px; font-size: 11px; cursor: pointer;
  }
  #controls button:hover { background: rgba(255,255,255,0.15); color: #fff; }

  /* Status */
  #status {
    position: absolute; top: 8px; right: 8px; font-size: 11px; color: #4aff9f;
  }
  #status.disconnected { color: #ff4a4a; }

  /* Hint */
  #hint {
    position: absolute; top: 8px; left: 8px; color: #555; font-size: 11px;
    pointer-events: none;
  }

  /* Empty state */
  #empty {
    position: absolute; inset: 0; display: flex; align-items: center;
    justify-content: center; color: #555; font-size: 14px;
  }
</style>
</head>
<body>

<div id="viewport">
  <div id="hint">Drag to rotate · Scroll to zoom · Right-drag to pan</div>
  <div id="status">● Connecting...</div>
  <div id="empty">Waiting for model...</div>
  <div id="controls" style="display:none;">
    <button onclick="resetCamera()">Reset View</button>
    <button onclick="toggleWireframe()">Wireframe</button>
    <button onclick="toggleAutoRotate()">Auto-Rotate</button>
    <button onclick="toggleGrid()">Grid</button>
  </div>
</div>

<div id="sidebar">
  <div class="sidebar-section">
    <h4>Model History</h4>
    <div id="history-list"><div style="color:#555;font-size:11px;">No models yet</div></div>
  </div>
  <div class="sidebar-section">
    <h4>Dimensions</h4>
    <div id="dimensions">
      <div class="dim-row"><span>Width</span><span class="val" id="dim-w">—</span></div>
      <div class="dim-row"><span>Depth</span><span class="val" id="dim-d">—</span></div>
      <div class="dim-row"><span>Height</span><span class="val" id="dim-h">—</span></div>
      <div class="dim-row"><span>Bounding Vol</span><span class="val" id="dim-v">—</span></div>
    </div>
  </div>
  <div class="sidebar-section">
    <h4>Appearance</h4>
    <div class="appearance-row">
      <span>Theme</span>
      <button class="toggle-btn" id="theme-btn" onclick="toggleTheme()">Light</button>
    </div>
    <div class="appearance-row">
      <span>Object Color</span>
      <input type="color" id="color-picker" value="#ff8c00" onchange="changeColor(this.value)">
    </div>
  </div>
  <div class="sidebar-section">
    <h4>Export</h4>
    <a id="download-stl" class="export-btn" style="display:none;">↓ Download STL</a>
    <div id="slicer-row" style="display:none; margin-top:6px;">
      <select id="slicer-select" style="
        width:100%; padding:7px 8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15);
        color:#aaa; border-radius:6px 6px 0 0; font-size:12px; cursor:pointer; appearance:auto;
      ">
        <option value="default">System Default</option>
        <option value="bambu">Bambu Studio</option>
        <option value="orca">OrcaSlicer</option>
        <option value="prusa">PrusaSlicer</option>
        <option value="cura">UltiMaker Cura</option>
        <option value="creality">Creality Print</option>
      </select>
      <button id="open-slicer-btn" class="export-btn" style="margin-top:0; border-radius:0 0 6px 6px; border-top:0;" onclick="openInSlicer()">🔧 Open in Slicer</button>
    </div>
  </div>
</div>

<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
</script>

<script type="module">
import * as THREE from 'three';

// --- STL Parser (binary + ASCII) ---
function isAsciiSTL(buffer) {
  const header = new Uint8Array(buffer, 0, Math.min(80, buffer.byteLength));
  const str = String.fromCharCode.apply(null, header);
  return str.startsWith('solid ') || str.startsWith('solid\\n');
}

function parseAsciiSTLViewer(buffer) {
  const text = new TextDecoder().decode(buffer);
  const facetRe = /facet\\s+normal\\s+([\\-\\d.e+]+)\\s+([\\-\\d.e+]+)\\s+([\\-\\d.e+]+)\\s+outer\\s+loop\\s+vertex\\s+([\\-\\d.e+]+)\\s+([\\-\\d.e+]+)\\s+([\\-\\d.e+]+)\\s+vertex\\s+([\\-\\d.e+]+)\\s+([\\-\\d.e+]+)\\s+([\\-\\d.e+]+)\\s+vertex\\s+([\\-\\d.e+]+)\\s+([\\-\\d.e+]+)\\s+([\\-\\d.e+]+)\\s+endloop\\s+endfacet/gi;
  const verts = [], norms = [];
  let m;
  while ((m = facetRe.exec(text)) !== null) {
    const nx = parseFloat(m[1]), ny = parseFloat(m[2]), nz = parseFloat(m[3]);
    for (let v = 0; v < 3; v++) {
      verts.push(parseFloat(m[4+v*3]), parseFloat(m[5+v*3]), parseFloat(m[6+v*3]));
      norms.push(nx, ny, nz);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(norms), 3));
  return geo;
}

function parseBinarySTLViewer(buffer) {
  const data = new DataView(buffer);
  const triangles = data.getUint32(80, true);
  const geo = new THREE.BufferGeometry();
  const vertices = new Float32Array(triangles * 9);
  const normals = new Float32Array(triangles * 9);
  for (let i = 0; i < triangles; i++) {
    const off = 84 + i * 50;
    const nx = data.getFloat32(off, true), ny = data.getFloat32(off+4, true), nz = data.getFloat32(off+8, true);
    for (let v = 0; v < 3; v++) {
      const vo = off + 12 + v * 12;
      vertices[i*9+v*3] = data.getFloat32(vo, true);
      vertices[i*9+v*3+1] = data.getFloat32(vo+4, true);
      vertices[i*9+v*3+2] = data.getFloat32(vo+8, true);
      normals[i*9+v*3] = nx; normals[i*9+v*3+1] = ny; normals[i*9+v*3+2] = nz;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geo;
}

function parseSTL(buffer) {
  return isAsciiSTL(buffer) ? parseAsciiSTLViewer(buffer) : parseBinarySTLViewer(buffer);
}

// --- Orbit Controls (simplified) ---
class OrbitControls {
  constructor(camera, el) {
    this.camera = camera; this.el = el;
    this.target = new THREE.Vector3();
    this.spherical = new THREE.Spherical();
    this.delta = new THREE.Spherical();
    this.panOffset = new THREE.Vector3();
    this.autoRotate = false;
    this._state = 0;
    this._start = new THREE.Vector2();
    const offset = new THREE.Vector3().copy(camera.position).sub(this.target);
    this.spherical.setFromVector3(offset);
    el.addEventListener('mousedown', e => {
      this._state = e.button === 0 ? 1 : e.button === 2 ? 2 : 0;
      this._start.set(e.clientX, e.clientY);
    });
    el.addEventListener('mousemove', e => {
      if (this._state === 1) {
        this.delta.theta -= (e.clientX - this._start.x) * 0.005;
        this.delta.phi -= (e.clientY - this._start.y) * 0.005;
        this._start.set(e.clientX, e.clientY);
      } else if (this._state === 2) {
        const u = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
        const v = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
        this.panOffset.addScaledVector(u, -(e.clientX-this._start.x)*0.002*this.spherical.radius);
        this.panOffset.addScaledVector(v, (e.clientY-this._start.y)*0.002*this.spherical.radius);
        this._start.set(e.clientX, e.clientY);
      }
    });
    el.addEventListener('mouseup', () => this._state = 0);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      const zoomIn = e.deltaY < 0;
      const factor = zoomIn ? 0.9 : 1.1;

      // Raycast from cursor to shift target toward zoom point
      const rect = el.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const ray = new THREE.Vector3(mx, my, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
      const shift = 1 - factor;
      this.target.addScaledVector(ray, this.spherical.radius * shift);

      this.spherical.radius *= factor;
      this.spherical.radius = Math.max(0.1, Math.min(10000, this.spherical.radius));
    }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  update() {
    if (this.autoRotate) this.delta.theta -= 0.002;
    this.spherical.theta += this.delta.theta;
    this.spherical.phi = Math.max(0.01, Math.min(Math.PI-0.01, this.spherical.phi + this.delta.phi));
    this.target.add(this.panOffset);
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
    this.delta.set(0,0,0); this.panOffset.set(0,0,0);
  }
  reset(pos, tgt) {
    this.target.copy(tgt);
    this.spherical.setFromVector3(new THREE.Vector3().copy(pos).sub(tgt));
  }
}

// --- Scene Setup ---
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth/viewport.clientHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);

scene.background = new THREE.Color(0x1a1a2e);
scene.add(new THREE.AmbientLight(0x404060, 0.6));
const d1 = new THREE.DirectionalLight(0xffffff, 0.8); d1.position.set(5,10,7); scene.add(d1);
const d2 = new THREE.DirectionalLight(0x8888ff, 0.3); d2.position.set(-5,-3,-5); scene.add(d2);

let isDark = true;
let gridSize = 1000;
let gridHelper = new THREE.GridHelper(gridSize, gridSize / 10, 0x333355, 0x222244);
scene.add(gridHelper);
let gridVisible = true;

function rebuildGrid() {
  scene.remove(gridHelper);
  gridHelper = new THREE.GridHelper(
    gridSize, gridSize / 10,
    isDark ? 0x333355 : 0xccccdd,
    isDark ? 0x222244 : 0xddddee
  );
  gridHelper.visible = gridVisible;
  scene.add(gridHelper);
}

camera.position.set(100, 75, 100); camera.lookAt(0,0,0);
const controls = new OrbitControls(camera, renderer.domElement);

const material = new THREE.MeshPhongMaterial({ color: 0xff8c00, specular: 0x332200, shininess: 40 });
const wireMat = new THREE.MeshPhongMaterial({ color: 0xff8c00, wireframe: true });
let mesh = null;
let isWireframe = false;
let currentVersion = null;
let initCamPos = null;

// --- Model loading ---
function loadSTL(buffer, version, title) {
  if (mesh) scene.remove(mesh);
  const geo = parseSTL(buffer);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  mesh = new THREE.Mesh(geo, isWireframe ? wireMat : material);
  const center = new THREE.Vector3(); geo.boundingBox.getCenter(center);
  mesh.position.sub(center);
  scene.add(mesh);

  const r = geo.boundingSphere.radius;

  // Resize grid to fit model
  gridSize = Math.max(200, Math.ceil(r * 4 / 100) * 100);
  rebuildGrid();

  const d = r * 2.8;
  initCamPos = new THREE.Vector3(d*0.7, d*0.5, d*0.7);
  camera.position.copy(initCamPos); camera.lookAt(0,0,0);
  camera.near = r*0.01; camera.far = r*100; camera.updateProjectionMatrix();
  controls.reset(initCamPos, new THREE.Vector3(0,0,0));

  currentVersion = version;
  document.getElementById('empty').style.display = 'none';
  document.getElementById('controls').style.display = 'flex';

  // Update dimensions
  const box = geo.boundingBox;
  const size = new THREE.Vector3(); box.getSize(size);
  document.getElementById('dim-w').textContent = size.x.toFixed(1) + ' mm';
  document.getElementById('dim-d').textContent = size.y.toFixed(1) + ' mm';
  document.getElementById('dim-h').textContent = size.z.toFixed(1) + ' mm';
  const vol = (size.x * size.y * size.z) / 1000;
  document.getElementById('dim-v').textContent = vol.toFixed(1) + ' cm\\u00B3';

  // Update download link
  const dl = document.getElementById('download-stl');
  dl.href = '/model/' + version;
  dl.download = (title || 'model') + '.stl';
  dl.style.display = 'block';
  document.getElementById('slicer-row').style.display = 'block';
}

// --- WebSocket ---
let ws = null;
let history = [];

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host);
  const statusEl = document.getElementById('status');

  ws.onopen = () => {
    statusEl.textContent = '● Connected';
    statusEl.className = '';
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'model-update') {
      const raw = atob(msg.stlBase64);
      const buf = new ArrayBuffer(raw.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
      loadSTL(buf, msg.version, msg.title);
      if (!history.find(h => h.version === msg.version)) {
        history.push({ version: msg.version, title: msg.title, timestamp: msg.timestamp });
        renderHistory();
      }
    } else if (msg.type === 'model-history') {
      history = msg.versions;
      renderHistory();
    }
  };

  ws.onclose = () => {
    statusEl.textContent = '● Disconnected';
    statusEl.className = 'disconnected';
    setTimeout(connect, 2000);
  };

  ws.onerror = () => ws.close();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (history.length === 0) {
    list.textContent = '';
    const placeholder = document.createElement('div');
    placeholder.style.cssText = 'color:#555;font-size:11px;';
    placeholder.textContent = 'No models yet';
    list.appendChild(placeholder);
    return;
  }
  list.textContent = '';
  history.slice().reverse().forEach(h => {
    const div = document.createElement('div');
    div.className = 'history-item' + (h.version === currentVersion ? ' active' : '');
    div.onclick = () => requestVersion(h.version);
    const ago = Math.round((Date.now() - h.timestamp) / 1000);
    const time = ago < 60 ? ago + 's ago' : Math.round(ago/60) + 'm ago';
    div.textContent = h.title;
    const span = document.createElement('span');
    span.style.cssText = 'float:right;color:#444;font-size:10px;';
    span.textContent = time;
    div.appendChild(span);
    list.appendChild(div);
  });
}

window.requestVersion = (v) => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'request-model', version: v }));
  }
};

connect();

// --- Controls ---
window.resetCamera = () => { if (initCamPos) controls.reset(initCamPos, new THREE.Vector3(0,0,0)); };
window.toggleWireframe = () => { isWireframe = !isWireframe; if (mesh) mesh.material = isWireframe ? wireMat : material; };
window.toggleAutoRotate = () => { controls.autoRotate = !controls.autoRotate; };
window.toggleGrid = () => { gridVisible = !gridVisible; gridHelper.visible = gridVisible; };

window.toggleTheme = () => {
  isDark = !isDark;
  document.body.classList.toggle('light', !isDark);
  document.getElementById('theme-btn').textContent = isDark ? 'Light' : 'Dark';
  scene.background = new THREE.Color(isDark ? 0x1a1a2e : 0xf0f0f0);
  rebuildGrid();
};

window.changeColor = (hex) => {
  const c = new THREE.Color(hex);
  material.color.copy(c);
  wireMat.color.copy(c);
};
window.openInSlicer = async () => {
  if (!currentVersion) return;
  const btn = document.getElementById('open-slicer-btn');
  const slicer = document.getElementById('slicer-select').value;
  btn.textContent = 'Opening...';
  try {
    const res = await fetch('/open-in-slicer/' + currentVersion + '?slicer=' + encodeURIComponent(slicer), { method: 'POST' });
    if (!res.ok) btn.textContent = 'Failed — slicer not found';
    else btn.textContent = '✓ Opened';
  } catch { btn.textContent = 'Failed'; }
  setTimeout(() => { btn.textContent = '🔧 Open in Slicer'; }, 3000);
};

// --- Resize ---
function onResize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
new ResizeObserver(onResize).observe(viewport);
addEventListener('resize', onResize);

// --- Render loop ---
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();
</script>
</body>
</html>`;
}
