/**
 * Atlas Homepage — Hand-drawn 3D Life Map
 * ==========================================
 * A custom Obsidian homepage plugin for the Atlas vault.
 * Renders a Three.js 3D scene with a hand-drawn / sketch aesthetic,
 * turning your PARA-structured knowledge base into an interactive
 * floating map of paper-crafted islands.
 *
 * Vault: Atlas (PARA + Learning/Logs/Inbox)
 * Style: Hand-drawn, ink-wash, paper texture, cel-shaded
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
const ISLAND_SIZE = 1.6;
const ISLAND_HEIGHT = 0.25;

// ═══════════════════════════════════════════════════════════
// PAPER TEXTURE GENERATOR (procedural)
// ═══════════════════════════════════════════════════════════

function generatePaperTexture(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Base: warm cream paper
  ctx.fillStyle = "#f5f0e8";
  ctx.fillRect(0, 0, width, height);

  // Grain noise
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 18;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise - 2));
  }
  ctx.putImageData(imageData, 0, 0);

  // Subtle fiber texture (horizontal lines)
  ctx.strokeStyle = "rgba(180,160,130,0.06)";
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.random() * 2);
    ctx.lineTo(width, y + Math.random() * 2);
    ctx.stroke();
  }

  // Subtle stains / age spots
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = 20 + Math.random() * 80;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, "rgba(180,160,130,0.08)");
    gradient.addColorStop(1, "rgba(180,160,130,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

// ═══════════════════════════════════════════════════════════
// CUSTOM ORBIT CONTROLS (hand-drawn wobble)
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
      // Damping velocity
      this.spherical.theta += this._velocity.theta;
      this.spherical.phi += this._velocity.phi;
      this._velocity.theta *= 1 - this.dampingFactor;
      this._velocity.phi *= 1 - this.dampingFactor;
      this.spherical.phi = Math.max(
        this.minPhi,
        Math.min(this.maxPhi, this.spherical.phi)
      );
    }

    // Wobble: subtle hand-drawn jitter
    const wobble = this._isDragging
      ? 0
      : Math.sin(Date.now() * 0.0007) * 0.003;
    const wobble2 = this._isDragging
      ? 0
      : Math.cos(Date.now() * 0.0009) * 0.003;

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
// SPRITE LABEL HELPER
// ═══════════════════════════════════════════════════════════

function createLabelSprite(text, icon, colorHex) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  // Icon
  ctx.font = "36px serif";
  ctx.textAlign = "center";
  ctx.fillText(icon, 128, 42);

  // Text — hand-drawn feel via slight rotation variance
  ctx.font = "bold 22px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#3d3226";
  ctx.textAlign = "center";
  ctx.fillText(text, 128, 76);

  // Subtle underline (sketch-like)
  ctx.strokeStyle = colorHex || "#c4b5a0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const textWidth = ctx.measureText(text).width;
  const startX = 128 - textWidth / 2;
  ctx.moveTo(startX, 84);
  // Slightly wavy underline
  for (let x = 0; x < textWidth; x += 8) {
    ctx.lineTo(
      startX + x,
      84 + Math.sin(x * 0.4) * 1.5
    );
  }
  ctx.stroke();

  return canvas;
}

// ═══════════════════════════════════════════════════════════
// 3D LIFE MAP SCENE
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
    this.renderer.setClearColor(0xf5f0e8);
    this.container.appendChild(this.renderer.domElement);

    // --- Scene ---
    this.scene = new THREE.Scene();
    // Subtle fog for depth atmosphere
    this.scene.fog = new THREE.Fog(0xf5f0e8, 8, 28);

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
    // Soft ambient (ink-wash)
    const ambient = new THREE.AmbientLight(0xfff8ee, 0.7);
    this.scene.add(ambient);

    // Main directional light (cast shadows, like afternoon sun)
    const sun = new THREE.DirectionalLight(0xfff5e6, 1.0);
    sun.position.set(8, 14, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    sun.shadow.bias = -0.0001;
    this.scene.add(sun);

    // Fill light (cooler, from opposite side)
    const fill = new THREE.DirectionalLight(0xd8e8ff, 0.35);
    fill.position.set(-4, 3, -4);
    this.scene.add(fill);

    // --- Paper Ground ---
    this._createPaperGround();

    // --- Area Islands ---
    this._createAreaIslands();

    // --- Extra Nodes ---
    this._createExtraNodes();

    // --- Connecting Lines ---
    this._createConnectingLines();

    // --- Floating Particles ---
    this._createParticles();

    // --- Compass Rose ---
    this._createCompassRose();

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

  _createPaperGround() {
    const THREE = this.THREE;

    // Large paper plane
    const paperTexCanvas = generatePaperTexture(1024, 1024);
    const paperTex = new THREE.CanvasTexture(paperTexCanvas);
    paperTex.wrapS = THREE.RepeatWrapping;
    paperTex.wrapT = THREE.RepeatWrapping;
    paperTex.repeat.set(3, 3);

    const groundGeo = new THREE.PlaneGeometry(22, 22);
    const groundMat = new THREE.MeshStandardMaterial({
      map: paperTex,
      color: 0xf5f0e8,
      roughness: 0.85,
      metalness: 0.02,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    ground.name = "paper-ground";
    this.scene.add(ground);

    // Subtle grid lines (hand-drawn dotted)
    const gridGroup = new THREE.Group();
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xddd5c5 });
    const dotGeo = new THREE.SphereGeometry(0.04, 4, 4);

    for (let x = -9; x <= 9; x += 1.5) {
      for (let z = -9; z <= 9; z += 1.5) {
        if (Math.random() > 0.65) continue; // random gaps for hand-drawn feel
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(x + (Math.random() - 0.5) * 0.4, -1.48, z + (Math.random() - 0.5) * 0.4);
        gridGroup.add(dot);
      }
    }
    gridGroup.name = "paper-dots";
    this.scene.add(gridGroup);
  }

  _createAreaIslands() {
    const THREE = this.THREE;
    this.areaGroups = [];

    AREAS.forEach((area) => {
      const group = new THREE.Group();
      const x = Math.cos(area.angle) * AREA_RING_RADIUS;
      const z = Math.sin(area.angle) * AREA_RING_RADIUS;
      group.position.set(x, 0, z);

      // Slight random tilt for hand-drawn feel
      group.rotation.x = (Math.random() - 0.5) * 0.05;
      group.rotation.z = (Math.random() - 0.5) * 0.05;

      // --- Island Base (rounded box with edge outlines) ---
      const baseGeo = new THREE.BoxGeometry(
        ISLAND_SIZE,
        ISLAND_HEIGHT,
        ISLAND_SIZE
      );

      // Cel-shaded / toon material for hand-drawn look
      const baseMat = new THREE.MeshToonMaterial({
        color: area.color,
        // Lighter tint for the toon gradient
      });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = ISLAND_HEIGHT / 2;
      base.castShadow = true;
      base.receiveShadow = true;
      base.name = `island-${area.id}`;
      group.add(base);

      // --- Sketchy Edge Outline ---
      const edgeGeo = new THREE.EdgesGeometry(baseGeo, 30);
      // First outline pass (thicker, darker)
      const edgeLine1 = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({
          color: 0x3d3226,
          linewidth: 1,
          transparent: true,
          opacity: 0.35,
        })
      );
      edgeLine1.position.y = ISLAND_HEIGHT / 2;
      group.add(edgeLine1);

      // Second pass (offset, sketchy)
      const edgeLine2 = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({
          color: 0x5c4a3a,
          linewidth: 1,
          transparent: true,
          opacity: 0.15,
        })
      );
      edgeLine2.position.y = ISLAND_HEIGHT / 2;
      edgeLine2.position.x += 0.03;
      edgeLine2.position.z += 0.02;
      group.add(edgeLine2);

      // --- Subfolder mini-blocks on the island ---
      const subCount = area.subfolders.length;
      area.subfolders.forEach((sub, i) => {
        const subSize = 0.22;
        const subGeo = new THREE.BoxGeometry(subSize, 0.12, subSize);
        const subMat = new THREE.MeshToonMaterial({
          color: area.subColor,
        });
        const subMesh = new THREE.Mesh(subGeo, subMat);
        subMesh.position.y = ISLAND_HEIGHT + 0.06;

        // Arrange sub-blocks on the island surface
        const angle = (i / subCount) * Math.PI * 2;
        const subRadius = ISLAND_SIZE * 0.35;
        subMesh.position.x = Math.cos(angle) * subRadius;
        subMesh.position.z = Math.sin(angle) * subRadius;
        subMesh.castShadow = true;
        subMesh.name = `sub-${area.id}-${sub}`;
        group.add(subMesh);

        // Mini outline
        const subEdge = new THREE.LineSegments(
          new THREE.EdgesGeometry(subGeo),
          new THREE.LineBasicMaterial({
            color: 0x5c4a3a,
            transparent: true,
            opacity: 0.2,
          })
        );
        subEdge.position.copy(subMesh.position);
        group.add(subEdge);
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
      label.position.y = ISLAND_HEIGHT + 0.65;
      label.scale.set(2.0, 1.0, 1);
      label.name = `label-${area.id}`;
      group.add(label);

      // --- Store metadata ---
      group.userData = {
        areaId: area.id,
        areaPath: area.path,
        areaName: area.name,
        areaIcon: area.icon,
        baseY: 0,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.4 + Math.random() * 0.6,
        bobAmp: 0.08 + Math.random() * 0.12,
      };

      this.scene.add(group);
      this.clickableObjects.push(base);
      this.areaGroups.push(group);
    });
  }

  _createExtraNodes() {
    const THREE = this.THREE;
    this.extraGroups = [];

    EXTRA_NODES.forEach((node) => {
      const group = new THREE.Group();
      const x = Math.cos(node.angle) * node.distance;
      const z = Math.sin(node.angle) * node.distance;
      group.position.set(x, 0.35, z);

      // Small floating platform
      const platGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.12, 6);
      const platMat = new THREE.MeshToonMaterial({ color: node.color });
      const platform = new THREE.Mesh(platGeo, platMat);
      platform.position.y = 0.06;
      platform.castShadow = true;
      platform.receiveShadow = true;
      platform.name = `extra-${node.id}`;
      group.add(platform);

      // Hex edge outline
      const edgeGeo = new THREE.EdgesGeometry(platGeo);
      const edgeLine = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({
          color: 0x3d3226,
          transparent: true,
          opacity: 0.3,
        })
      );
      edgeLine.position.y = 0.06;
      group.add(edgeLine);

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
      };

      this.scene.add(group);
      this.clickableObjects.push(platform);
      this.extraGroups.push(group);
    });
  }

  _createConnectingLines() {
    const THREE = this.THREE;

    // Draw hand-drawn style curved lines from center to each area
    this.areaGroups.forEach((group) => {
      const points = [];
      const tx = group.position.x;
      const tz = group.position.z;
      const segments = 40;

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Ease out from center
        const eased = 1 - Math.pow(1 - t, 2);
        const x = tx * eased;
        const z = tz * eased;
        // Slight arc upward
        const y = 0.25 + Math.sin(t * Math.PI) * 0.6;
        // Hand-drawn wobble
        const wobble = Math.sin(t * 17) * 0.04 + Math.cos(t * 23) * 0.03;
        points.push(
          new THREE.Vector3(
            x + wobble * (Math.abs(tz) + 0.1),
            y,
            z + wobble * (Math.abs(tx) + 0.1)
          )
        );
      }

      const curveGeo = new THREE.BufferGeometry().setFromPoints(points);
      const curveLine = new THREE.Line(
        curveGeo,
        new THREE.LineBasicMaterial({
          color: 0xc4b5a0,
          transparent: true,
          opacity: 0.3,
        })
      );
      curveLine.name = "connect-line";
      this.scene.add(curveLine);
    });
  }

  _createParticles() {
    const THREE = this.THREE;
    const particleCount = 200;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = 0.3 + Math.random() * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 16;
      sizes[i] = Math.random() * 3 + 1;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    particleGeo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Use small circle sprites for dust motes
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = 32;
    spriteCanvas.height = 32;
    const ctx = spriteCanvas.getContext("2d");
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgba(200,180,150,0.5)");
    gradient.addColorStop(0.5, "rgba(200,180,150,0.15)");
    gradient.addColorStop(1, "rgba(200,180,150,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const spriteTex = new THREE.CanvasTexture(spriteCanvas);
    const particleMat = new THREE.PointsMaterial({
      map: spriteTex,
      color: 0xd4c5b0,
      size: 0.25,
      blending: THREE.NormalBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.5,
    });

    this.particles = new THREE.Points(particleGeo, particleMat);
    this.particles.name = "dust-particles";
    this.scene.add(this.particles);
  }

  _createCompassRose() {
    const THREE = this.THREE;

    // Simple compass rose at center
    const group = new THREE.Group();
    group.position.set(0, 0.18, 0);

    // Center dot
    const dotGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const dotMat = new THREE.MeshToonMaterial({ color: 0x8b7355 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    group.add(dot);

    // N indicator
    const nCanvas = document.createElement("canvas");
    nCanvas.width = 64;
    nCanvas.height = 64;
    const ctx = nCanvas.getContext("2d");
    ctx.fillStyle = "#8b7355";
    ctx.font = "bold 28px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 32, 32);

    const nTex = new THREE.CanvasTexture(nCanvas);
    nTex.minFilter = THREE.LinearFilter;
    const nMat = new THREE.SpriteMaterial({
      map: nTex,
      transparent: true,
      depthTest: false,
    });
    const nSprite = new THREE.Sprite(nMat);
    nSprite.position.set(0, 0.35, 0);
    nSprite.scale.set(0.6, 0.6, 1);
    group.add(nSprite);

    group.name = "compass";
    this.scene.add(group);
  }

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
        obj.name?.startsWith(`sub-${group.userData.areaId}`)
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
      // Open the folder in Obsidian's file explorer
      const fileExplorer =
        this.app.internalPlugins?.getPluginById("file-explorer");
      if (fileExplorer?.enabled) {
        // Reveal in file explorer
        const abstractFile = this.app.vault.getAbstractFileByPath(areaPath);
        if (abstractFile) {
          // Use the file explorer's reveal method
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

  _animate() {
    this.animationId = requestAnimationFrame(() => this._animate());

    const delta = this.clock.getDelta();
    const time = Date.now() * 0.001;

    // Update controls
    this.controls.update(Math.min(delta, 0.1));

    // Bob area islands
    this.areaGroups.forEach((group) => {
      const ud = group.userData;
      group.position.y =
        ud.baseY + Math.sin(time * ud.bobSpeed + ud.bobPhase) * ud.bobAmp;
    });

    // Bob extra nodes
    this.extraGroups.forEach((group) => {
      const ud = group.userData;
      group.position.y =
        ud.baseY + Math.sin(time * ud.bobSpeed + ud.bobPhase) * ud.bobAmp;
    });

    // Animate particles
    if (this.particles) {
      const pos = this.particles.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] += Math.sin(time * 1.3 + i) * 0.002;
        // Wrap particles that float too high
        if (pos[i + 1] > 5.5) pos[i + 1] = 0.3;
        if (pos[i + 1] < 0.1) pos[i + 1] = 5.3;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    // Hover detection
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.clickableObjects);
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      if (this.hoveredObject !== obj) {
        this._unhover();
        this.hoveredObject = obj;
        obj.material?.emissive?.set(obj.material.emissive || 0x000000);
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

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.controls?.dispose();
    window.removeEventListener("resize", this._onResize);
    this.renderer?.dispose();
    this.scene?.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
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
      infoEl.setText("拖拽旋转 · 滚轮缩放 · 点击岛屿探索你的知识地图");

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

    // Count notes in each area (async)
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
        { label: "笔记", value: total.toString(), color: "#8b7355" },
        { label: "领域", value: AREAS.length.toString(), color: "#c4b5a0" },
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
    const self = this;
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
      // Open in the center/main area
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
