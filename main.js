/**
 * Atlas Homepage — Floating Island Ocean
 * ==========================================
 * A custom Obsidian homepage plugin for the Atlas vault.
 * Renders a Three.js 3D scene with a Ghibli-inspired floating
 * island ocean aesthetic — organic islands, animated water,
 * drifting clouds, and glowing fireflies.
 *
 * Vault: Atlas (PARA + Learning/Logs/Inbox)
 * Style: Floating islands, ocean water, warm sky, organic terrain
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
// AREA DEFINITIONS — Mirrors the Atlas vault structure
// ═══════════════════════════════════════════════════════════

const AREAS = [
  {
    id: "Fun",
    name: "乐趣",
    ename: "Fun",
    icon: "🎨",
    path: "Areas/Fun",
    color: 0xff6b6b,
    subColor: 0xffe0e0,
    subfolders: ["Eureka", "Experience", "Movies&TV Shows", "Serendipities"],
    angle: -Math.PI / 2, // top
  },
  {
    id: "Health",
    name: "健康",
    ename: "Health",
    icon: "💚",
    path: "Areas/Health",
    color: 0x51cf66,
    subColor: 0xd8f5dc,
    subfolders: ["Books", "Eureka", "Serendipities"],
    angle: (-Math.PI / 2) + (2 * Math.PI) / 5, // top-right
  },
  {
    id: "Work",
    name: "工作",
    ename: "Work",
    icon: "💼",
    path: "Areas/Work",
    color: 0x9775fa,
    subColor: 0xe8ddff,
    subfolders: ["Language", "SideHustle", "SoftSkill", "Technical"],
    angle: (-Math.PI / 2) + (4 * Math.PI) / 5, // top-left
  },
  {
    id: "Love",
    name: "爱与家",
    ename: "Love & Family",
    icon: "💕",
    path: "Areas/Love",
    color: 0xf783ac,
    subColor: 0xffe0eb,
    subfolders: ["Experience", "Workshops"],
    angle: (-Math.PI / 2) + (6 * Math.PI) / 5, // bottom-left
  },
  {
    id: "People",
    name: "人物",
    ename: "People",
    icon: "👥",
    path: "Areas/People",
    color: 0x74c0fc,
    subColor: 0xd8eeff,
    subfolders: [],
    angle: (-Math.PI / 2) + (8 * Math.PI) / 5, // bottom-right
  },
];

const EXTRA_NODES = [
  {
    id: "Projects",
    name: "项目",
    icon: "📋",
    path: "Projects",
    color: 0xffa94d,
    angle: 0,
    distance: 6.8,
  },
  {
    id: "Learning",
    name: "学习",
    icon: "📚",
    path: "Learning",
    color: 0x20c997,
    angle: Math.PI / 3,
    distance: 6.8,
  },
  {
    id: "Logs",
    name: "日志",
    icon: "📝",
    path: "Logs",
    color: 0x868e96,
    angle: (2 * Math.PI) / 3,
    distance: 6.8,
  },
  {
    id: "Inbox",
    name: "收件箱",
    icon: "📥",
    path: "Inbox",
    color: 0xda77f2,
    angle: Math.PI,
    distance: 6.8,
  },
];

const AREA_RING_RADIUS = 4.5;

// ═══════════════════════════════════════════════════════════
// TERRAIN & DECORATION HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Displace cylinder vertices radially with layered sine noise
 * to create organic island coastlines.
 */
function displaceIslandVertices(geometry, seed) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const radius = Math.sqrt(x * x + z * z);
    if (radius < 0.02) continue; // skip center vertices

    const n =
      Math.sin(angle * 5.3 + seed) * 0.09 +
      Math.sin(angle * 3.1 + seed * 1.7) * 0.06 +
      Math.sin(angle * 7.7 + seed * 0.4) * 0.04 +
      Math.cos(angle * 2.3 + seed * 2.1) * 0.03;
    const newR = Math.max(0.12, radius + n);
    pos.setXYZ(i, Math.cos(angle) * newR, y, Math.sin(angle) * newR);
  }
  geometry.computeVertexNormals();
}

/**
 * Create a simple procedural tree: cylinder trunk + stacked cone foliage.
 * Returns a THREE.Group.
 */
function createTree(THREE, height, foliageRadius, seed) {
  const group = new THREE.Group();
  const rand = mulberry32(seed);

  // Trunk
  const trunkH = height * 0.45;
  const trunkGeo = new THREE.CylinderGeometry(0.03, 0.06, trunkH, 6);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x8b6914,
    roughness: 0.7,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Foliage layers (2-3 cones stacked)
  const layers = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < layers; i++) {
    const r = foliageRadius * (1 - i * 0.28);
    const coneH = height * 0.38;
    const coneGeo = new THREE.ConeGeometry(r, coneH, 8, 2);
    const hue = 0.18 + rand() * 0.14; // green range
    const sat = 0.5 + rand() * 0.3;
    const light = 0.28 + i * 0.08 + rand() * 0.06;
    const color = new THREE.Color().setHSL(hue, sat, light);
    const coneMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.55,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = trunkH + i * coneH * 0.65;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
  }

  return group;
}

/**
 * Simple seeded PRNG for tree variation (mulberry32).
 */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a cloud group from overlapping spheres.
 */
function createCloudGroup(THREE, seed) {
  const group = new THREE.Group();
  const rand = mulberry32(seed);
  const count = 5 + Math.floor(rand() * 6);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xfffef8,
    roughness: 0.9,
    transparent: true,
    opacity: 0.78,
  });

  for (let i = 0; i < count; i++) {
    const r = 0.18 + rand() * 0.45;
    const geo = new THREE.SphereGeometry(r, 8, 6);
    const blob = new THREE.Mesh(geo, cloudMat);
    blob.position.set(
      (rand() - 0.5) * 1.4,
      (rand() - 0.5) * 0.35,
      (rand() - 0.5) * 1.2
    );
    blob.castShadow = false;
    blob.receiveShadow = false;
    group.add(blob);
  }

  return group;
}

// ═══════════════════════════════════════════════════════════
// SPRITE LABEL HELPER
// ═══════════════════════════════════════════════════════════

function createLabelSprite(text, icon, colorHex) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  // Soft pill background for readability (manual rounded rect for compat)
  const pillW = 280;
  const pillH = 110;
  const pillX = (512 - pillW) / 2;
  const pillY = (256 - pillH) / 2 - 10;
  const pillR = 24;
  ctx.fillStyle = "rgba(255, 254, 248, 0.72)";
  ctx.beginPath();
  ctx.moveTo(pillX + pillR, pillY);
  ctx.lineTo(pillX + pillW - pillR, pillY);
  ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR, pillR);
  ctx.lineTo(pillX + pillW, pillY + pillH - pillR);
  ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH, pillR);
  ctx.lineTo(pillX + pillR, pillY + pillH);
  ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR, pillR);
  ctx.lineTo(pillX, pillY + pillR);
  ctx.arcTo(pillX, pillY, pillX + pillR, pillY, pillR);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(180, 170, 150, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Icon
  ctx.font = "48px serif";
  ctx.textAlign = "center";
  ctx.fillText(icon, 256, pillY + 48);

  // Text
  ctx.font = "bold 28px Georgia, 'Noto Serif SC', 'Segoe UI', serif";
  ctx.fillStyle = "#4a3728";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, pillY + 80);

  // Clean underline
  const textWidth = ctx.measureText(text).width;
  const underlineY = pillY + 92;
  ctx.strokeStyle = colorHex || "#8ec8d0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(256 - textWidth / 2, underlineY);
  ctx.lineTo(256 + textWidth / 2, underlineY);
  ctx.stroke();

  return canvas;
}

// ═══════════════════════════════════════════════════════════
// CUSTOM ORBIT CONTROLS (smooth cinematic feel)
// ═══════════════════════════════════════════════════════════

class SketchOrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = { x: 0, y: 0.3, z: 0 };
    this.spherical = { radius: 11, phi: Math.PI / 3.2, theta: -Math.PI / 2 };
    this.autoRotate = true;
    this.autoRotateSpeed = 0.15;
    this.enableDamping = true;
    this.dampingFactor = 0.08;
    this.minDistance = 6;
    this.maxDistance = 20;
    this.maxPhi = Math.PI / 2 - 0.1;
    this.minPhi = 0.2;

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
    domElement.addEventListener("touchstart", this._onTouchStart, {
      passive: false,
    });
    domElement.addEventListener("touchmove", this._onTouchMove, {
      passive: false,
    });
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
    this.spherical.theta -= dx * 0.005;
    this.spherical.phi -= dy * 0.005;
    this.spherical.phi = Math.max(
      this.minPhi,
      Math.min(this.maxPhi, this.spherical.phi)
    );
    this._velocity.theta = -dx * 0.005;
    this._velocity.phi = -dy * 0.005;
    this._prevMouse.x = e.clientX;
    this._prevMouse.y = e.clientY;
    this.autoRotate = false;
    setTimeout(() => { this.autoRotate = true; }, 3000);
  }

  _onMouseUp() {
    this._isDragging = false;
  }

  _onWheel(e) {
    this.spherical.radius += e.deltaY * 0.01;
    this.spherical.radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.spherical.radius)
    );
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
    this.spherical.theta -= dx * 0.005;
    this.spherical.phi -= dy * 0.005;
    this.spherical.phi = Math.max(
      this.minPhi,
      Math.min(this.maxPhi, this.spherical.phi)
    );
    this._prevMouse.x = e.touches[0].clientX;
    this._prevMouse.y = e.touches[0].clientY;
  }

  _onTouchEnd() {
    this._isDragging = false;
  }

  update(deltaTime) {
    if (this.autoRotate && !this._isDragging) {
      this.spherical.theta += this.autoRotateSpeed * deltaTime;
    } else if (!this._isDragging) {
      this.spherical.theta += this._velocity.theta;
      this.spherical.phi += this._velocity.phi;
      this._velocity.theta *= 1 - this.dampingFactor;
      this._velocity.phi *= 1 - this.dampingFactor;
      this.spherical.phi = Math.max(
        this.minPhi,
        Math.min(this.maxPhi, this.spherical.phi)
      );
    }

    // Minimal wobble for subtle organic feel (vs old 0.003 sketchy wobble)
    const wobble = this._isDragging
      ? 0
      : Math.sin(Date.now() * 0.0007) * 0.0005;
    const wobble2 = this._isDragging
      ? 0
      : Math.cos(Date.now() * 0.0009) * 0.0005;

    this.camera.position.x =
      this.target.x +
      this.spherical.radius *
        Math.sin(this.spherical.phi + wobble) *
        Math.cos(this.spherical.theta + wobble2);
    this.camera.position.y =
      this.target.y +
      this.spherical.radius * Math.cos(this.spherical.phi + wobble);
    this.camera.position.z =
      this.target.z +
      this.spherical.radius *
        Math.sin(this.spherical.phi + wobble) *
        Math.sin(this.spherical.theta + wobble2);
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
// 3D LIFE MAP SCENE — Floating Island Ocean
// ═══════════════════════════════════════════════════════════

class LifeMapScene {
  constructor(container, THREE, app) {
    this.THREE = THREE;
    this.app = app;
    this.container = container;
    this.animationId = null;
    this.clock = new THREE.Clock();
    this.hoveredObject = null;
    this.clickableObjects = [];

    this._init();
  }

  _init() {
    const THREE = this.THREE;

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0xb8d8e3); // pale sky blue
    this.container.appendChild(this.renderer.domElement);

    // --- Scene ---
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe8f0f0, 12, 38);

    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(
      50,
      this.container.clientWidth / this.container.clientHeight,
      0.5,
      40
    );
    this.camera.position.set(0, 7, 11);

    // --- Controls ---
    this.controls = new SketchOrbitControls(
      this.camera,
      this.renderer.domElement
    );

    // --- Lighting ---
    // Warm ambient base
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.45);
    this.scene.add(ambient);

    // Hemisphere: warm sky above, cool earth below
    const hemi = new THREE.HemisphereLight(0xffeedd, 0x6b8a7a, 0.5);
    this.scene.add(hemi);

    // Main sun (afternoon glow from above-right)
    const sun = new THREE.DirectionalLight(0xffeedd, 1.3);
    sun.position.set(12, 16, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);

    // Cool fill light (water reflection blue from opposite side)
    const fill = new THREE.DirectionalLight(0x88ccdd, 0.3);
    fill.position.set(-5, 2, -5);
    this.scene.add(fill);

    // --- Scene Elements ---
    this._createOcean();
    this._createAreaIslands();
    this._createExtraNodes();
    this._createSteppingStones();
    this._createClouds();
    this._createFireflies();
    this._createCentralTree();

    // --- Raycaster for interaction ---
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this._setupInteraction();

    // --- Resize ---
    this._onResize = () => {
      this.camera.aspect =
        this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(
        this.container.clientWidth,
        this.container.clientHeight
      );
    };
    window.addEventListener("resize", this._onResize);

    // --- Start ---
    this._animate();
  }

  // ── Ocean Water ──────────────────────────────────────────

  _createOcean() {
    const THREE = this.THREE;
    const size = 24;
    const segs = 32;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    // Cache original Y positions for wave animation
    const posArr = geo.attributes.position.array;
    this._waterOrigY = new Float32Array(posArr.length / 3);
    for (let i = 0; i < this._waterOrigY.length; i++) {
      this._waterOrigY[i] = posArr[i * 3 + 1];
    }

    const mat = new THREE.MeshPhongMaterial({
      color: 0x5b9aa0,
      specular: 0x8ec8d0,
      shininess: 80,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });

    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = -1.2;
    this.water.receiveShadow = true;
    this.water.name = "water";
    this.scene.add(this.water);

    // Ocean floor for depth illusion
    const floorGeo = new THREE.PlaneGeometry(size, size);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x1a4a5a });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -1.35;
    floor.name = "ocean-floor";
    this.scene.add(floor);
  }

  _animateWater(time) {
    if (!this.water) return;
    const pos = this.water.geometry.attributes.position;
    const arr = pos.array;
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      const origY = this._waterOrigY[i];
      const x = arr[i * 3];
      const z = arr[i * 3 + 2];

      const wave1 =
        Math.sin(x * 0.8 + time * 1.2) * Math.cos(z * 0.6 + time * 0.9) * 0.12;
      const wave2 =
        Math.sin(x * 0.4 - time * 0.7 + 1.5) *
        Math.sin(z * 0.5 + time * 1.1) *
        0.08;
      const wave3 = Math.cos(x * 1.1 + z * 0.9 + time * 0.5) * 0.05;

      arr[i * 3 + 1] = origY + wave1 + wave2 + wave3;
    }
    pos.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
  }

  // ── Area Islands (organic terrain) ───────────────────────

  _createAreaIslands() {
    const THREE = this.THREE;
    this.areaGroups = [];

    AREAS.forEach((area, idx) => {
      const group = new THREE.Group();
      const x = Math.cos(area.angle) * AREA_RING_RADIUS;
      const z = Math.sin(area.angle) * AREA_RING_RADIUS;
      group.position.set(x, 0, z);

      // Slight random tilt
      const tiltX = (Math.sin(idx * 2.7) * 0.04);
      const tiltZ = (Math.cos(idx * 1.8) * 0.04);
      group.rotation.x = tiltX;
      group.rotation.z = tiltZ;

      // --- Island body (CylinderGeometry with displacement) ---
      const bodyGeo = new THREE.CylinderGeometry(0.7, 1.05, 0.5, 20, 4);
      displaceIslandVertices(bodyGeo, idx * 37 + 5);

      const bodyMats = [
        // side (earth)
        new THREE.MeshStandardMaterial({
          color: 0x9b7b4a,
          roughness: 0.75,
          metalness: 0.05,
        }),
        // top (grass)
        new THREE.MeshStandardMaterial({
          color: 0x8db255,
          roughness: 0.65,
          metalness: 0.02,
        }),
        // bottom (dark earth)
        new THREE.MeshStandardMaterial({
          color: 0x6b5030,
          roughness: 0.8,
        }),
      ];
      const body = new THREE.Mesh(bodyGeo, bodyMats);
      body.position.y = 0.25; // half height
      body.castShadow = true;
      body.receiveShadow = true;
      body.name = `island-${area.id}`;
      group.add(body);

      // --- Trees ---
      const treeCount = 2 + (idx % 3); // 2–4 trees
      for (let t = 0; t < treeCount; t++) {
        const tAngle = (t / treeCount) * Math.PI * 2 + idx * 0.7;
        const tRadius = 0.25 + (t % 2) * 0.15;
        const tree = createTree(
          THREE,
          0.28 + (t % 3) * 0.04,
          0.11 + (t % 2) * 0.04,
          idx * 100 + t
        );
        tree.position.set(
          Math.cos(tAngle) * tRadius,
          0.52,
          Math.sin(tAngle) * tRadius
        );
        tree.scale.setScalar(0.8 + Math.random() * 0.4);
        group.add(tree);
      }

      // --- Subfolder indicators (small spheres on surface) ---
      const subCount = area.subfolders.length;
      area.subfolders.forEach((sub, i) => {
        const sAngle = (i / Math.max(subCount, 1)) * Math.PI * 2 + 0.3;
        const sRadius = 0.4;
        const sphereGeo = new THREE.SphereGeometry(0.06, 8, 6);
        const sphereMat = new THREE.MeshStandardMaterial({
          color: area.subColor,
          roughness: 0.4,
          emissive: area.subColor,
          emissiveIntensity: 0.15,
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.set(
          Math.cos(sAngle) * sRadius,
          0.52,
          Math.sin(sAngle) * sRadius
        );
        sphere.castShadow = true;
        sphere.name = `sub-${area.id}-${sub}`;
        group.add(sphere);
      });

      // --- Label Sprite ---
      const labelCanvas = createLabelSprite(
        area.name,
        area.icon,
        `#${area.color.toString(16).padStart(6, "0")}`
      );
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      labelTex.minFilter = THREE.LinearFilter;
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex,
        transparent: true,
        depthTest: false,
      });
      const label = new THREE.Sprite(labelMat);
      label.position.y = 0.95;
      label.scale.set(2.0, 1.0, 1);
      label.name = `label-${area.id}`;
      group.add(label);

      // --- Metadata for animation ---
      group.userData = {
        areaId: area.id,
        areaPath: area.path,
        areaName: area.name,
        areaIcon: area.icon,
        baseY: 0,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.4 + Math.random() * 0.6,
        bobAmp: 0.08 + Math.random() * 0.12,
        rotPhase: Math.random() * Math.PI * 2,
        rotSpeed: 0.2 + Math.random() * 0.3,
      };

      this.scene.add(group);
      this.clickableObjects.push(body);
      this.areaGroups.push(group);
    });
  }

  // ── Extra Nodes (mini floating islands) ──────────────────

  _createExtraNodes() {
    const THREE = this.THREE;
    this.extraGroups = [];

    EXTRA_NODES.forEach((node, idx) => {
      const group = new THREE.Group();
      const x = Math.cos(node.angle) * node.distance;
      const z = Math.sin(node.angle) * node.distance;
      group.position.set(x, 0.35, z);

      // Mini island body
      const bodyGeo = new THREE.CylinderGeometry(0.22, 0.38, 0.22, 14, 3);
      displaceIslandVertices(bodyGeo, idx * 53 + 17);

      const bodyMats = [
        new THREE.MeshStandardMaterial({
          color: 0x9b7b4a,
          roughness: 0.75,
          metalness: 0.05,
        }),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(node.color).multiplyScalar(0.7),
          roughness: 0.6,
          metalness: 0.02,
        }),
        new THREE.MeshStandardMaterial({
          color: 0x6b5030,
          roughness: 0.8,
        }),
      ];
      const body = new THREE.Mesh(bodyGeo, bodyMats);
      body.position.y = 0.11;
      body.castShadow = true;
      body.receiveShadow = true;
      body.name = `extra-${node.id}`;
      group.add(body);

      // Small tree/bush
      const miniTree = createTree(THREE, 0.18, 0.07, idx * 200 + 42);
      miniTree.position.y = 0.23;
      miniTree.scale.setScalar(0.65);
      group.add(miniTree);

      // Label
      const labelCanvas = createLabelSprite(
        node.name,
        node.icon,
        `#${node.color.toString(16).padStart(6, "0")}`
      );
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      labelTex.minFilter = THREE.LinearFilter;
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex,
        transparent: true,
        depthTest: false,
      });
      const label = new THREE.Sprite(labelMat);
      label.position.y = 0.55;
      label.scale.set(1.6, 0.8, 1);
      group.add(label);

      group.userData = {
        areaId: node.id,
        areaPath: node.path,
        areaName: node.name,
        areaIcon: node.icon,
        baseY: 0.35,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.3 + Math.random() * 0.5,
        bobAmp: 0.05 + Math.random() * 0.08,
        rotPhase: Math.random() * Math.PI * 2,
        rotSpeed: 0.15 + Math.random() * 0.25,
      };

      this.scene.add(group);
      this.clickableObjects.push(body);
      this.extraGroups.push(group);
    });
  }

  // ── Stepping Stones (underwater paths) ───────────────────

  _createSteppingStones() {
    const THREE = this.THREE;

    // Subtle concentric rings at water level suggesting paths
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xb5c8c0,
      roughness: 0.7,
      transparent: true,
      opacity: 0.18,
    });

    [2.2, 3.4, 5.6].forEach((radius) => {
      const ringGeo = new THREE.TorusGeometry(radius, 0.04, 8, 48);
      ringGeo.rotateX(Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = -0.85;
      ring.receiveShadow = true;
      ring.name = "stepping-stone-ring";
      this.scene.add(ring);
    });

    // Small scattered stones between islands
    const stoneGeo = new THREE.SphereGeometry(0.08, 5, 4);
    const stonePositions = [
      [1.8, 1.4], [-1.5, 1.6], [1.3, -1.7], [-1.7, -1.3],
      [0.4, 3.5], [-0.3, -3.2], [3.2, -0.2], [-3.1, 0.3],
    ];

    stonePositions.forEach(([sx, sz]) => {
      const stoneMat = new THREE.MeshStandardMaterial({
        color: 0xc8d5cc,
        roughness: 0.65,
        transparent: true,
        opacity: 0.25,
      });
      const stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.position.set(sx, -0.95, sz);
      stone.scale.set(1, 0.3, 1);
      stone.receiveShadow = true;
      stone.name = "stepping-stone";
      this.scene.add(stone);
    });
  }

  // ── Floating Clouds ──────────────────────────────────────

  _createClouds() {
    const THREE = this.THREE;
    this.cloudGroups = [];

    const cloudDefs = [
      { x: 3.5, z: 2.0, y: 3.2, seed: 101 },
      { x: -3.0, z: 2.5, y: 3.8, seed: 202 },
      { x: 2.0, z: -3.2, y: 2.8, seed: 303 },
      { x: -2.8, z: -2.8, y: 3.5, seed: 404 },
      { x: 5.0, z: -0.5, y: 4.0, seed: 505 },
      { x: -4.5, z: -1.0, y: 3.0, seed: 606 },
      { x: 0.5, z: 4.0, y: 3.6, seed: 707 },
      { x: -0.8, z: -4.2, y: 4.2, seed: 808 },
    ];

    cloudDefs.forEach((def) => {
      const cloud = createCloudGroup(THREE, def.seed);
      cloud.position.set(def.x, def.y, def.z);
      cloud.userData = {
        baseX: def.x,
        baseZ: def.z,
        baseY: def.y,
        driftAngle: Math.random() * Math.PI * 2,
        driftSpeed: 0.08 + Math.random() * 0.15,
        driftRadius: 0.6 + Math.random() * 1.5,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.3 + Math.random() * 0.4,
      };
      cloud.name = "cloud";
      this.scene.add(cloud);
      this.cloudGroups.push(cloud);
    });
  }

  _animateClouds(time) {
    this.cloudGroups.forEach((cloud) => {
      const ud = cloud.userData;
      cloud.position.x =
        ud.baseX + Math.cos(time * ud.driftSpeed + ud.swayPhase) * ud.driftRadius;
      cloud.position.z =
        ud.baseZ + Math.sin(time * ud.driftSpeed * 0.8 + ud.swayPhase) * ud.driftRadius * 0.8;
      cloud.position.y =
        ud.baseY + Math.sin(time * ud.swaySpeed + ud.swayPhase) * 0.3;
    });
  }

  // ── Firefly Particles ────────────────────────────────────

  _createFireflies() {
    const THREE = this.THREE;
    const count = 150;
    const positions = new Float32Array(count * 3);

    this._fireflyParams = [];
    for (let i = 0; i < count; i++) {
      const bx = (Math.random() - 0.5) * 12;
      const bz = (Math.random() - 0.5) * 12;
      const by = 0.3 + Math.random() * 4.5;
      positions[i * 3] = bx;
      positions[i * 3 + 1] = by;
      positions[i * 3 + 2] = bz;

      this._fireflyParams.push({
        baseX: bx,
        baseZ: bz,
        baseY: by,
        ax: 0.4 + Math.random() * 1.8,
        az: 0.4 + Math.random() * 1.8,
        ay: 0.15 + Math.random() * 0.4,
        px: Math.random() * Math.PI * 2,
        pz: Math.random() * Math.PI * 2,
        py: Math.random() * Math.PI * 2,
        speed: 0.25 + Math.random() * 0.7,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 1.5 + Math.random() * 3,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Radial glow sprite
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgba(255, 230, 120, 0.95)");
    gradient.addColorStop(0.15, "rgba(255, 210, 60, 0.75)");
    gradient.addColorStop(0.4, "rgba(255, 180, 30, 0.25)");
    gradient.addColorStop(0.7, "rgba(255, 150, 20, 0.05)");
    gradient.addColorStop(1, "rgba(255, 120, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.PointsMaterial({
      map: tex,
      color: 0xffd700,
      size: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.7,
    });

    this.fireflies = new THREE.Points(geo, mat);
    this.fireflies.name = "fireflies";
    this.scene.add(this.fireflies);
  }

  _animateFireflies(time) {
    if (!this.fireflies) return;
    const pos = this.fireflies.geometry.attributes.position.array;

    for (let i = 0; i < this._fireflyParams.length; i++) {
      const p = this._fireflyParams[i];
      pos[i * 3] = p.baseX + Math.sin(time * p.speed + p.px) * p.ax;
      pos[i * 3 + 1] = p.baseY + Math.sin(time * p.speed * 1.3 + p.py) * p.ay;
      pos[i * 3 + 2] = p.baseZ + Math.cos(time * p.speed * 0.9 + p.pz) * p.az;
    }
    this.fireflies.geometry.attributes.position.needsUpdate = true;

    // Vary overall opacity for subtle twinkling
    const twinkle = 0.55 + Math.sin(time * 0.8) * 0.15;
    this.fireflies.material.opacity = twinkle;
  }

  // ── Central Great Tree ───────────────────────────────────

  _createCentralTree() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.position.set(0, 0.3, 0);

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.06, 0.16, 1.2, 10);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x7a5c3a,
      roughness: 0.6,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.6;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Root tendrils spreading outward
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const rootGeo = new THREE.CylinderGeometry(0.02, 0.05, 0.5, 6);
      const root = new THREE.Mesh(rootGeo, trunkMat);
      root.position.set(
        Math.cos(angle) * 0.22,
        0.15,
        Math.sin(angle) * 0.22
      );
      root.rotation.z = Math.cos(angle) * 0.8;
      root.rotation.x = Math.sin(angle) * 0.8;
      root.castShadow = true;
      group.add(root);
    }

    // Foliage layers (canopy)
    const foliageDefs = [
      { r: 0.55, h: 0.45, y: 1.0 },
      { r: 0.42, h: 0.4, y: 1.3 },
      { r: 0.3, h: 0.35, y: 1.55 },
      { r: 0.18, h: 0.3, y: 1.75 },
    ];

    foliageDefs.forEach((def, i) => {
      const coneGeo = new THREE.ConeGeometry(def.r, def.h, 10, 2);
      const hue = 0.2 + i * 0.03;
      const color = new THREE.Color().setHSL(hue, 0.55, 0.3 + i * 0.06);
      const coneMat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = def.y;
      cone.castShadow = true;
      cone.receiveShadow = true;
      group.add(cone);
    });

    // Orbiting glow particles around canopy
    const orbitCount = 25;
    const orbitPositions = new Float32Array(orbitCount * 3);
    this._treeOrbitData = [];
    for (let i = 0; i < orbitCount; i++) {
      const angle = (i / orbitCount) * Math.PI * 2;
      const radius = 0.5 + Math.random() * 0.25;
      const height = 0.9 + Math.random() * 0.9;
      orbitPositions[i * 3] = Math.cos(angle) * radius;
      orbitPositions[i * 3 + 1] = height;
      orbitPositions[i * 3 + 2] = Math.sin(angle) * radius;
      this._treeOrbitData.push({
        angle: angle,
        radius: radius,
        height: height,
        speed: 0.3 + Math.random() * 0.6,
        yOsc: Math.random() * Math.PI * 2,
      });
    }

    const orbitGeo = new THREE.BufferGeometry();
    orbitGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(orbitPositions, 3)
    );

    // Mini glow sprite for orbiting particles
    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = 16;
    dotCanvas.height = 16;
    const dctx = dotCanvas.getContext("2d");
    const dgrad = dctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    dgrad.addColorStop(0, "rgba(255, 240, 180, 0.9)");
    dgrad.addColorStop(0.5, "rgba(255, 200, 80, 0.3)");
    dgrad.addColorStop(1, "rgba(255, 150, 30, 0)");
    dctx.fillStyle = dgrad;
    dctx.fillRect(0, 0, 16, 16);

    const orbitTex = new THREE.CanvasTexture(dotCanvas);
    const orbitMat = new THREE.PointsMaterial({
      map: orbitTex,
      color: 0xffe8a0,
      size: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.65,
    });

    this.treeOrbitParticles = new THREE.Points(orbitGeo, orbitMat);
    group.add(this.treeOrbitParticles);

    group.name = "central-tree";
    this.centralTreeGroup = group;
    this.scene.add(group);
  }

  _animateCentralTree(time) {
    if (!this.centralTreeGroup) return;

    // Gentle sway
    this.centralTreeGroup.rotation.z =
      Math.sin(time * 0.35) * 0.015;
    this.centralTreeGroup.rotation.x =
      Math.cos(time * 0.42) * 0.01;

    // Orbit particles
    if (this.treeOrbitParticles && this._treeOrbitData) {
      const pos = this.treeOrbitParticles.geometry.attributes.position.array;
      for (let i = 0; i < this._treeOrbitData.length; i++) {
        const d = this._treeOrbitData[i];
        const a = d.angle + time * d.speed;
        pos[i * 3] = Math.cos(a) * d.radius;
        pos[i * 3 + 1] = d.height + Math.sin(time * 1.2 + d.yOsc) * 0.12;
        pos[i * 3 + 2] = Math.sin(a) * d.radius;
      }
      this.treeOrbitParticles.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ── Interaction ──────────────────────────────────────────

  _setupInteraction() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    canvas.addEventListener("click", (e) => {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(
        this.clickableObjects
      );
      if (intersects.length > 0) {
        const obj = intersects[0].object;
        this._navigateTo(obj);
      }
    });

    // Touch support
    canvas.addEventListener("touchend", (e) => {
      if (e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        const my = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        const mouseVec = new this.THREE.Vector2(mx, my);
        this.raycaster.setFromCamera(mouseVec, this.camera);
        const intersects = this.raycaster.intersectObjects(
          this.clickableObjects
        );
        if (intersects.length > 0) {
          this._navigateTo(intersects[0].object);
        }
      }
    });
  }

  _navigateTo(obj) {
    let areaPath = null;

    // Check area island clicks
    for (const group of this.areaGroups) {
      if (
        obj.name === `island-${group.userData.areaId}` ||
        (obj.name && obj.name.startsWith(`sub-${group.userData.areaId}`))
      ) {
        areaPath = group.userData.areaPath;
        break;
      }
    }

    // Check extra node clicks
    if (!areaPath) {
      for (const group of this.extraGroups) {
        if (obj.name === `extra-${group.userData.areaId}`) {
          areaPath = group.userData.areaPath;
          break;
        }
      }
    }

    if (areaPath && this.app) {
      const fileExplorer =
        this.app.internalPlugins?.getPluginById("file-explorer");
      if (fileExplorer?.enabled) {
        const abstractFile = this.app.vault.getAbstractFileByPath(areaPath);
        if (abstractFile) {
          const leaves = this.app.workspace.getLeavesOfType("file-explorer");
          if (leaves.length > 0) {
            // @ts-ignore
            const explorerView = leaves[0].view;
            if (explorerView?.revealInFolder) {
              explorerView.revealInFolder(abstractFile);
            }
          }
        }
      }
    }
  }

  // ── Animation Loop ───────────────────────────────────────

  _animate() {
    this.animationId = requestAnimationFrame(() => this._animate());

    const delta = this.clock.getDelta();
    const time = Date.now() * 0.001;

    // Update controls
    this.controls.update(Math.min(delta, 0.1));

    // Animate water waves
    this._animateWater(time);

    // Bob + gentle rotation for area islands
    this.areaGroups.forEach((group) => {
      const ud = group.userData;
      group.position.y =
        ud.baseY + Math.sin(time * ud.bobSpeed + ud.bobPhase) * ud.bobAmp;
      group.rotation.y +=
        Math.sin(time * ud.rotSpeed + ud.rotPhase) * 0.0003;
    });

    // Bob + rotation for extra nodes
    this.extraGroups.forEach((group) => {
      const ud = group.userData;
      group.position.y =
        ud.baseY + Math.sin(time * ud.bobSpeed + ud.bobPhase) * ud.bobAmp;
      group.rotation.y +=
        Math.sin(time * ud.rotSpeed + ud.rotPhase) * 0.0002;
    });

    // Animate clouds
    this._animateClouds(time);

    // Animate fireflies
    this._animateFireflies(time);

    // Animate central tree
    this._animateCentralTree(time);

    // Hover detection
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.clickableObjects);
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      if (this.hoveredObject !== obj) {
        this._unhover();
        this.hoveredObject = obj;
        if (obj.material.emissive) {
          obj.material._origEmissive = obj.material.emissive.getHex();
        }
        document.body.style.cursor = "pointer";
      }
    } else {
      this._unhover();
      document.body.style.cursor = "";
    }

    this.renderer.render(this.scene, this.camera);
  }

  _unhover() {
    if (this.hoveredObject && this.hoveredObject.material) {
      this.hoveredObject = null;
    }
  }

  // ── Cleanup ──────────────────────────────────────────────

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.controls?.dispose();
    window.removeEventListener("resize", this._onResize);
    this.scene?.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
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

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "Atlas · 人生地图";
  }

  getIcon() {
    return "globe";
  }

  async onOpen() {
    const container = this.leaf.view.containerEl.children[1] ||
                      this.leaf.view.containerEl;
    container.empty();
    container.addClass("atlas-homepage-container");

    // Loading overlay
    const loadingEl = container.createDiv("atlas-homepage-loading");
    loadingEl.createDiv("loading-sketch");
    loadingEl.createDiv("loading-text").setText("绘制你的人生地图...");

    try {
      const THREE = await ensureThreeJS();

      // Create the 3D scene
      this.scene = new LifeMapScene(container, THREE, this.plugin.app);

      // Fade out loading
      loadingEl.addClass("hidden");
      setTimeout(() => loadingEl.remove(), 600);

      // Info overlay
      const infoEl = container.createDiv("atlas-homepage-info");
      infoEl.setText("拖拽旋转 · 滚轮缩放 · 点击浮岛探索你的知识海洋");

      // Stats bar
      this._createStatsBar(container);
    } catch (err) {
      loadingEl.querySelector(".loading-text")?.setText(
        "加载失败，请检查网络连接后重试"
      );
      console.error("[Atlas Homepage] Failed to load:", err);
    }
  }

  async _createStatsBar(container) {
    const statsEl = container.createDiv("atlas-homepage-stats");

    try {
      const counts = {};
      for (const area of AREAS) {
        const files = this.plugin.app.vault.getFiles().filter(
          (f) => f.path.startsWith(area.path) && f.extension === "md"
        );
        counts[area.id] = files.length;
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const statItems = [
        { label: "笔记", value: total.toString(), color: "#5a8590" },
        { label: "领域", value: AREAS.length.toString(), color: "#8ec8d0" },
        ...AREAS.map((a) => ({
          label: a.ename,
          value: (counts[a.id] || 0).toString(),
          color: `#${a.color.toString(16).padStart(6, "0")}`,
        })),
      ];

      statItems.forEach((item) => {
        const div = statsEl.createDiv("stat-item");
        const dot = div.createSpan("stat-dot");
        dot.style.backgroundColor = item.color;
        div.createSpan().setText(`${item.label} ${item.value}`);
      });
    } catch (_) {
      // Stats are optional, don't break on error
    }
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
    // Register custom view
    this.registerView(
      VIEW_TYPE,
      (leaf) => new AtlasHomepageView(leaf, this)
    );

    // Add ribbon icon
    this.addRibbonIcon("globe", "打开 Atlas 人生地图", () => {
      this.activateView();
    });

    // Add command
    this.addCommand({
      id: "open-atlas-homepage",
      name: "打开 Atlas 人生地图",
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
      await leaf.setViewState({
        type: VIEW_TYPE,
        active: true,
      });
    }
    workspace.revealLeaf(leaf);
  }
}

// Export
module.exports = AtlasHomepagePlugin;
