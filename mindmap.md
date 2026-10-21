# Creative Idea Mindmap — Specification & AI Guide (`mindmap.md`)

> **Concept**: An autonomous 3D capability and idea mindmap designed for creative projects, hardware builds, and software ideas. 
> Every node is backed by an individual, human-and-agent-readable **local Markdown file** (`ideas/<id>.md`) containing YAML frontmatter, a Bill of Materials (BOM), tags, and connections.
> An integrated AI agent with Model Context Protocol (MCP) tools automatically categorizes incoming ideas, identifies cross-project hardware similarities, and provides bulk-purchasing recommendations.

---

## 1. Markdown File Format (`ideas/<id>.md`)

Every idea or project is stored as a standalone Markdown file with structured YAML frontmatter:

```markdown
---
id: smart-solder-fume-extractor
title: Smart Solder Fume Extractor
category: Hardware & Electronics
status: prototyping # concept | prototyping | in-progress | completed | archived
tags:
  - esp32
  - soldering
  - workshop
  - 3d-printing
description: Automated whisper-quiet bench fume extractor with VOC air sensor and PWM fan control.
bom:
  - item: ESP32-WROOM-32 Dev Board
    qty: 1
    notes: PWM fan curve and SGP40 reading
  - item: Noctua NF-F12 120mm 12V PWM Fan
    qty: 1
    notes: High static pressure, silent operation
  - item: Activated Carbon Filter Sheet
    qty: 1
    notes: Cut to 120mm square cartridge
connections:
  - target: desktop-reflow-plate
    relation: shared_bom
    notes: Both need Noctua 12V fans and 12V/24V power circuits.
    shared_parts:
      - Noctua NF-F12 120mm 12V PWM Fan
  - target: smart-workbench-bench
    relation: synergy
    notes: Mounts directly to articulated workbench arm.
created_at: '2026-10-21T03:00:00'
updated_at: '2026-10-21T03:00:00'
---

# Smart Solder Fume Extractor

## Concept & Requirements
A compact, desktop soldering fume extractor that automatically detects rosin flux smoke and spins up quietly without needing manual button presses.

### Key Features
- **Automatic Smoke Trigger**: Uses an SGP40 VOC sensor next to the intake grille to detect flux aerosol spikes.
- **Whisper-Quiet Mode**: Uses a Noctua 120mm PWM fan running at 40% idle, boosting to 100% only when soldering.
- **Replaceable Filter Tray**: 3D printed magnetic filter cassette for quick replacement of activated carbon foam.
```

---

## 2. Cross-Project Bill of Materials (BOM) & Bulk-Buy Synergies

One of the primary superpowers of the Mindmap is **Cross-Project BOM Aggregation**:
- Whenever projects share common hardware components (e.g. `RP2040-Zero`, `Noctua NF-F12`, `Neodymium Magnets 6x3mm`, `WS2812B LEDs`), the system establishes `shared_bom` edges.
- The **Consolidated BOM Sourcing Modal** aggregates all required components, counts total units needed across all active projects, and highlights bulk-buy opportunities so parts can be ordered together economically.

---

## 3. Model Context Protocol (MCP) Server (`idea-mindmap`)

The project includes a full JSON-RPC stdio MCP server (`mcp/mindmap_mcp_server.py`) exposing 10 agentic tools:

1. `mindmap_list_ideas`: Search and filter ideas by category, development status, or query.
2. `mindmap_get_idea`: Read complete Markdown file, frontmatter metadata, BOM items, and connections.
3. `mindmap_add_idea`: Create a new project note with frontmatter, BOM, and markdown body. Auto-creates category if new.
4. `mindmap_update_idea`: Modify title, category, status, BOM items, or markdown notes.
5. `mindmap_link_ideas`: Connect two projects (`shared_bom`, `synergy`, `depends_on`, `subproject`, `related`).
6. `mindmap_find_similarities`: Semantic & hardware similarity scanner to find synergies.
7. `mindmap_analyze_bom`: Cross-project BOM aggregator with bulk-buy recommendations.
8. `mindmap_fuse_ideas`: Merge two overlapping ideas into one consolidated project, combining BOM and notes.
9. `mindmap_split_idea`: Split a large project into modular sub-projects.
10. `mindmap_get_graph_stats`: Summary metrics of total ideas, categories, and connection density.

---

## 4. Running the Application

To launch the server on port 8766:

```bash
cd /home/rec0il/Dokumente/Scritps/Idea_Mindmap
python3 run.py
```

Then open your browser at:
`http://localhost:8766`
