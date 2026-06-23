# Atlas Homepage · 手绘人生地图

A custom Obsidian homepage plugin for the **Atlas** vault. Renders a Three.js 3D scene with a hand-drawn / sketch aesthetic — turning your PARA-structured knowledge base into an interactive floating map of paper-crafted islands.

## 🎨 Design Philosophy

This plugin visualizes the vault's **Areas** as hand-drawn islands on a paper-textured map:

| Area | 中文 | Visual |
|------|------|--------|
| Fun | 乐趣 | 🎨 Coral floating platform with sub-blocks (Eureka, Experience, Movies, Serendipities) |
| Health | 健康 | 💚 Green platform (Books, Eureka, Serendipities) |
| Work | 工作 | 💼 Purple platform (Language, SideHustle, SoftSkill, Technical) |
| Love | 爱与家 | 💕 Pink platform (Experience, Workshops) |
| People | 人物 | 👥 Sky-blue platform |

Plus outer ring nodes for: **Projects** 📋, **Learning** 📚, **Logs** 📝, **Inbox** 📥

## 🖌️ Hand-Drawn Aesthetics

- **Paper texture**: Procedurally generated grain + fiber texture background
- **Sketchy outlines**: Double-pass edge rendering with offset for "sketched twice" look
- **Cel shading**: Flat toon materials for illustration feel
- **Wobbly borders**: Random positional jitter on grid dots and connecting lines
- **Floating animation**: Gentle bobbing motion with per-island phase offset
- **Dust particles**: Floating motes in warm sepia tones
- **Warm palette**: Ink-wash / watercolor inspired colors

## 🎮 Interaction

- **Click** an island → navigates to that folder in Obsidian's file explorer
- **Drag** to orbit the camera around the map
- **Scroll** to zoom in/out
- **Auto-rotate** after 3 seconds of inactivity

## 📁 File Structure

```
atlas-homepage/
├── manifest.json    # Plugin metadata
├── main.js          # Three.js scene + Obsidian plugin
├── styles.css       # UI styling
└── README.md        # This file
```

## 🔧 Installation

The plugin is installed at `.obsidian/plugins/atlas-homepage/` in the Atlas vault. Enable it in **Settings → Community plugins** (or via the plugin list).

## 🏗️ Architecture

```
AtlasHomepagePlugin (Obsidian Plugin)
├── Registers VIEW_TYPE "atlas-homepage-view"
├── Ribbon icon + command to open
└── AtlasHomepageView (ItemView)
    └── LifeMapScene (Three.js 3D Scene)
        ├── SketchOrbitControls (custom orbit + wobble)
        ├── Paper ground + grid dots
        ├── 5 Area islands (box geo + edge outlines + sub-blocks + labels)
        ├── 4 Extra nodes (cylinder platforms + labels)
        ├── Connecting lines (wobbly bezier curves)
        ├── Floating particles (dust motes)
        ├── Compass rose (center marker)
        └── Raycaster interaction (click → navigate)
```

## 🔗 Dependencies

- **Three.js r148** — loaded from jsDelivr CDN at runtime
- No build step required

## 🚀 Future Ideas

- [ ] Show recent notes as floating cards around each island
- [ ] Day/night lighting based on actual time
- [ ] Weather effects (rain particles from Logs activity)
- [ ] Note count indicators on each island
- [ ] Drag-and-drop notes between islands
- [ ] Integrate with Obsidian Canvas for custom layouts
# atlas-homepage
