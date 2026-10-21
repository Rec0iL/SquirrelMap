import os
import re
import yaml
import json
import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.models import IdeaNode, IdeaEdge, BOMItem, AggregatedBOMItem, BOMProjectUsage, BOMSummary

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

DATA_DIR = os.environ.get("SQUIRRELMAP_DATA_DIR")
if DATA_DIR:
    os.makedirs(DATA_DIR, exist_ok=True)
    IDEAS_DIR = os.path.join(DATA_DIR, "ideas")
    DB_PATH = os.path.join(DATA_DIR, "mindmap.db")
else:
    IDEAS_DIR = os.path.join(PROJECT_ROOT, "ideas")
    DB_PATH = os.path.join(SCRIPT_DIR, "mindmap.db")

os.makedirs(IDEAS_DIR, exist_ok=True)

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        description TEXT,
        content_markdown TEXT,
        tags TEXT,
        bom_json TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 0.5,
        relation_type TEXT NOT NULL DEFAULT 'synergy',
        description TEXT,
        shared_parts TEXT,
        UNIQUE(source, target)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    conn.commit()
    conn.close()

    # Mark seeded if existing markdown files are present
    if os.path.exists(IDEAS_DIR) and any(f.endswith(".md") for f in os.listdir(IDEAS_DIR)):
        mark_as_seeded()

    # Sync from markdown files on disk
    sync_from_markdown_files()

def parse_markdown_file(file_path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            raw = f.read()

        frontmatter_data = {}
        body = raw

        # Check for YAML frontmatter
        if raw.startswith("---"):
            parts = re.split(r"^---\s*$", raw, maxsplit=2, flags=re.MULTILINE)
            if len(parts) >= 3:
                frontmatter_str = parts[1]
                body = parts[2].lstrip()
                frontmatter_data = yaml.safe_load(frontmatter_str) or {}

        # Fallback ID from filename if missing
        file_id = os.path.splitext(os.path.basename(file_path))[0]
        idea_id = frontmatter_data.get("id", file_id)

        title = frontmatter_data.get("title") or frontmatter_data.get("name")
        if not title:
            heading_match = re.search(r"^#\s+(.+)$", body, flags=re.MULTILINE)
            title = heading_match.group(1).strip() if heading_match else idea_id.replace("-", " ").title()

        category = frontmatter_data.get("category", "General")
        raw_status = frontmatter_data.get("status", "concept")
        status_str = str(raw_status).strip().lower() if raw_status else "concept"
        if status_str in ["idea", "draft", "planned", "backlog", "new"]:
            status = "concept"
        elif status_str in ["active", "wip", "progress", "building"]:
            status = "in-progress"
        elif status_str in ["done", "finished"]:
            status = "completed"
        elif status_str in ["concept", "prototyping", "in-progress", "completed", "archived"]:
            status = status_str
        else:
            status = "concept"
        tags = frontmatter_data.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        raw_bom = frontmatter_data.get("bom", [])
        bom_items = []
        if isinstance(raw_bom, list):
            for b in raw_bom:
                if isinstance(b, dict) and "item" in b:
                    bom_items.append({
                        "item": str(b["item"]).strip(),
                        "qty": int(b.get("qty", 1)),
                        "notes": str(b.get("notes", "")),
                        "link": str(b.get("link", ""))
                    })
                elif isinstance(b, str) and b.strip():
                    bom_items.append({"item": b.strip(), "qty": 1, "notes": "", "link": ""})

        # Also extract BOM table if body contains markdown table under ## BOM
        if not bom_items and "## BOM" in body:
            bom_section = body.split("## BOM")[1].split("##")[0]
            for line in bom_section.split("\n"):
                if "|" in line and not line.strip().startswith("| ---") and not line.strip().lower().startswith("| item") and not line.strip().lower().startswith("| teil"):
                    cols = [c.strip() for c in line.split("|") if c.strip()]
                    if cols:
                        item_name = cols[0]
                        notes = cols[1] if len(cols) > 1 else ""
                        bom_items.append({"item": item_name, "qty": 1, "notes": notes, "link": ""})

        connections = frontmatter_data.get("connections", [])

        description = frontmatter_data.get("description", "")
        if not description:
            paragraphs = [p.strip() for p in body.split("\n\n") if p.strip() and not p.strip().startswith("#")]
            description = paragraphs[0][:200] if paragraphs else ""

        created_at = frontmatter_data.get("created_at", datetime.now().isoformat())
        updated_at = frontmatter_data.get("updated_at", datetime.now().isoformat())

        return {
            "id": idea_id,
            "title": title,
            "category": category,
            "status": status,
            "description": description,
            "content_markdown": body,
            "tags": tags,
            "bom": bom_items,
            "connections": connections,
            "created_at": created_at,
            "updated_at": updated_at
        }
    except Exception as e:
        print(f"Error parsing markdown file {file_path}: {e}")
        return None


def parse_markdown_string(raw: str, default_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Parses raw markdown content with frontmatter into an idea dictionary."""
    try:
        frontmatter_data = {}
        body = raw

        if "---" in raw:
            parts = re.split(r"^---\s*$", raw, maxsplit=2, flags=re.MULTILINE)
            if len(parts) >= 3:
                frontmatter_str = parts[1]
                body = parts[2].lstrip()
                frontmatter_data = yaml.safe_load(frontmatter_str) or {}
            elif len(parts) == 2:
                frontmatter_data = yaml.safe_load(parts[1]) or {}

        title = frontmatter_data.get("title") or frontmatter_data.get("name")
        if not title:
            heading_match = re.search(r"^#\s+(.+)$", body, flags=re.MULTILINE)
            title = heading_match.group(1).strip() if heading_match else (default_id or "New Project")

        slug = re.sub(r"[^a-zA-Z0-9]+", "-", title.lower()).strip("-")
        idea_id = frontmatter_data.get("id") or default_id or slug or "new-project"

        category = frontmatter_data.get("category", "General")
        raw_status = frontmatter_data.get("status", "concept")
        status_str = str(raw_status).strip().lower() if raw_status else "concept"
        if status_str in ["idea", "draft", "planned", "backlog", "new"]:
            status = "concept"
        elif status_str in ["active", "wip", "progress", "building"]:
            status = "in-progress"
        elif status_str in ["done", "finished"]:
            status = "completed"
        elif status_str in ["concept", "prototyping", "in-progress", "completed", "archived"]:
            status = status_str
        else:
            status = "concept"

        tags = frontmatter_data.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        raw_bom = frontmatter_data.get("bom", [])
        bom_items = []
        if isinstance(raw_bom, list):
            for b in raw_bom:
                if isinstance(b, dict) and "item" in b:
                    bom_items.append({
                        "item": str(b["item"]).strip(),
                        "qty": int(b.get("qty", 1)),
                        "notes": str(b.get("notes", "")),
                        "link": str(b.get("link", ""))
                    })
                elif isinstance(b, str) and b.strip():
                    bom_items.append({"item": b.strip(), "qty": 1, "notes": "", "link": ""})

        # Also extract BOM table if body contains markdown table under ## BOM
        if not bom_items and "## BOM" in body:
            bom_section = body.split("## BOM")[1].split("##")[0]
            for line in bom_section.split("\n"):
                if "|" in line and not line.strip().startswith("| ---") and not line.strip().lower().startswith("| item") and not line.strip().lower().startswith("| teil"):
                    cols = [c.strip() for c in line.split("|") if c.strip()]
                    if cols:
                        item_name = cols[0]
                        notes = cols[1] if len(cols) > 1 else ""
                        bom_items.append({"item": item_name, "qty": 1, "notes": notes, "link": ""})

        connections = frontmatter_data.get("connections", [])
        description = frontmatter_data.get("description", "")
        if not description:
            paragraphs = [p.strip() for p in body.split("\n\n") if p.strip() and not p.strip().startswith("#")]
            description = paragraphs[0][:200] if paragraphs else ""

        return {
            "id": idea_id,
            "title": title,
            "category": category,
            "status": status,
            "description": description,
            "content_markdown": body,
            "tags": tags,
            "bom": bom_items,
            "connections": connections,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"Error parsing markdown string: {e}")
        return None

def extract_idea_from_text(text: str) -> Optional[Dict[str, Any]]:
    """Extracts and parses frontmatter project block from an assistant message if present."""
    match = re.search(r"(---\s*\n\s*title:.+?\n---\s*\n.*)", text, re.DOTALL)
    if not match:
        match = re.search(r"```(?:markdown)?\s*\n(---\s*\n\s*title:.+?\n---\s*\n.*?)```", text, re.DOTALL)
    if match:
        raw_block = match.group(1).strip()
        return parse_markdown_string(raw_block)
    return None

def remove_connection_from_markdown_file(source_id: str, target_id: str):
    """Removes any connection from source_id to target_id from the markdown file on disk."""
    file_path = os.path.join(IDEAS_DIR, f"{source_id}.md")
    if not os.path.exists(file_path):
        return
    data = parse_markdown_file(file_path)
    if not data:
        return
    conns = data.get("connections", [])
    new_conns = [c for c in conns if isinstance(c, dict) and c.get("target") != target_id]
    if len(new_conns) != len(conns):
        idea = IdeaNode(
            id=data["id"],
            title=data["title"],
            name=data["title"],
            category=data["category"],
            status=data["status"],
            description=data["description"],
            content_markdown=data["content_markdown"],
            tags=data["tags"],
            bom=[BOMItem(**b) for b in data["bom"]],
            created_at=data["created_at"],
            updated_at=datetime.now().isoformat()
        )
        write_markdown_file(idea, connections=new_conns)

def write_markdown_file(idea: IdeaNode, connections: Optional[List[Dict[str, Any]]] = None) -> str:
    file_path = os.path.join(IDEAS_DIR, f"{idea.id}.md")
    now = datetime.now().isoformat()
    created_at = idea.created_at or now
    updated_at = now

    frontmatter = {
        "id": idea.id,
        "title": idea.title or idea.name or idea.id,
        "category": idea.category or "General",
        "status": idea.status or "concept",
        "tags": idea.tags or [],
        "created_at": created_at,
        "updated_at": updated_at,
    }

    if idea.description:
        frontmatter["description"] = idea.description

    if idea.bom:
        frontmatter["bom"] = [b.model_dump() for b in idea.bom]

    if connections is not None:
        if len(connections) > 0:
            frontmatter["connections"] = connections
    else:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT target, relation_type, description, shared_parts FROM edges WHERE source = ?", (idea.id,))
        rows = cursor.fetchall()
        conn.close()
        existing_conns = []
        for r in rows:
            parts = json.loads(r["shared_parts"] or "[]")
            item = {
                "target": r["target"],
                "relation": r["relation_type"],
                "notes": r["description"] or ""
            }
            if parts:
                item["shared_parts"] = parts
            existing_conns.append(item)
        if existing_conns:
            frontmatter["connections"] = existing_conns

    yaml_text = yaml.dump(frontmatter, sort_keys=False, allow_unicode=True)

    body = idea.content_markdown or f"# {idea.title}\n\n{idea.description}\n"
    if not body.strip().startswith("#"):
        body = f"# {idea.title}\n\n" + body

    full_content = f"---\n{yaml_text}---\n\n{body}\n"

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(full_content)

    return file_path

def is_already_seeded() -> bool:
    marker_path = os.path.join(IDEAS_DIR, ".seeded")
    if os.path.exists(marker_path):
        return True
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
        cursor.execute("SELECT value FROM meta WHERE key = 'has_seeded_defaults'")
        row = cursor.fetchone()
        conn.close()
        return bool(row and row[0] == 'true')
    except Exception:
        return False

def mark_as_seeded():
    try:
        marker_path = os.path.join(IDEAS_DIR, ".seeded")
        if not os.path.exists(marker_path):
            with open(marker_path, "w", encoding="utf-8") as f:
                f.write("seeded=true\n")
    except Exception:
        pass
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
        cursor.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('has_seeded_defaults', 'true')")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error marking as seeded: {e}")

def sync_from_markdown_files():
    """Reads all .md files in ideas/ and updates SQLite database."""
    if not os.path.exists(IDEAS_DIR):
        os.makedirs(IDEAS_DIR, exist_ok=True)

    md_files = [os.path.join(IDEAS_DIR, f) for f in os.listdir(IDEAS_DIR) if f.endswith(".md")]

    # Only seed default example ideas ONCE on brand new installation.
    # Never recreate examples when the user intentionally deletes all nodes!
    if len(md_files) == 0 and not is_already_seeded():
        seed_default_ideas()
        mark_as_seeded()
        md_files = [os.path.join(IDEAS_DIR, f) for f in os.listdir(IDEAS_DIR) if f.endswith(".md")]

    conn = get_connection()
    cursor = conn.cursor()

    parsed_ideas = []
    edges_to_insert = []

    for file_path in md_files:
        data = parse_markdown_file(file_path)
        if data:
            parsed_ideas.append(data)
            for c in data.get("connections", []):
                if isinstance(c, dict) and "target" in c:
                    edges_to_insert.append({
                        "source": data["id"],
                        "target": c["target"],
                        "weight": float(c.get("weight", 0.6)),
                        "relation_type": c.get("relation", c.get("relation_type", "synergy")),
                        "description": c.get("notes", c.get("description", "")),
                        "shared_parts": c.get("shared_parts", [])
                    })

    for item in parsed_ideas:
        cursor.execute("""
        INSERT INTO ideas (id, title, category, status, description, content_markdown, tags, bom_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title=excluded.title,
            category=excluded.category,
            status=excluded.status,
            description=excluded.description,
            content_markdown=excluded.content_markdown,
            tags=excluded.tags,
            bom_json=excluded.bom_json,
            updated_at=excluded.updated_at
        """, (
            item["id"],
            item["title"],
            item["category"],
            item["status"],
            item["description"],
            item["content_markdown"],
            json.dumps(item["tags"]),
            json.dumps(item["bom"]),
            item["created_at"],
            item["updated_at"]
        ))

    valid_ids = {item["id"] for item in parsed_ideas}

    # Only insert edges connecting two existing, valid ideas
    for e in edges_to_insert:
        if e["source"] in valid_ids and e["target"] in valid_ids:
            cursor.execute("""
            INSERT INTO edges (source, target, weight, relation_type, description, shared_parts)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, target) DO UPDATE SET
                weight=excluded.weight,
                relation_type=excluded.relation_type,
                description=excluded.description,
                shared_parts=excluded.shared_parts
            """, (
                e["source"],
                e["target"],
                e["weight"],
                e["relation_type"],
                e["description"],
                json.dumps(e["shared_parts"])
            ))

    # Clean up obsolete ideas and edges in SQLite that no longer exist on disk
    if valid_ids:
        placeholders = ",".join("?" for _ in valid_ids)
        cursor.execute(f"DELETE FROM ideas WHERE id NOT IN ({placeholders})", list(valid_ids))
        cursor.execute(f"DELETE FROM edges WHERE source NOT IN ({placeholders}) OR target NOT IN ({placeholders})", list(valid_ids) + list(valid_ids))
    else:
        cursor.execute("DELETE FROM ideas")
        cursor.execute("DELETE FROM edges")

    # Clean up any edges in SQLite that were deleted from markdown files
    valid_edge_pairs = {(e["source"], e["target"]) for e in edges_to_insert if e["source"] in valid_ids and e["target"] in valid_ids}
    cursor.execute("SELECT id, source, target FROM edges")
    for row in cursor.fetchall():
        if (row["source"], row["target"]) not in valid_edge_pairs:
            cursor.execute("DELETE FROM edges WHERE id = ?", (row["id"],))

    conn.commit()
    conn.close()

def get_all_ideas() -> List[IdeaNode]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ideas ORDER BY category ASC, title ASC")
    rows = cursor.fetchall()
    conn.close()

    nodes = []
    for r in rows:
        bom_raw = json.loads(r["bom_json"] or "[]")
        bom_items = [BOMItem(**b) for b in bom_raw]
        nodes.append(IdeaNode(
            id=r["id"],
            title=r["title"],
            name=r["title"],
            category=r["category"],
            status=r["status"],
            description=r["description"] or "",
            content_markdown=r["content_markdown"] or "",
            tags=json.loads(r["tags"] or "[]"),
            bom=bom_items,
            created_at=r["created_at"],
            updated_at=r["updated_at"]
        ))
    return nodes

def get_idea_by_id(idea_id: str) -> Optional[IdeaNode]:
    file_path = os.path.join(IDEAS_DIR, f"{idea_id}.md")
    if os.path.exists(file_path):
        parsed = parse_markdown_file(file_path)
        if parsed:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO ideas (id, title, category, status, description, content_markdown, tags, bom_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title, category=excluded.category, status=excluded.status,
                description=excluded.description, content_markdown=excluded.content_markdown,
                tags=excluded.tags, bom_json=excluded.bom_json, updated_at=excluded.updated_at
            """, (
                parsed["id"], parsed["title"], parsed["category"], parsed["status"],
                parsed["description"], parsed["content_markdown"],
                json.dumps(parsed["tags"]), json.dumps(parsed["bom"]),
                parsed["created_at"], parsed["updated_at"]
            ))
            conn.commit()
            conn.close()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    bom_raw = json.loads(row["bom_json"] or "[]")
    return IdeaNode(
        id=row["id"],
        title=row["title"],
        name=row["title"],
        category=row["category"],
        status=row["status"],
        description=row["description"] or "",
        content_markdown=row["content_markdown"] or "",
        tags=json.loads(row["tags"] or "[]"),
        bom=[BOMItem(**b) for b in bom_raw],
        created_at=row["created_at"],
        updated_at=row["updated_at"]
    )

def save_or_update_idea(idea: IdeaNode) -> IdeaNode:
    write_markdown_file(idea)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO ideas (id, title, category, status, description, content_markdown, tags, bom_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        category=excluded.category,
        status=excluded.status,
        description=excluded.description,
        content_markdown=excluded.content_markdown,
        tags=excluded.tags,
        bom_json=excluded.bom_json,
        updated_at=excluded.updated_at
    """, (
        idea.id,
        idea.title,
        idea.category,
        idea.status,
        idea.description,
        idea.content_markdown,
        json.dumps(idea.tags),
        json.dumps([b.model_dump() for b in idea.bom]),
        idea.created_at or datetime.now().isoformat(),
        datetime.now().isoformat()
    ))
    conn.commit()
    conn.close()
    return idea

def delete_idea(idea_id: str) -> bool:
    # 1. Remove markdown file from disk
    file_path = os.path.join(IDEAS_DIR, f"{idea_id}.md")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Error removing {file_path}: {e}")

    # 2. Remove references/connections to this idea from all remaining markdown files
    if os.path.exists(IDEAS_DIR):
        for f in os.listdir(IDEAS_DIR):
            if f.endswith(".md"):
                other_id = os.path.splitext(f)[0]
                if other_id != idea_id:
                    remove_connection_from_markdown_file(other_id, idea_id)

    # 3. Clean up SQLite database
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM ideas WHERE id = ?", (idea_id,))
    cursor.execute("DELETE FROM edges WHERE source = ? OR target = ?", (idea_id, idea_id))
    conn.commit()
    conn.close()
    return True

def get_all_edges() -> List[IdeaEdge]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT source, target, weight, relation_type, description, shared_parts FROM edges")
    rows = cursor.fetchall()
    conn.close()

    edges = []
    for r in rows:
        edges.append(IdeaEdge(
            source=r["source"],
            target=r["target"],
            weight=r["weight"],
            relation_type=r["relation_type"],
            description=r["description"] or "",
            shared_parts=json.loads(r["shared_parts"] or "[]")
        ))
    return edges

def insert_edge(edge: IdeaEdge) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO edges (source, target, weight, relation_type, description, shared_parts)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, target) DO UPDATE SET
        weight=excluded.weight,
        relation_type=excluded.relation_type,
        description=excluded.description,
        shared_parts=excluded.shared_parts
    """, (
        edge.source,
        edge.target,
        edge.weight,
        edge.relation_type,
        edge.description,
        json.dumps(edge.shared_parts)
    ))
    conn.commit()
    conn.close()

    source_idea = get_idea_by_id(edge.source)
    if source_idea:
        write_markdown_file(source_idea)

    return True

def delete_edge(source: str, target: str) -> bool:
    # 1. Remove connection from markdown file on disk
    remove_connection_from_markdown_file(source, target)
    remove_connection_from_markdown_file(target, source)

    # 2. Delete from SQLite edges table
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM edges WHERE (source = ? AND target = ?) OR (source = ? AND target = ?)", (source, target, target, source))
    conn.commit()
    conn.close()
    return True

def get_bom_aggregation(idea_ids: Optional[List[str]] = None) -> BOMSummary:
    ideas = get_all_ideas()
    if idea_ids:
        target_ids = set(idea_ids)
        ideas = [i for i in ideas if i.id in target_ids]
    part_map: Dict[str, Dict[str, Any]] = {}

    for idea in ideas:
        for b in idea.bom:
            norm_name = b.item.strip()
            key = norm_name.lower()
            if key not in part_map:
                part_map[key] = {
                    "display_name": norm_name,
                    "total_qty": 0,
                    "projects": []
                }
            part_map[key]["total_qty"] += b.qty
            part_map[key]["projects"].append(BOMProjectUsage(
                idea_id=idea.id,
                idea_title=idea.title,
                category=idea.category,
                qty=b.qty,
                notes=b.notes or ""
            ))

    aggregated_items = []
    bulk_recommendations = []

    for key, data in sorted(part_map.items(), key=lambda x: len(x[1]["projects"]), reverse=True):
        proj_count = len(data["projects"])
        is_shared = proj_count > 1
        item_obj = AggregatedBOMItem(
            item=data["display_name"],
            total_qty=data["total_qty"],
            projects=data["projects"],
            is_shared=is_shared
        )
        aggregated_items.append(item_obj)

        if is_shared:
            proj_titles = ", ".join([p.idea_title for p in data["projects"][:3]])
            rec = f"{data['display_name']}: Needed across {proj_count} projects ({proj_titles}). Order bulk pack ({data['total_qty']} total units)."
            bulk_recommendations.append(rec)

    shared_count = sum(1 for it in aggregated_items if it.is_shared)

    return BOMSummary(
        items=aggregated_items,
        total_unique_items=len(aggregated_items),
        shared_items_count=shared_count,
        bulk_buy_recommendations=bulk_recommendations
    )

def seed_default_ideas():
    seeds = [
        {
            "id": "smart-solder-fume-extractor",
            "title": "Smart Solder Fume Extractor",
            "category": "Hardware & Electronics",
            "status": "prototyping",
            "tags": ["esp32", "soldering", "workshop", "3d-printing"],
            "description": "Automated whisper-quiet bench fume extractor with VOC air sensor and PWM fan control.",
            "bom": [
                {"item": "ESP32-WROOM-32 Dev Board", "qty": 1, "notes": "PWM fan curve and SGP40 reading"},
                {"item": "Noctua NF-F12 120mm 12V PWM Fan", "qty": 1, "notes": "High static pressure, silent operation"},
                {"item": "Activated Carbon Filter Sheet", "qty": 1, "notes": "Cut to 120mm square cartridge"},
                {"item": "12V 2A DC Power Adapter", "qty": 1, "notes": "Barrel jack supply"},
                {"item": "SGP40 VOC Gas Sensor", "qty": 1, "notes": "Detects rosin flux vapors"}
            ],
            "connections": [
                {"target": "desktop-reflow-plate", "relation": "shared_bom", "notes": "Both need Noctua 12V fans and 12V/24V power circuits.", "shared_parts": ["Noctua NF-F12 120mm 12V PWM Fan"]},
                {"target": "smart-workbench-bench", "relation": "synergy", "notes": "Mounts directly to articulated workbench arm."}
            ],
            "markdown": """## Concept & Requirements
A compact, desktop soldering fume extractor that automatically detects rosin flux smoke and spins up quietly without needing manual button presses.

### Key Features
- **Automatic Smoke Trigger**: Uses an SGP40 VOC sensor next to the intake grille to detect flux aerosol spikes.
- **Whisper-Quiet Mode**: Uses a Noctua 120mm PWM fan running at 40% idle, boosting to 100% only when soldering.
- **Replaceable Filter Tray**: 3D printed magnetic filter cassette for quick replacement of activated carbon foam.

### Sourcing & Bulk Buy Opportunity
- Noctua 120mm fan can be ordered as a multi-pack together with the Desktop Reflow Hotplate cooling fan.
"""
        },
        {
            "id": "desktop-reflow-plate",
            "title": "Desktop PCB Reflow Hotplate",
            "category": "Hardware & Electronics",
            "status": "in-progress",
            "tags": ["rp2040", "smd", "soldering", "electronics"],
            "description": "Precision aluminum heating plate with PID temperature profile for SMD soldering.",
            "bom": [
                {"item": "RP2040-Zero Microcontroller", "qty": 1, "notes": "PID loop and graphic display driver"},
                {"item": "0.96 inch I2C OLED Display (SSD1306)", "qty": 1, "notes": "Shows temperature curve graph"},
                {"item": "Noctua NF-F12 120mm 12V PWM Fan", "qty": 1, "notes": "Rapid cool-down cycle after reflow"},
                {"item": "K-Type Thermocouple with MAX6675", "qty": 1, "notes": "Plate temp feedback"},
                {"item": "Solid State Relay (SSR) 25A", "qty": 1, "notes": "AC or 24V DC heater switching"}
            ],
            "connections": [
                {"target": "smart-solder-fume-extractor", "relation": "shared_bom", "notes": "Shares 12V Noctua cooling fan.", "shared_parts": ["Noctua NF-F12 120mm 12V PWM Fan"]},
                {"target": "custom-oled-macropad", "relation": "shared_bom", "notes": "Shares RP2040-Zero MCU and 0.96 OLED screens.", "shared_parts": ["RP2040-Zero Microcontroller", "0.96 inch I2C OLED Display (SSD1306)"]}
            ],
            "markdown": """## Overview
A compact 100x100mm aluminum heating bed with precise reflow temperature curves (Lead-free SAC305 and Leaded Sn63 profiles).

### Control System
- RP2040 microcontroller running custom PID heating curves.
- 0.96 inch OLED showing live Celsius temperature and time elapsed.
- Noctua fan underneath blows air up to quench the board once the reflow peak is achieved.
"""
        },
        {
            "id": "custom-oled-macropad",
            "title": "Custom OLED 9-Key Macro Pad",
            "category": "Hardware & Electronics",
            "status": "in-progress",
            "tags": ["rp2040", "keyboard", "cad", "ergonomics"],
            "description": "9-key mechanical keypad with dual rotary encoders and mini display for CAD and code shortcuts.",
            "bom": [
                {"item": "RP2040-Zero Microcontroller", "qty": 1, "notes": "QMK / Vial firmware"},
                {"item": "0.96 inch I2C OLED Display (SSD1306)", "qty": 1, "notes": "Active layer & volume display"},
                {"item": "EC11 Rotary Encoder", "qty": 2, "notes": "CAD zoom and system audio dial"},
                {"item": "Gateron Yellow Switches", "qty": 9, "notes": "Smooth linear key feel"},
                {"item": "Neodymium Disc Magnets 6x3mm", "qty": 4, "notes": "Snap-fit base incline riser"}
            ],
            "connections": [
                {"target": "desktop-reflow-plate", "relation": "shared_bom", "notes": "Both utilize RP2040-Zero and 0.96 OLEDs.", "shared_parts": ["RP2040-Zero Microcontroller", "0.96 inch I2C OLED Display (SSD1306)"]},
                {"target": "stream-deck-dock", "relation": "synergy", "notes": "Can dock alongside the Stream Deck controller for seamless desk setup."}
            ],
            "markdown": """## Design Overview
A custom machined aluminum or 3D-printed macro pad with 9 hot-swap mechanical switches and 2 high-precision aluminum knobs.

### Firmware & Features
- Vial compatible for on-the-fly GUI key remapping.
- Rotary encoders provide clicky detents for timeline scrubbing in CAD and video editing.
- Magnetic base allows swapping between 15-degree tilt and flat desk orientation.
"""
        },
        {
            "id": "stream-deck-dock",
            "title": "Modular Stream Deck & Tool Dock",
            "category": "Hardware & Electronics",
            "status": "concept",
            "tags": ["rp2040", "desk", "audio", "productivity"],
            "description": "Desk dock integrating media dials, shortcut buttons, and USB hub.",
            "bom": [
                {"item": "RP2040-Zero Microcontroller", "qty": 1, "notes": "USB HID composite device"},
                {"item": "0.96 inch I2C OLED Display (SSD1306)", "qty": 1, "notes": "Context menu feedback"},
                {"item": "EC11 Rotary Encoder", "qty": 3, "notes": "App volume mixer channels"},
                {"item": "M3 Brass Heat-Set Inserts", "qty": 8, "notes": "Threaded enclosure fastening"}
            ],
            "connections": [
                {"target": "custom-oled-macropad", "relation": "shared_bom", "notes": "Shares RP2040-Zero, OLED, and EC11 encoders.", "shared_parts": ["RP2040-Zero Microcontroller", "0.96 inch I2C OLED Display (SSD1306)", "EC11 Rotary Encoder"]},
                {"target": "gridfinity-storage-wall", "relation": "synergy", "notes": "Dock base aligns with Gridfinity pitch standard."}
            ],
            "markdown": """## Concept
A multi-knob audio mixer and productivity dock for Linux desktop management. Controls Discord volume, Spotify playback, and terminal shortcuts.
"""
        },
        {
            "id": "smart-workbench-bench",
            "title": "Smart IoT Electronics Workbench",
            "category": "Workshop & Tools",
            "status": "in-progress",
            "tags": ["esp32", "workshop", "lighting", "power"],
            "description": "Illuminated workbench with integrated telemetry, overhead CRI95 task lights, and power rails.",
            "bom": [
                {"item": "ESP32-WROOM-32 Dev Board", "qty": 1, "notes": "Home Assistant MQTT integration"},
                {"item": "WS2812B Addressable LED Strip (60/m)", "qty": 2, "notes": "Bias and colored alert lighting"},
                {"item": "MeanWell 24V 10A Power Supply", "qty": 1, "notes": "Main DC bus for bench tools"},
                {"item": "M5 Socket Head Cap Screws 16mm", "qty": 24, "notes": "2020 Aluminum extrusion assembly"}
            ],
            "connections": [
                {"target": "smart-solder-fume-extractor", "relation": "synergy", "notes": "Workbench provides 12V/24V power rail and triggers extractor."},
                {"target": "audio-spectrum-tube", "relation": "shared_bom", "notes": "Shares WS2812B LED strips and ESP32 boards.", "shared_parts": ["ESP32-WROOM-32 Dev Board", "WS2812B Addressable LED Strip (60/m)"]}
            ],
            "markdown": """## Concept
A high-CRI workstation built from 2020 T-slot aluminum extrusions with built-in power measurement, safety cutoffs, and lighting presets.
"""
        },
        {
            "id": "audio-spectrum-tube",
            "title": "Audio Spectrum Visualizer Tube",
            "category": "Audio & Visual",
            "status": "concept",
            "tags": ["esp32", "audio", "dsp", "led"],
            "description": "Cylindrical ambient audio spectrum analyzer with real-time FFT frequency response.",
            "bom": [
                {"item": "ESP32-WROOM-32 Dev Board", "qty": 1, "notes": "Runs 512-point FFT in real time"},
                {"item": "WS2812B Addressable LED Strip (60/m)", "qty": 1, "notes": "Spiral wrap around frosted acrylic tube"},
                {"item": "INMP441 I2S Digital MEMS Microphone", "qty": 1, "notes": "Clean 24-bit audio capture"}
            ],
            "connections": [
                {"target": "smart-workbench-bench", "relation": "shared_bom", "notes": "Shares ESP32 and WS2812B strips.", "shared_parts": ["ESP32-WROOM-32 Dev Board", "WS2812B Addressable LED Strip (60/m)"]}
            ],
            "markdown": """## Concept
An ambient desktop pillar that samples room audio via an I2S MEMS mic and maps frequency bands into flowing particle waves on a spiral LED column.
"""
        },
        {
            "id": "gridfinity-storage-wall",
            "title": "Gridfinity Component Storage Wall",
            "category": "Workshop & Tools",
            "status": "completed",
            "tags": ["workshop", "gridfinity", "3d-printing", "storage"],
            "description": "Modular storage rack system for SMD parts, fasteners, and hand tools.",
            "bom": [
                {"item": "Neodymium Disc Magnets 6x3mm", "qty": 64, "notes": "Baseplate and bin magnetic retention"},
                {"item": "M3 Brass Heat-Set Inserts", "qty": 30, "notes": "Mounting brackets to wall studs"},
                {"item": "PETG Filament (1kg Spool)", "qty": 3, "notes": "Impact-resistant tool holders"}
            ],
            "connections": [
                {"target": "custom-oled-macropad", "relation": "shared_bom", "notes": "Both need 6x3mm neodymium magnets.", "shared_parts": ["Neodymium Disc Magnets 6x3mm"]},
                {"target": "articulated-tool-arm", "relation": "synergy", "notes": "Tool arm mounts onto the Gridfinity perimeter rail."}
            ],
            "markdown": """## Concept
Standardized Zack Freedman Gridfinity 42mm baseplates mounted on French cleat walls for instant access to screws, resistors, and tweezers.
"""
        },
        {
            "id": "articulated-tool-arm",
            "title": "Articulated Tool & Camera Arm",
            "category": "Workshop & Tools",
            "status": "in-progress",
            "tags": ["workshop", "cad", "mechanics", "3d-printing"],
            "description": "Heavy-duty friction-lock articulated arm for overhead soldering microscope or camera.",
            "bom": [
                {"item": "M5 Socket Head Cap Screws 16mm", "qty": 12, "notes": "Friction clamp joints"},
                {"item": "Neodymium Disc Magnets 6x3mm", "qty": 8, "notes": "Cable routing clips"},
                {"item": "1/4-inch Camera Mount Adapter", "qty": 1, "notes": "Standard tripod screw"}
            ],
            "connections": [
                {"target": "smart-workbench-bench", "relation": "shared_bom", "notes": "Shares M5 socket head screws.", "shared_parts": ["M5 Socket Head Cap Screws 16mm"]},
                {"target": "gridfinity-storage-wall", "relation": "shared_bom", "notes": "Shares 6x3mm neodymium magnets.", "shared_parts": ["Neodymium Disc Magnets 6x3mm"]}
            ],
            "markdown": """## Concept
A counterbalanced 3-axis arm for holding inspection cameras, PCB holders, or fume extractor nozzles directly over the workpiece without vibrating.
"""
        },
        {
            "id": "workshop-voice-assistant",
            "title": "Local AI Workshop Voice Assistant",
            "category": "Software & AI",
            "status": "concept",
            "tags": ["ai", "python", "whisper", "voice", "raspberry-pi"],
            "description": "Hands-free voice assistant running offline on local hardware to control bench tools.",
            "bom": [
                {"item": "Raspberry Pi 5 (8GB)", "qty": 1, "notes": "Local LLM & Whisper server"},
                {"item": "INMP441 I2S Digital MEMS Microphone", "qty": 2, "notes": "Beamforming mic pair"},
                {"item": "MeanWell 24V 10A Power Supply", "qty": 1, "notes": "Stepped down to 5V 5A for Pi"}
            ],
            "connections": [
                {"target": "audio-spectrum-tube", "relation": "shared_bom", "notes": "Both utilize INMP441 I2S MEMS microphones.", "shared_parts": ["INMP441 I2S Digital MEMS Microphone"]},
                {"target": "smart-workbench-bench", "relation": "synergy", "notes": "Assistant controls workbench lighting and power relays via voice."}
            ],
            "markdown": """## Concept
Hands get dirty when soldering or greasing bearings. A local, privacy-first voice assistant running Whisper.cpp lets you say 'turn on fume extractor' or 'lookup pinout of LM317' hands-free.
"""
        }
    ]

    for s in seeds:
        file_path = os.path.join(IDEAS_DIR, f"{s['id']}.md")
        frontmatter = {
            "id": s["id"],
            "title": s["title"],
            "category": s["category"],
            "status": s["status"],
            "tags": s["tags"],
            "description": s["description"],
            "bom": s["bom"],
            "connections": s["connections"],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        yaml_str = yaml.dump(frontmatter, sort_keys=False, allow_unicode=True)
        content = f"---\n{yaml_str}---\n\n# {s['title']}\n\n{s['markdown']}\n"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

    print(f"Seeded {len(seeds)} default creative ideas in {IDEAS_DIR}")
