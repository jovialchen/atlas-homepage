/**
 * Atlas Homepage — 星空星座图 · Constellation Graph
 * ==================================================
 * A custom Obsidian homepage plugin for the Atlas vault.
 * Renders a 3D star constellation map — each markdown note is a
 * glowing star, wikilinks are constellation lines, and Areas
 * form colorful nebulae. Like Obsidianʼs built-in Graph View,
 * but in an immersive 3D space.
 *
 * Vault: Atlas (PARA + Learning/Logs/Inbox)
 * Style: Deep space, nebulae, constellation lines, glowing stars
 */

"use strict";

var obsidian = require("obsidian");
var Plugin = obsidian.Plugin;
var ItemView = obsidian.ItemView;

// ═══════════════════════════════════════════════════════════
// THREE.JS CDN LOADER
// ═══════════════════════════════════════════════════════════

const THREE_CDN =
  "https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.min.js";

let THREELoaded = false;

async function ensureThreeJS() {
  if (THREELoaded) return window.THREE;
  if (window.THREE) {
    THREELoaded = true;
    return window.THREE;
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = THREE_CDN;
    script.onload = () => {
      THREELoaded = true;
      resolve(window.THREE);
    };
    script.onerror = () =>
      reject(new Error("Failed to load Three.js from CDN"));
    document.head.appendChild(script);
  });
}

// ═══════════════════════════════════════════════════════════
// AREA DEFINITIONS — Cluster centers in 3D space
// ═══════════════════════════════════════════════════════════

const AREAS = [
  {
    id: "Fun",
    name: "乐趣",
    ename: "Fun",
    icon: "🎨",
    path: "Areas/Fun",
    color: "#ff8c69",
    nebulaColor: 0xff7043,
    cx: 0, cy: 0.5, cz: -4.5, // 12 o'clock
    radius: 1.8,
  },
  {
    id: "Health",
    name: "健康",
    ename: "Health",
    icon: "💚",
    path: "Areas/Health",
    color: "#69db7c",
    nebulaColor: 0x51cf66,
    cx: 4.3, cy: 0.3, cz: -1.4, // 2 o'clock
    radius: 1.6,
  },
  {
    id: "Work",
    name: "工作",
    ename: "Work",
    icon: "💼",
    path: "Areas/Work",
    color: "#b197fc",
    nebulaColor: 0x9775fa,
    cx: -4.3, cy: -0.2, cz: -1.4, // 10 o'clock
    radius: 1.8,
  },
  {
    id: "Love",
    name: "爱与家",
    ename: "Love & Family",
    icon: "💕",
    path: "Areas/Love",
    color: "#f783ac",
    nebulaColor: 0xf06595,
    cx: -2.7, cy: 0.1, cz: 3.6, // 8 o'clock
    radius: 1.4,
  },
  {
    id: "People",
    name: "人物",
    ename: "People",
    icon: "👥",
    path: "Areas/People",
    color: "#74c0fc",
    nebulaColor: 0x4dabf7,
    cx: 2.7, cy: 0.2, cz: 3.6, // 4 o'clock
    radius: 1.3,
  },
];

const EXTRA_NODES = [
  {
    id: "Projects",
    name: "项目",
    icon: "📋",
    path: "Projects",
    color: "#ffa94d",
    nebulaColor: 0xff922b,
    cx: 7.0, cy: 0.8, cz: 1.5,
    radius: 1.2,
  },
  {
    id: "Learning",
    name: "学习",
    icon: "📚",
    path: "Learning",
    color: "#38d9a9",
    nebulaColor: 0x20c997,
    cx: 3.5, cy: 1.0, cz: 6.2,
    radius: 1.1,
  },
  {
    id: "Logs",
    name: "日志",
    icon: "📝",
    path: "Logs",
    color: "#adb5bd",
    nebulaColor: 0x868e96,
    cx: -3.5, cy: 0.6, cz: 6.2,
    radius: 1.0,
  },
  {
    id: "Inbox",
    name: "收件箱",
    icon: "📥",
    path: "Inbox",
    color: "#da77f2",
    nebulaColor: 0xbe4bdb,
    cx: -7.0, cy: 0.4, cz: 1.5,
    radius: 1.0,
  },
];

// ── Helpers ────────────────────────────────────────────────

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fibonacci sphere: evenly distribute N points on a sphere surface */
function fibSphere(i, n, radius, jitter) {
  const phi = Math.acos(1 - 2 * (i + 0.5) / n);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  const r = radius * (0.35 + 0.65 * ((jitter || Math.random)()));
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.sin(phi) * Math.sin(theta) + (jitter ? 0 : 0),
    z: r * Math.cos(phi),
  };
}

// ═══════════════════════════════════════════════════════════
// ORBIT CONTROLS (smooth space-navigation feel)
// ═══════════════════════════════════════════════════════════

class SpaceOrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = { x: 0, y: 0.2, z: 0 };
    this.spherical = { radius: 14, phi: Math.PI / 3, theta: -Math.PI / 2 };
    this.autoRotate = true;
    this.autoRotateSpeed = 0.12;
    this.enableDamping = true;
    this.dampingFactor = 0.08;
    this.minDistance = 5;
    this.maxDistance = 30;
    this.maxPhi = Math.PI / 2 - 0.05;
    this.minPhi = 0.15;

    this._isDragging = false;
    this._prevMouse = { x: 0, y: 0 };
    this._velocity = { theta: 0, phi: 0 };

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    domElement.addEventListener("mousedown", this._onMouseDown);
    domElement.addEventListener("mousemove", this._onMouseMove);
    domElement.addEventListener("mouseup", this._onMouseUp);
    domElement.addEventListener("wheel", this._onWheel, { passive: true });
    domElement.addEventListener("touchstart", this._onTouchStart, { passive: false });
    domElement.addEventListener("touchmove", this._onTouchMove, { passive: false });
    domElement.addEventListener("touchend", this._onTouchEnd);
  }

  _onMouseDown(e) {
    this._isDragging = true;
    this._prevMouse.x = e.clientX;
    this._prevMouse.y = e.clientY;
    this._velocity.theta = 0;
    this._velocity.phi = 0;
  }
  _onMouseMove(e) {
    if (!this._isDragging) return;
    const dx = e.clientX - this._prevMouse.x;
    const dy = e.clientY - this._prevMouse.y;
    this.spherical.theta -= dx * 0.004;
    this.spherical.phi -= dy * 0.004;
    this.spherical.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.spherical.phi));
    this._velocity.theta = -dx * 0.004;
    this._velocity.phi = -dy * 0.004;
    this._prevMouse.x = e.clientX;
    this._prevMouse.y = e.clientY;
    this.autoRotate = false;
    setTimeout(() => { this.autoRotate = true; }, 3000);
  }
  _onMouseUp() { this._isDragging = false; }
  _onWheel(e) {
    this.spherical.radius += e.deltaY * 0.01;
    this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));
  }
  _onTouchStart(e) {
    if (e.touches.length === 1) {
      e.preventDefault();
      this._isDragging = true;
      this._prevMouse.x = e.touches[0].clientX;
      this._prevMouse.y = e.touches[0].clientY;
    }
  }
  _onTouchMove(e) {
    if (!this._isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - this._prevMouse.x;
    const dy = e.touches[0].clientY - this._prevMouse.y;
    this.spherical.theta -= dx * 0.004;
    this.spherical.phi -= dy * 0.004;
    this.spherical.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.spherical.phi));
    this._prevMouse.x = e.touches[0].clientX;
    this._prevMouse.y = e.touches[0].clientY;
  }
  _onTouchEnd() { this._isDragging = false; }

  update(deltaTime) {
    if (this.autoRotate && !this._isDragging) {
      this.spherical.theta += this.autoRotateSpeed * deltaTime;
    } else if (!this._isDragging) {
      this.spherical.theta += this._velocity.theta;
      this.spherical.phi += this._velocity.phi;
      this._velocity.theta *= 1 - this.dampingFactor;
      this._velocity.phi *= 1 - this.dampingFactor;
      this.spherical.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.spherical.phi));
    }
    this.camera.position.x = this.target.x +
      this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);
    this.camera.position.y = this.target.y +
      this.spherical.radius * Math.cos(this.spherical.phi);
    this.camera.position.z = this.target.z +
      this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
    this.camera.lookAt(this.target.x, this.target.y, this.target.z);
  }

  dispose() {
    this.domElement.removeEventListener("mousedown", this._onMouseDown);
    this.domElement.removeEventListener("mousemove", this._onMouseMove);
    this.domElement.removeEventListener("mouseup", this._onMouseUp);
    this.domElement.removeEventListener("wheel", this._onWheel);
    this.domElement.removeEventListener("touchstart", this._onTouchStart);
    this.domElement.removeEventListener("touchmove", this._onTouchMove);
    this.domElement.removeEventListener("touchend", this._onTouchEnd);
  }
}

// ═══════════════════════════════════════════════════════════
// CONSTELLATION SCENE
// ═══════════════════════════════════════════════════════════

class ConstellationScene {
  constructor(container, THREE, app, onReady) {
    this.THREE = THREE;
    this.app = app;
    this.container = container;
    this.onReady = onReady;
    this.animationId = null;
    this.clock = new THREE.Clock();

    this._graphNodes = [];   // { id, name, path, area, links, linkCount, x, y, z, size }
    this._graphEdges = [];   // { source: idx, target: idx }
    this._hoveredNodeIdx = -1;
    this._tooltipEl = null;

    this._initScene();
    this._prepareData().then(() => {
      this._buildConstellation();
      this._createTooltip();
      this._setupInteraction();
      this._animate();
      if (this.onReady) this.onReady();
    });
  }

  // ── Three.js Setup ───────────────────────────────────────

  _initScene() {
    const THREE = this.THREE;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x080c14);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x080c14, 0.00015);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.3, 50);
    this.camera.position.set(0, 8, 14);

    this.controls = new SpaceOrbitControls(this.camera, this.renderer.domElement);

    // Lighting (minimal — most glow comes from additive sprites)
    this.scene.add(new THREE.AmbientLight(0x222244, 0.6));
    const pointLight = new THREE.PointLight(0xffffff, 0.8, 25);
    pointLight.position.set(0, 2, 0);
    this.scene.add(pointLight);

    this._onResize = () => {
      const rw = this.container.clientWidth;
      const rh = this.container.clientHeight;
      this.camera.aspect = rw / rh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rw, rh);
    };
    window.addEventListener("resize", this._onResize);
  }

  // ── Graph Data Preparation ───────────────────────────────

  async _prepareData() {
    const files = this.app.vault.getMarkdownFiles();
    const fileMap = new Map(); // normalized path -> node index
    const areaLookup = new Map();

    // Build area lookup: "Areas/Fun" -> AREAS[0] etc.
    for (const a of AREAS) areaLookup.set(a.path, a);
    for (const e of EXTRA_NODES) areaLookup.set(e.path, e);

    // First pass: create nodes
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const links = (cache && cache.links) ? cache.links : [];
      const inlinks = (cache && cache.backlinks) ? Object.keys(cache.backlinks) : [];

      // Determine which Area this file belongs to
      let areaDef = null;
      for (const a of [...AREAS, ...EXTRA_NODES]) {
        if (file.path.startsWith(a.path + "/")) {
          areaDef = a;
          break;
        }
      }

      const node = {
        id: file.path,
        name: file.basename,
        path: file.path,
        area: areaDef ? areaDef.id : null,
        areaColor: areaDef ? areaDef.color : "#888899",
        areaNebula: areaDef ? areaDef.nebulaColor : 0x888899,
        clusterCx: areaDef ? areaDef.cx : 0,
        clusterCy: areaDef ? areaDef.cy : -3,
        clusterCz: areaDef ? areaDef.cz : 0,
        clusterR: areaDef ? areaDef.radius : 1.0,
        links: links,
        inlinks: inlinks,
        linkCount: links.length + inlinks.length,
        x: 0, y: 0, z: 0,
        size: 0.06,
        seed: this._hashCode(file.path),
      };

      this._graphNodes.push(node);
      fileMap.set(file.path, this._graphNodes.length - 1);
    }

    // Second pass: resolve links to edges
    const edgeSet = new Set();
    for (let i = 0; i < this._graphNodes.length; i++) {
      const node = this._graphNodes[i];
      for (const link of node.links) {
        const resolved = this.app.metadataCache.getFirstLinkpathDest(
          link.link, node.path
        );
        if (resolved) {
          const targetPath = resolved.path;
          const j = fileMap.get(targetPath);
          if (j !== undefined && j !== i) {
            const key = Math.min(i, j) + "_" + Math.max(i, j);
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
              this._graphEdges.push({ source: i, target: j });
            }
          }
        }
      }
    }

    // Position nodes: fibonacci sphere within each cluster
    const clusterCounts = {};
    for (const node of this._graphNodes) {
      const key = node.area || "_unclustered";
      clusterCounts[key] = (clusterCounts[key] || 0) + 1;
    }
    const clusterIndex = {};

    for (const node of this._graphNodes) {
      const key = node.area || "_unclustered";
      if (!clusterIndex[key]) clusterIndex[key] = 0;
      const idx = clusterIndex[key]++;
      const total = clusterCounts[key];
      const rand = mulberry32(node.seed);

      const pos = fibSphere(idx, total, node.clusterR, () => rand());
      node.x = node.clusterCx + pos.x;
      node.y = node.clusterCy + pos.y;
      node.z = node.clusterCz + pos.z;

      // Size by importance (link count), with min/max
      const importance = Math.min(1, node.linkCount / 15);
      node.size = 0.05 + importance * 0.1;
    }
  }

  _hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // ── Build 3D Constellation ───────────────────────────────

  _buildConstellation() {
    const THREE = this.THREE;

    // 1. Deep space starfield (distant background)
    this._createStarfield();

    // 2. Nebula clouds around each cluster
    this._createNebulae();

    // 3. Note stars (InstancedMesh)
    this._createNoteStars();

    // 4. Constellation lines
    this._createConstellationLines();

    // 5. Area labels
    this._createAreaLabels();

    // 6. Central bright node
    this._createCentralNode();
  }

  // ── 1. Starfield ─────────────────────────────────────────

  _createStarfield() {
    const THREE = this.THREE;
    const count = 2000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Distribute on a large sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 18 + Math.random() * 14;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Slightly warm/cool variation
      const temp = 0.7 + Math.random() * 0.3;
      colors[i * 3] = temp;
      colors[i * 3 + 1] = temp * (0.85 + Math.random() * 0.15);
      colors[i * 3 + 2] = temp * (0.75 + Math.random() * 0.25);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.8,
    });

    this.starfield = new THREE.Points(geo, mat);
    this.starfield.name = "starfield";
    this.scene.add(this.starfield);
  }

  // ── 2. Nebula Clouds ─────────────────────────────────────

  _createNebulae() {
    const THREE = this.THREE;
    this._nebulaClouds = [];

    // Create glow sprite texture
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.4)");
    grad.addColorStop(0.15, "rgba(255,255,255,0.2)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.06)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.01)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const nebulaTex = new THREE.CanvasTexture(canvas);

    const allClusters = [...AREAS, ...EXTRA_NODES];
    for (const cluster of allClusters) {
      const count = 80 + Math.floor(Math.random() * 60);
      const positions = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = cluster.radius * (0.3 + Math.random() * 1.2);
        positions[i * 3] = cluster.cx + r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = cluster.cy + r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = cluster.cz + r * Math.cos(phi);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.PointsMaterial({
        map: nebulaTex,
        color: cluster.nebulaColor,
        size: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.35,
      });

      const cloud = new THREE.Points(geo, mat);
      cloud.name = `nebula-${cluster.id}`;
      cloud.userData = { clusterId: cluster.id };
      this.scene.add(cloud);
      this._nebulaClouds.push(cloud);
    }
  }

  // ── 3. Note Stars ────────────────────────────────────────

  _createNoteStars() {
    const THREE = this.THREE;

    // Use a sphere geometry instanced for all notes
    const baseGeo = new THREE.SphereGeometry(1, 8, 6);
    this._noteMesh = new THREE.InstancedMesh(
      baseGeo,
      new THREE.MeshStandardMaterial({
        roughness: 0.4,
        metalness: 0.1,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
      }),
      this._graphNodes.length
    );

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < this._graphNodes.length; i++) {
      const node = this._graphNodes[i];
      dummy.position.set(node.x, node.y, node.z);
      dummy.scale.setScalar(node.size);
      dummy.updateMatrix();
      this._noteMesh.setMatrixAt(i, dummy.matrix);

      // Store color per instance
      color.set(node.areaColor);
      this._noteMesh.setColorAt(i, color);
    }

    this._noteMesh.instanceMatrix.needsUpdate = true;
    this._noteMesh.instanceColor.needsUpdate = true;
    this._noteMesh.name = "note-stars";
    this._noteMesh.castShadow = false;
    this.scene.add(this._noteMesh);
  }

  // ── 4. Constellation Lines ───────────────────────────────

  _createConstellationLines() {
    const THREE = this.THREE;

    // Limit lines to avoid performance issues (cap at 800)
    const maxEdges = Math.min(this._graphEdges.length, 800);
    const sorted = [...this._graphEdges].sort(
      (a, b) => this._edgeWeight(b) - this._edgeWeight(a)
    );
    const topEdges = sorted.slice(0, maxEdges);

    const positions = [];
    const colors = [];

    for (const edge of topEdges) {
      const src = this._graphNodes[edge.source];
      const tgt = this._graphNodes[edge.target];
      if (!src || !tgt) continue;

      positions.push(src.x, src.y, src.z);
      positions.push(tgt.x, tgt.y, tgt.z);

      // Color line by source Area color (subtle)
      const sc = new THREE.Color(src.areaColor);
      const tc = new THREE.Color(tgt.areaColor);
      colors.push(sc.r * 0.5, sc.g * 0.5, sc.b * 0.5);
      colors.push(tc.r * 0.5, tc.g * 0.5, tc.b * 0.5);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this._constellationLines = new THREE.LineSegments(geo, mat);
    this._constellationLines.name = "constellation-lines";
    this.scene.add(this._constellationLines);
  }

  _edgeWeight(edge) {
    const s = this._graphNodes[edge.source];
    const t = this._graphNodes[edge.target];
    return (s ? s.linkCount : 0) + (t ? t.linkCount : 0);
  }

  // ── 5. Area Labels ───────────────────────────────────────

  _createAreaLabels() {
    const THREE = this.THREE;
    const allClusters = [...AREAS, ...EXTRA_NODES];

    for (const cluster of allClusters) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");

      // Icon
      ctx.font = "32px serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(cluster.icon, 128, 38);

      // Name
      ctx.font = "bold 20px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#ddeeff";
      ctx.fillText(cluster.name, 128, 68);

      // Subtle glow bar under name
      const barW = ctx.measureText(cluster.name).width;
      ctx.fillStyle = cluster.color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(128 - barW / 2, 76, barW, 3);

      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;

      const spriteMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        blending: THREE.NormalBlending,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(
        cluster.cx,
        cluster.cy + cluster.radius + 0.6,
        cluster.cz
      );
      sprite.scale.set(2.5, 1.25, 1);
      sprite.name = `label-${cluster.id}`;
      this.scene.add(sprite);
    }
  }

  // ── 6. Central Bright Node ───────────────────────────────

  _createCentralNode() {
    const THREE = this.THREE;

    // Core sphere
    const coreGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffeedd });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, 0.2, 0);
    core.name = "central-core";
    this.scene.add(core);

    // Glow halo (additive sprite)
    const haloCanvas = document.createElement("canvas");
    haloCanvas.width = 128;
    haloCanvas.height = 128;
    const hctx = haloCanvas.getContext("2d");
    const hgrad = hctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    hgrad.addColorStop(0, "rgba(255,250,240,0.7)");
    hgrad.addColorStop(0.15, "rgba(255,220,180,0.35)");
    hgrad.addColorStop(0.4, "rgba(255,180,100,0.08)");
    hgrad.addColorStop(1, "rgba(0,0,0,0)");
    hctx.fillStyle = hgrad;
    hctx.fillRect(0, 0, 128, 128);

    const haloMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(haloCanvas),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this._centralHalo = new THREE.Sprite(haloMat);
    this._centralHalo.position.set(0, 0.2, 0);
    this._centralHalo.scale.set(3, 3, 1);
    this._centralHalo.name = "central-halo";
    this.scene.add(this._centralHalo);

    // Orbiting ring particles
    const ringCount = 40;
    this._ringData = [];
    const ringPositions = new Float32Array(ringCount * 3);
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const r = 0.55 + Math.random() * 0.3;
      const y = (Math.random() - 0.5) * 0.3;
      ringPositions[i * 3] = Math.cos(angle) * r;
      ringPositions[i * 3 + 1] = y;
      ringPositions[i * 3 + 2] = Math.sin(angle) * r;
      this._ringData.push({
        radius: r,
        height: y,
        angle: angle,
        speed: 0.4 + Math.random() * 0.8,
      });
    }

    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3));
    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = 16;
    dotCanvas.height = 16;
    const dctx = dotCanvas.getContext("2d");
    const dgrad = dctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    dgrad.addColorStop(0, "rgba(255,240,200,0.8)");
    dgrad.addColorStop(0.5, "rgba(255,200,100,0.2)");
    dgrad.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = dgrad;
    dctx.fillRect(0, 0, 16, 16);

    const ringMat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(dotCanvas),
      color: 0xffeedd,
      size: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this._ringParticles = new THREE.Points(ringGeo, ringMat);
    this._ringParticles.position.set(0, 0.2, 0);
    this._ringParticles.name = "central-ring";
    this.scene.add(this._ringParticles);
  }

  // ── Tooltip ──────────────────────────────────────────────

  _createTooltip() {
    this._tooltipEl = document.createElement("div");
    this._tooltipEl.className = "atlas-homepage-tooltip constellation-tooltip";
    this._tooltipEl.style.cssText =
      "position:absolute;display:none;pointer-events:none;z-index:100;" +
      "padding:6px 14px;background:rgba(10,14,24,0.92);color:#ddeeff;" +
      "border:1px solid rgba(150,180,220,0.3);border-radius:6px;" +
      "font-size:13px;white-space:nowrap;letter-spacing:0.3px;";
    this.container.appendChild(this._tooltipEl);
  }

  _updateTooltip(event, idx) {
    if (idx < 0 || idx >= this._graphNodes.length) {
      this._tooltipEl.style.display = "none";
      return;
    }
    const node = this._graphNodes[idx];
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._tooltipEl.style.display = "block";
    this._tooltipEl.style.left = (event.clientX - rect.left + 18) + "px";
    this._tooltipEl.style.top = (event.clientY - rect.top - 12) + "px";
    this._tooltipEl.textContent =
      `${node.name}  ·  ${node.linkCount} links  ·  ${node.area || "unclustered"}`;
  }

  // ── Interaction ──────────────────────────────────────────

  _setupInteraction() {
    this.raycaster = new this.THREE.Raycaster();
    this.mouse = new this.THREE.Vector2();

    const canvas = this.renderer.domElement;

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this._noteMesh);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const idx = intersects[0].instanceId;
        this._hoveredNodeIdx = idx;
        this._updateTooltip(e, idx);
        canvas.style.cursor = "pointer";
      } else {
        this._hoveredNodeIdx = -1;
        this._tooltipEl.style.display = "none";
        canvas.style.cursor = this.controls._isDragging ? "grabbing" : "grab";
      }
    });

    canvas.addEventListener("click", (_e) => {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this._noteMesh);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const idx = intersects[0].instanceId;
        const node = this._graphNodes[idx];
        if (node) this._openNote(node.path);
      }
    });

    canvas.addEventListener("touchstart", () => {
      canvas.style.cursor = "grabbing";
    });

    canvas.addEventListener("touchend", (e) => {
      canvas.style.cursor = "grab";
      if (e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        const my = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        const tv = new this.THREE.Vector2(mx, my);
        this.raycaster.setFromCamera(tv, this.camera);
        const intersects = this.raycaster.intersectObject(this._noteMesh);
        if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
          const idx = intersects[0].instanceId;
          const node = this._graphNodes[idx];
          if (node) this._openNote(node.path);
        }
      }
    });
  }

  _openNote(path) {
    if (!this.app) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file) {
      this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  // ── Animation ────────────────────────────────────────────

  _animate() {
    this.animationId = requestAnimationFrame(() => this._animate());
    const delta = this.clock.getDelta();
    const time = Date.now() * 0.001;

    this.controls.update(Math.min(delta, 0.1));

    // Pulsing central halo
    if (this._centralHalo) {
      const pulse = 1 + Math.sin(time * 1.5) * 0.2;
      this._centralHalo.scale.set(3 * pulse, 3 * pulse, 1);
    }

    // Orbiting ring particles
    if (this._ringParticles && this._ringData) {
      const pos = this._ringParticles.geometry.attributes.position.array;
      for (let i = 0; i < this._ringData.length; i++) {
        const d = this._ringData[i];
        const a = d.angle + time * d.speed;
        pos[i * 3] = Math.cos(a) * d.radius;
        pos[i * 3 + 1] = d.height + Math.sin(time * 1.3 + i) * 0.05;
        pos[i * 3 + 2] = Math.sin(a) * d.radius;
      }
      this._ringParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Subtle nebula opacity breathing
    if (this._nebulaClouds) {
      for (let i = 0; i < this._nebulaClouds.length; i++) {
        const cloud = this._nebulaClouds[i];
        const breathe = 0.28 + Math.sin(time * 0.4 + i) * 0.08;
        cloud.material.opacity = breathe;
      }
    }

    // Twinkling starfield rotation
    if (this.starfield) {
      this.starfield.rotation.y += delta * 0.015;
      this.starfield.rotation.x += delta * 0.005;
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ── Cleanup ──────────────────────────────────────────────

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.controls?.dispose();
    window.removeEventListener("resize", this._onResize);
    if (this._tooltipEl) this._tooltipEl.remove();
    this.scene?.traverse((obj) => {
      if (obj.geometry && obj.geometry !== this._noteMesh?.geometry) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      }
    });
    // Dispose InstancedMesh separately (its geometry is shared)
    if (this._noteMesh) {
      this._noteMesh.geometry.dispose();
      if (Array.isArray(this._noteMesh.material)) {
        this._noteMesh.material.forEach((m) => m.dispose());
      } else {
        this._noteMesh.material.dispose();
      }
    }
    this.renderer?.dispose();
    if (this.renderer?.domElement) {
      this.renderer.domElement.remove();
    }
  }
}

// ═══════════════════════════════════════════════════════════
// OBSIDIAN PLUGIN
// ═══════════════════════════════════════════════════════════

const VIEW_TYPE = "atlas-homepage-view";

class AtlasHomepageView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.leaf = leaf;
    this.plugin = plugin;
    this.scene = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Atlas · 星空星座图"; }
  getIcon() { return "globe"; }

  async onOpen() {
    const container =
      this.leaf.view.containerEl.children[1] || this.leaf.view.containerEl;
    container.empty();
    container.addClass("atlas-homepage-container");

    // Loading
    const loadingEl = container.createDiv("atlas-homepage-loading");
    loadingEl.createDiv("loading-star");
    loadingEl.createDiv("loading-text").setText("绘制星图...");

    try {
      const THREE = await ensureThreeJS();

      this.scene = new ConstellationScene(container, THREE, this.plugin.app, () => {
        loadingEl.addClass("hidden");
        setTimeout(() => loadingEl.remove(), 600);
      });

      const infoEl = container.createDiv("atlas-homepage-info");
      infoEl.setText("拖拽旋转 · 滚轮缩放 · 点击星辰打开笔记");

      this._createStatsBar(container);
    } catch (err) {
      loadingEl.querySelector(".loading-text")?.setText("加载失败，请检查网络连接后重试");
      console.error("[Atlas Homepage] Failed to load:", err);
    }
  }

  async _createStatsBar(container) {
    const statsEl = container.createDiv("atlas-homepage-stats");

    try {
      const files = this.plugin.app.vault.getMarkdownFiles();
      let totalLinks = 0;

      for (const area of AREAS) {
        const areaFiles = files.filter((f) => f.path.startsWith(area.path + "/"));
        for (const f of areaFiles) {
          const cache = this.plugin.app.metadataCache.getFileCache(f);
          totalLinks += (cache?.links?.length || 0);
        }
      }

      const statItems = [
        { label: "笔记", value: files.length.toString(), color: "#ddeeff" },
        { label: "链接", value: totalLinks.toString(), color: "#aaccff" },
        { label: "星域", value: (AREAS.length + EXTRA_NODES.length).toString(), color: "#8899bb" },
      ];

      statItems.forEach((item) => {
        const div = statsEl.createDiv("stat-item");
        const dot = div.createSpan("stat-dot");
        dot.style.backgroundColor = item.color;
        div.createSpan().setText(`${item.label} ${item.value}`);
      });
    } catch (_) {}
  }

  async onClose() {
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PLUGIN CLASS
// ═══════════════════════════════════════════════════════════

class AtlasHomepagePlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new AtlasHomepageView(leaf, this));

    this.addRibbonIcon("globe", "打开 Atlas 星空星座图", () => this.activateView());

    this.addCommand({
      id: "open-atlas-homepage",
      name: "打开 Atlas 星空星座图",
      callback: () => this.activateView(),
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}

module.exports = AtlasHomepagePlugin;
