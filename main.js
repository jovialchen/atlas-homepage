/**
 * Atlas Homepage — 枯山水 · Zen Garden
 * ==========================================
 * A custom Obsidian homepage plugin for the Atlas vault.
 * Renders a karesansui (dry landscape) zen garden using
 * pure Canvas 2D — stones, raked sand ripples, moss,
 * and subtle ink-wash animation.
 *
 * Vault: Atlas (PARA + Learning/Logs/Inbox)
 * Style: Japanese zen garden, ink-wash, wabi-sabi
 *
 * Zero external dependencies — no Three.js CDN needed.
 */

"use strict";

var obsidian = require("obsidian");
var Plugin = obsidian.Plugin;
var ItemView = obsidian.ItemView;

// ═══════════════════════════════════════════════════════════
// AREA DEFINITIONS
// ═══════════════════════════════════════════════════════════

const AREAS = [
  {
    id: "Fun",
    name: "乐趣",
    ename: "Fun",
    icon: "🎨",
    path: "Areas/Fun",
    color: "#c47a6b",
    mossColor: "#9bb87f",
    subfolders: ["Eureka", "Experience", "Movies&TV Shows", "Serendipities"],
    // Position in design space (1000×700)
    cx: 500, cy: 185, size: 48,
  },
  {
    id: "Health",
    name: "健康",
    ename: "Health",
    icon: "💚",
    path: "Areas/Health",
    color: "#8a9b7a",
    mossColor: "#7da864",
    subfolders: ["Books", "Eureka", "Serendipities"],
    cx: 690, cy: 295, size: 44,
  },
  {
    id: "Work",
    name: "工作",
    ename: "Work",
    icon: "💼",
    path: "Areas/Work",
    color: "#8b82a0",
    mossColor: "#8aaa76",
    subfolders: ["Language", "SideHustle", "SoftSkill", "Technical"],
    cx: 310, cy: 295, size: 50,
  },
  {
    id: "Love",
    name: "爱与家",
    ename: "Love & Family",
    icon: "💕",
    path: "Areas/Love",
    color: "#b88a94",
    mossColor: "#94b87a",
    subfolders: ["Experience", "Workshops"],
    cx: 340, cy: 490, size: 42,
  },
  {
    id: "People",
    name: "人物",
    ename: "People",
    icon: "👥",
    path: "Areas/People",
    color: "#8a9aaa",
    mossColor: "#82a878",
    subfolders: [],
    cx: 660, cy: 490, size: 40,
  },
];

const EXTRA_NODES = [
  {
    id: "Projects",
    name: "项目",
    icon: "📋",
    path: "Projects",
    color: "#b8956e",
    cx: 780, cy: 160, size: 28,
  },
  {
    id: "Learning",
    name: "学习",
    icon: "📚",
    path: "Learning",
    color: "#7a9b8c",
    cx: 845, cy: 360, size: 26,
  },
  {
    id: "Logs",
    name: "日志",
    icon: "📝",
    path: "Logs",
    color: "#8b8b8b",
    cx: 740, cy: 560, size: 24,
  },
  {
    id: "Inbox",
    name: "收件箱",
    icon: "📥",
    path: "Inbox",
    color: "#a08aaa",
    cx: 215, cy: 380, size: 26,
  },
];

// Design-space dimensions (scaled to fit actual canvas)
const DESIGN_W = 1000;
const DESIGN_H = 700;

// ═══════════════════════════════════════════════════════════
// SEEDED RANDOM (for deterministic stone shapes)
// ═══════════════════════════════════════════════════════════

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════
// ZEN GARDEN CANVAS SCENE
// ═══════════════════════════════════════════════════════════

class ZenGardenScene {
  constructor(container, app) {
    this.app = app;
    this.container = container;
    this.animationId = null;
    this.hoveredStone = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Pre-generate stone shape points (deterministic)
    this._stoneShapes = {};
    this._buildAllStoneShapes();

    // Ripple animation state
    this._ripplePhase = 0;
    this._breathingRipples = []; // expanding rings

    this._init();
  }

  // ── Build irregular stone outlines ───────────────────────

  _buildStoneShape(seed, size, irregularity) {
    const rand = mulberry32(seed);
    const points = [];
    const vertexCount = 14 + Math.floor(rand() * 10);
    for (let i = 0; i < vertexCount; i++) {
      const angle = (i / vertexCount) * Math.PI * 2;
      const r = size * (0.72 + rand() * 0.56 * irregularity);
      // Flatten slightly on one axis for natural stone look
      const squash = 0.75 + 0.25 * Math.abs(Math.cos(angle));
      points.push({
        x: Math.cos(angle) * r * squash,
        y: Math.sin(angle) * r,
      });
    }
    return points;
  }

  _buildAllStoneShapes() {
    let seedBase = 1;
    for (const area of AREAS) {
      this._stoneShapes[area.id] = this._buildStoneShape(
        seedBase++, area.size, 0.7
      );
      // Subfolder moss patches
      this._stoneShapes[area.id + "_moss"] = area.subfolders.map((_, i) =>
        this._buildStoneShape(seedBase++ * 100 + i, area.size * 0.18, 0.9)
      );
    }
    for (const node of EXTRA_NODES) {
      this._stoneShapes[node.id] = this._buildStoneShape(
        seedBase++, node.size, 0.55
      );
    }
  }

  // ── Init ─────────────────────────────────────────────────

  _init() {
    // Create canvas
    this.canvas = document.createElement("canvas");
    this.canvas.className = "zen-garden-canvas";
    this.canvas.style.cssText =
      "display:block;width:100%;height:100%;cursor:default;";
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    // Interaction
    this._setupInteraction();

    // Resize
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    this._resize();

    // Spawn initial breathing ripples
    for (const area of AREAS) {
      this._breathingRipples.push({
        cx: area.cx,
        cy: area.cy,
        radius: 0,
        maxRadius: area.size * 2.8,
        speed: 0.15 + Math.random() * 0.2,
        opacity: 0.35,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Start animation
    this._animate();
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = rect.width;
    const h = rect.height;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;

    // Calculate scale to fit design space
    const scaleX = w / DESIGN_W;
    const scaleY = h / DESIGN_H;
    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = (w - DESIGN_W * this.scale) / 2;
    this.offsetY = (h - DESIGN_H * this.scale) / 2;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Drawing ──────────────────────────────────────────────

  _draw(time) {
    const ctx = this.ctx;
    const w = this.canvas.width / (Math.min(window.devicePixelRatio, 2));
    const h = this.canvas.height / (Math.min(window.devicePixelRatio, 2));

    // Clear
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Clip to design area
    ctx.beginPath();
    ctx.rect(0, 0, DESIGN_W, DESIGN_H);
    ctx.clip();

    // 1. Sand background
    this._drawSand(ctx, time);

    // 2. Raked sand ripples
    this._drawRipples(ctx, time);

    // 3. Connecting sand paths (subtle lines between stones)
    this._drawGardenPaths(ctx);

    // 4. Extra node stones (drawn behind main stones)
    for (const node of EXTRA_NODES) {
      this._drawStone(ctx, node, time);
      this._drawLabel(ctx, node, time);
    }

    // 5. Main area stones
    for (const area of AREAS) {
      this._drawStone(ctx, area, time);
      this._drawMoss(ctx, area, time);
      this._drawLabel(ctx, area, time);
    }

    // 6. Garden enclosure frame
    this._drawFrame(ctx, time);

    // 7. Floating sand particles
    this._drawParticles(ctx, time);

    ctx.restore();
  }

  // ── Sand Background ──────────────────────────────────────

  _drawSand(ctx, _time) {
    // Base sand
    const sandGrad = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
    sandGrad.addColorStop(0, "#f7f3ec");
    sandGrad.addColorStop(0.5, "#f5f0e8");
    sandGrad.addColorStop(1, "#f0eae0");
    ctx.fillStyle = sandGrad;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    // Subtle grain texture (sparse dots)
    ctx.fillStyle = "rgba(180,170,155,0.12)";
    const grainSeed = 42;
    const grainRand = mulberry32(grainSeed);
    for (let i = 0; i < 400; i++) {
      const gx = grainRand() * DESIGN_W;
      const gy = grainRand() * DESIGN_H;
      ctx.beginPath();
      ctx.arc(gx, gy, 0.6 + grainRand() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle vignette edges
    const vignette = ctx.createRadialGradient(
      DESIGN_W / 2, DESIGN_H / 2, DESIGN_W * 0.35,
      DESIGN_W / 2, DESIGN_H / 2, DESIGN_W * 0.75
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(120,100,70,0.08)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }

  // ── Raked Sand Ripples ──────────────────────────────────

  _drawRipples(ctx, time) {
    // Concentric ripples around each area stone
    const allStones = [...AREAS, ...EXTRA_NODES];

    for (const stone of allStones) {
      const cx = stone.cx;
      const cy = stone.cy;
      const maxR = stone.size * 3.5;

      // Draw multiple concentric rings with decreasing opacity
      const ringCount = 12;
      for (let i = 1; i <= ringCount; i++) {
        const baseR = stone.size * 0.8 + (i / ringCount) * (maxR - stone.size * 0.8);
        // Subtle breathing animation
        const breathe = Math.sin(time * 0.0004 + i * 0.5 + stone.cx * 0.01) * 1.5;
        const r = baseR + breathe;
        const alpha = 0.22 * (1 - i / ringCount) * (1 - i / ringCount);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180,168,148,${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.7 + (i % 3 === 0 ? 0.4 : 0);
        ctx.stroke();
      }

      // Animated expanding ripple (breathing out)
      for (const ripple of this._breathingRipples) {
        if (Math.abs(ripple.cx - cx) < 2 && Math.abs(ripple.cy - cy) < 2) {
          ripple.radius += ripple.speed * 0.06;
          if (ripple.radius > ripple.maxRadius) {
            ripple.radius = 0;
          }
          const progress = ripple.radius / ripple.maxRadius;
          const alpha = ripple.opacity * (1 - progress) * (1 - progress);
          ctx.beginPath();
          ctx.arc(cx, cy, ripple.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(160,145,125,${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }

    // Garden-wide raking lines (horizontal-ish, slight wave)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#b0a590";
    ctx.lineWidth = 0.5;
    const lineSpacing = 8;
    for (let y = lineSpacing; y < DESIGN_H; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < DESIGN_W; x += 20) {
        // Gentle wave around stones
        const wave = Math.sin(x * 0.008 + time * 0.0001 + y * 0.02) * 2.5;
        ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Sand Garden Paths ────────────────────────────────────

  _drawGardenPaths(ctx) {
    // Subtle raked paths connecting central area to each main stone
    const centerX = DESIGN_W / 2;
    const centerY = DESIGN_H / 2;

    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "#c4b8a5";
    ctx.lineWidth = 14;

    for (const area of AREAS) {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      // Slightly curved path
      const midX = (centerX + area.cx) / 2 + (area.cy - centerY) * 0.15;
      const midY = (centerY + area.cy) / 2 + (centerX - area.cx) * 0.1;
      ctx.quadraticCurveTo(midX, midY, area.cx, area.cy);
      ctx.stroke();
    }
    ctx.restore();

    // Center empty circle (ma / negative space)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 28, 0, Math.PI * 2);
    ctx.fillStyle = "#f2ece2";
    ctx.fill();
    ctx.strokeStyle = "rgba(170,158,138,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ── Stone Drawing ────────────────────────────────────────

  _drawStone(ctx, stone, _time) {
    const shapes = this._stoneShapes[stone.id];
    if (!shapes) return;

    const cx = stone.cx;
    const cy = stone.cy;

    // Stone shadow (offset slightly)
    ctx.save();
    ctx.translate(cx + 3, cy + 3);
    ctx.beginPath();
    ctx.moveTo(shapes[0].x, shapes[0].y);
    for (let i = 1; i < shapes.length; i++) {
      ctx.lineTo(shapes[i].x, shapes[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(140,125,105,0.25)";
    ctx.fill();
    ctx.restore();

    // Stone body with gradient
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(shapes[0].x, shapes[0].y);
    for (let i = 1; i < shapes.length; i++) {
      ctx.lineTo(shapes[i].x, shapes[i].y);
    }
    ctx.closePath();

    // Stone gradient (lit from top-left)
    const grad = ctx.createLinearGradient(
      -stone.size, -stone.size,
      stone.size, stone.size
    );
    grad.addColorStop(0, this._lightenColor(stone.color, 20));
    grad.addColorStop(0.5, stone.color);
    grad.addColorStop(1, this._darkenColor(stone.color, 25));
    ctx.fillStyle = grad;
    ctx.fill();

    // Stone edge (ink outline)
    ctx.strokeStyle = "rgba(70,55,40,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Highlight on top-left edge
    ctx.beginPath();
    ctx.moveTo(shapes[0].x, shapes[0].y);
    for (let i = 1; i < Math.floor(shapes.length * 0.35); i++) {
      ctx.lineTo(shapes[i].x, shapes[i].y);
    }
    ctx.strokeStyle = "rgba(255,250,240,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Store hit-test center and radius
    stone._hitR = stone.size * 0.85;
  }

  // ── Moss Patches (subfolders) ────────────────────────────

  _drawMoss(ctx, area, time) {
    const mossShapes = this._stoneShapes[area.id + "_moss"];
    if (!mossShapes || mossShapes.length === 0) return;

    const subfolders = area.subfolders;

    for (let i = 0; i < mossShapes.length; i++) {
      const shape = mossShapes[i];
      // Position moss near the stone
      const angle = (i / mossShapes.length) * Math.PI * 2 + 0.4;
      const dist = area.size * 0.85;
      const mx = area.cx + Math.cos(angle) * dist;
      const my = area.cy + Math.sin(angle) * dist;

      ctx.save();
      ctx.translate(mx, my);

      // Moss body
      ctx.beginPath();
      ctx.moveTo(shape[0].x, shape[0].y);
      for (let j = 1; j < shape.length; j++) {
        ctx.lineTo(shape[j].x, shape[j].y);
      }
      ctx.closePath();

      const mossGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, area.size * 0.2);
      mossGrad.addColorStop(0, area.mossColor);
      mossGrad.addColorStop(1, this._darkenColor(area.mossColor, 20));
      ctx.fillStyle = mossGrad;
      ctx.fill();

      // Soft edge
      ctx.strokeStyle = "rgba(60,80,40,0.2)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Subtle moss texture dots
      ctx.fillStyle = "rgba(100,140,80,0.25)";
      const dotRand = mulberry32(i * 37 + area.cx);
      for (let d = 0; d < 4; d++) {
        const dx = (dotRand() - 0.5) * area.size * 0.2;
        const dy = (dotRand() - 0.5) * area.size * 0.2;
        ctx.beginPath();
        ctx.arc(dx, dy, 1.5 + dotRand() * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Store subfolder name for hit testing
      if (subfolders[i]) {
        ctx.restore();
        ctx.save();
        ctx.translate(mx, my);
        // Store hit area data on a hidden property
        this._subHitAreas = this._subHitAreas || [];
        this._subHitAreas.push({
          cx: mx, cy: my, r: area.size * 0.16,
          areaId: area.id,
          subName: subfolders[i],
        });
        ctx.restore();
        ctx.save();
      }

      ctx.restore();
    }
  }

  // ── Calligraphy Labels ───────────────────────────────────

  _drawLabel(ctx, stone, _time) {
    const cx = stone.cx;
    const cy = stone.cy + stone.size * 0.7 + 18;

    // Name
    ctx.font = "bold 15px Georgia, 'Noto Serif SC', 'KaiTi', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Ink-wash shadow
    ctx.fillStyle = "rgba(200,185,165,0.4)";
    ctx.fillText(stone.name, cx + 0.5, cy + 0.5);

    // Main text
    ctx.fillStyle = "#4a3728";
    ctx.fillText(stone.name, cx, cy);

    // Icon above name
    ctx.font = "18px serif";
    ctx.fillText(stone.icon, cx, cy - 24);

    // Subtle red seal / hanko dot for extra nodes
    if (stone.size < 32) {
      ctx.beginPath();
      ctx.arc(cx + stone.size * 0.55, cy - 8, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(180,80,60,0.5)";
      ctx.fill();
    }

    // Store label position for hit testing
    stone._labelY = cy;
  }

  // ── Garden Frame ─────────────────────────────────────────

  _drawFrame(ctx, _time) {
    const margin = 12;
    const alpha = 0.18;

    // Outer border (thin, like a tatami edge)
    ctx.strokeStyle = `rgba(139,115,85,${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(margin, margin, DESIGN_W - margin * 2, DESIGN_H - margin * 2);

    // Inner border
    ctx.strokeStyle = `rgba(180,160,135,${alpha * 0.7})`;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(margin + 8, margin + 8, DESIGN_W - (margin + 8) * 2, DESIGN_H - (margin + 8) * 2);

    // Corner accents (simple L-shapes)
    const cornerLen = 24;
    const cm = margin + 4;
    ctx.strokeStyle = `rgba(139,115,85,${(alpha * 0.6).toFixed(3)})`;
    ctx.lineWidth = 1;
    [
      [cm, cm], // top-left
      [DESIGN_W - cm, cm], // top-right
      [cm, DESIGN_H - cm], // bottom-left
      [DESIGN_W - cm, DESIGN_H - cm], // bottom-right
    ].forEach(([cx, cy]) => {
      const dx = cx < DESIGN_W / 2 ? 1 : -1;
      const dy = cy < DESIGN_H / 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx, cy + cornerLen * dy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + cornerLen * dx, cy);
      ctx.stroke();
    });
  }

  // ── Floating Sand Particles ──────────────────────────────

  _drawParticles(ctx, time) {
    if (!this._particles) {
      this._particles = [];
      const pRand = mulberry32(777);
      for (let i = 0; i < 60; i++) {
        this._particles.push({
          x: pRand() * DESIGN_W,
          y: pRand() * DESIGN_H,
          r: 0.6 + pRand() * 1.4,
          speed: 0.08 + pRand() * 0.25,
          phase: pRand() * Math.PI * 2,
          amp: 0.3 + pRand() * 1.2,
        });
      }
    }

    ctx.fillStyle = "rgba(190,175,150,0.25)";
    for (const p of this._particles) {
      const py = p.y + Math.sin(time * 0.0005 + p.phase) * p.amp;
      const px = p.x + Math.cos(time * 0.0004 + p.phase) * p.amp * 0.6;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Interaction ──────────────────────────────────────────

  _setupInteraction() {
    this.canvas.addEventListener("mousemove", (e) => {
      const pos = this._eventToDesign(e);
      const hit = this._hitTest(pos.x, pos.y);
      if (hit !== this.hoveredStone) {
        this.hoveredStone = hit;
        this.canvas.style.cursor = hit ? "pointer" : "default";
        // Redraw for hover effect
        this._draw(this._lastTime || Date.now());
      }
    });

    this.canvas.addEventListener("click", (e) => {
      const pos = this._eventToDesign(e);
      const hit = this._hitTest(pos.x, pos.y);
      if (hit) {
        this._navigateTo(hit);
      }
    });

    // Touch support
    this.canvas.addEventListener("touchend", (e) => {
      if (e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const pos = this._eventToDesign(touch);
        const hit = this._hitTest(pos.x, pos.y);
        if (hit) {
          this._navigateTo(hit);
        }
      }
    });
  }

  _eventToDesign(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.offsetX) / this.scale,
      y: (e.clientY - rect.top - this.offsetY) / this.scale,
    };
  }

  _hitTest(x, y) {
    // Check main area stones
    for (const area of AREAS) {
      const dx = x - area.cx;
      const dy = y - area.cy;
      if (Math.sqrt(dx * dx + dy * dy) < area.size * 0.9) {
        return { type: "area", path: area.path };
      }
    }

    // Check extra nodes
    for (const node of EXTRA_NODES) {
      const dx = x - node.cx;
      const dy = y - node.cy;
      if (Math.sqrt(dx * dx + dy * dy) < node.size * 0.9) {
        return { type: "area", path: node.path };
      }
    }

    // Check subfolder moss patches
    if (this._subHitAreas) {
      for (const sub of this._subHitAreas) {
        const dx = x - sub.cx;
        const dy = y - sub.cy;
        if (Math.sqrt(dx * dx + dy * dy) < sub.r) {
          const area = AREAS.find((a) => a.id === sub.areaId);
          if (area) {
            return {
              type: "sub",
              path: area.path + "/" + sub.subName,
            };
          }
        }
      }
    }

    return null;
  }

  _navigateTo(hit) {
    if (!hit.path || !this.app) return;

    const abstractFile = this.app.vault.getAbstractFileByPath(hit.path);
    if (!abstractFile) return;

    const fileExplorer =
      this.app.internalPlugins?.getPluginById("file-explorer");
    if (fileExplorer?.enabled) {
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

  // ── Animation Loop ───────────────────────────────────────

  _animate() {
    this.animationId = requestAnimationFrame(() => this._animate());
    const time = Date.now();
    this._lastTime = time;
    this._draw(time);
  }

  // ── Cleanup ──────────────────────────────────────────────

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this._onResize);
    if (this.canvas) {
      this.canvas.remove();
    }
    this._breathingRipples = [];
    this._subHitAreas = [];
    this._particles = null;
    this._stoneShapes = {};
  }

  // ── Color Helpers ────────────────────────────────────────

  _lightenColor(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00ff) + percent);
    const b = Math.min(255, (num & 0x0000ff) + percent);
    return `rgb(${r},${g},${b})`;
  }

  _darkenColor(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, (num >> 16) - percent);
    const g = Math.max(0, ((num >> 8) & 0x00ff) - percent);
    const b = Math.max(0, (num & 0x0000ff) - percent);
    return `rgb(${r},${g},${b})`;
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
    return "Atlas · 枯山水";
  }

  getIcon() {
    return "globe";
  }

  async onOpen() {
    const container =
      this.leaf.view.containerEl.children[1] ||
      this.leaf.view.containerEl;
    container.empty();
    container.addClass("atlas-homepage-container");

    // Loading overlay
    const loadingEl = container.createDiv("atlas-homepage-loading");
    loadingEl.createDiv("loading-zen-circle");
    loadingEl.createDiv("loading-text").setText("枯山水を描いている...");

    try {
      // Create the zen garden scene (no Three.js needed!)
      this.scene = new ZenGardenScene(container, this.plugin.app);

      // Fade out loading
      loadingEl.addClass("hidden");
      setTimeout(() => loadingEl.remove(), 600);

      // Info overlay
      const infoEl = container.createDiv("atlas-homepage-info");
      infoEl.setText("点击庭石 · 探索你的知识园林");

      // Stats bar
      this._createStatsBar(container);
    } catch (err) {
      loadingEl.querySelector(".loading-text")?.setText(
        "加载失败，请重试"
      );
      console.error("[Atlas Homepage] Failed to load:", err);
    }
  }

  async _createStatsBar(container) {
    const statsEl = container.createDiv("atlas-homepage-stats");

    try {
      const counts = {};
      for (const area of AREAS) {
        const files = this.plugin.app.vault
          .getFiles()
          .filter(
            (f) => f.path.startsWith(area.path) && f.extension === "md"
          );
        counts[area.id] = files.length;
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const statItems = [
        { label: "笔记", value: total.toString(), color: "#8b7355" },
        { label: "庭石", value: AREAS.length.toString(), color: "#a09080" },
        ...AREAS.map((a) => ({
          label: a.ename,
          value: (counts[a.id] || 0).toString(),
          color: a.color,
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
    this.registerView(VIEW_TYPE, (leaf) => new AtlasHomepageView(leaf, this));

    this.addRibbonIcon("globe", "打开 Atlas 枯山水", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-atlas-homepage",
      name: "打开 Atlas 枯山水",
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
