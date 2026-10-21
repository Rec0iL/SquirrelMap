# 🐿️ SquirrelMap — 3D Idea Mindmap & Sourcing Graph

> **Stash your ideas, connect your hardware, and bulk-buy your parts.**  
> SquirrelMap is an interactive 3D capability & project mindmap where every idea is backed by an individual, human-and-agent-readable **local Markdown file** (`ideas/<id>.md`) with YAML frontmatter, Bill of Materials (BOM), and relationship links.

---

## 🌟 Highlights

- **🐿️ Stash Ideas Easily**: Enter a rough thought or speak with the agent; SquirrelMap automatically categorizes your idea, extracts or estimates required hardware components, and creates a local Markdown file.
- **🛒 Cross-Project BOM Sourcing**: Identifies common parts across your builds (e.g. RP2040 microcontrollers, Noctua fans, Neodymium magnets) and computes consolidated bulk-buy recommendations so you can order hardware efficiently.
- **📝 Markdown Source of Truth**: Each idea is stored as a clean `.md` file in `ideas/`. Edit notes directly in the Web UI using the built-in Markdown editor with live preview, or edit externally in Obsidian / VSCode.
- **🤖 Autonomous MCP Agent**: Connects via Model Context Protocol (`squirrelmap`) to Antigravity / Gemini models without requiring any API keys.

---

## 🚀 Quick Launch

### From Desktop Menu
Search for **SquirrelMap** in your KDE Plasma Start / Kickoff menu or KRunner (`Alt+Space`).

### From Terminal
```bash
/home/rec0il/Dokumente/Scritps/SquirrelMap/launch.sh
```

### Direct Server
```bash
cd /home/rec0il/Dokumente/Scritps/SquirrelMap
python3 run.py
```
Open **`http://localhost:8766`** in your browser.

---

## 🛠️ MCP Agent Tools (`squirrelmap`)

| Tool | Description |
| :--- | :--- |
| `mindmap_add_idea` | Stash a new project with auto-categorization and BOM indexing |
| `mindmap_get_idea` | Read complete Markdown notes, frontmatter, BOM, and links |
| `mindmap_update_idea` | Update notes, BOM items, tags, category, or status |
| `mindmap_list_ideas` | Filter stashed ideas by category, status, or search query |
| `mindmap_link_ideas` | Connect projects (`shared_bom`, `synergy`, `depends_on`, `subproject`) |
| `mindmap_find_similarities`| Scan for hardware overlap and creative synergies |
| `mindmap_analyze_bom` | Cross-project BOM aggregator with bulk-buy recommendations |
| `mindmap_fuse_ideas` | Merge two overlapping ideas into one consolidated project |
| `mindmap_split_idea` | Split a complex project into modular sub-projects |
| `mindmap_get_graph_stats`| Summary stats of ideas, categories, and connection density |
