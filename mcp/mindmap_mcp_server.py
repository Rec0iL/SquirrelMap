#!/usr/bin/env python3
"""
mindmap_mcp_server.py
Model Context Protocol (MCP) Server for the Creative Idea Mindmap.
Exposes tools for AI agents (Antigravity/AGY) to read and manage markdown project files,
categorize ideas, discover shared Bill of Materials (BOM) components for bulk purchasing,
detect similarities, and fuse/split/link creative ideas.
"""

import sys
import json
import sqlite3
import os
import urllib.request
import traceback
import yaml
from typing import Dict, Any, List, Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
IDEAS_DIR = os.path.join(PROJECT_ROOT, "ideas")
DB_PATH = os.path.join(PROJECT_ROOT, "backend", "mindmap.db")
BACKEND_API_URL = "http://localhost:8766"

sys.path.insert(0, PROJECT_ROOT)
from backend import database
from backend.models import IdeaNode, IdeaEdge, BOMItem

def notify_backend_reload():
    try:
        req = urllib.request.Request(f"{BACKEND_API_URL}/api/health", method="GET")
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            pass
    except Exception:
        pass

# ==============================================================================
# TOOL IMPLEMENTATIONS
# ==============================================================================

def tool_list_ideas(args: Dict[str, Any]) -> str:
    category = args.get("category")
    status = args.get("status")
    query = args.get("query")
    limit = args.get("limit", 50)

    ideas = database.get_all_ideas()
    if category and category.lower() != "all":
        ideas = [i for i in ideas if i.category.lower() == category.lower()]
    if status and status.lower() != "all":
        ideas = [i for i in ideas if i.status.lower() == status.lower()]
    if query:
        q = query.lower()
        ideas = [i for i in ideas if q in i.title.lower() or q in i.description.lower() or any(q in t.lower() for t in i.tags)]

    ideas = ideas[:limit]

    results = []
    for i in ideas:
        results.append({
            "id": i.id,
            "title": i.title,
            "category": i.category,
            "status": i.status,
            "tags": i.tags,
            "description": i.description,
            "bom_items_count": len(i.bom)
        })

    return json.dumps({
        "count": len(results),
        "ideas": results
    }, indent=2)

def tool_get_idea(args: Dict[str, Any]) -> str:
    idea_id = args.get("idea_id")
    if not idea_id:
        return json.dumps({"error": "idea_id parameter is required"})

    idea = database.get_idea_by_id(idea_id)
    if not idea:
        return json.dumps({"error": f"Idea '{idea_id}' not found"})

    # Fetch edges
    all_edges = database.get_all_edges()
    outgoing = [e.model_dump() for e in all_edges if e.source == idea_id]
    incoming = [e.model_dump() for e in all_edges if e.target == idea_id]

    file_path = os.path.join(IDEAS_DIR, f"{idea_id}.md")

    return json.dumps({
        "id": idea.id,
        "title": idea.title,
        "category": idea.category,
        "status": idea.status,
        "tags": idea.tags,
        "description": idea.description,
        "bom": [b.model_dump() for b in idea.bom],
        "outgoing_connections": outgoing,
        "incoming_connections": incoming,
        "file_path": file_path,
        "content_markdown": idea.content_markdown
    }, indent=2)

def tool_add_idea(args: Dict[str, Any]) -> str:
    title = args.get("title")
    if not title:
        return json.dumps({"error": "title parameter is required"})

    idea_id = args.get("id")
    if not idea_id:
        # Generate kebab-case id from title
        import re
        idea_id = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")

    category = args.get("category", "General")
    status = args.get("status", "concept")
    description = args.get("description", "")
    markdown_content = args.get("markdown_content", f"# {title}\n\n{description}\n")
    tags = args.get("tags", [])
    raw_bom = args.get("bom", [])

    bom_items = []
    for b in raw_bom:
        if isinstance(b, dict) and "item" in b:
            bom_items.append(BOMItem(
                item=str(b["item"]).strip(),
                qty=int(b.get("qty", 1)),
                notes=str(b.get("notes", "")),
                link=str(b.get("link", ""))
            ))
        elif isinstance(b, str) and b.strip():
            bom_items.append(BOMItem(item=b.strip(), qty=1))

    idea = IdeaNode(
        id=idea_id,
        title=title,
        category=category,
        status=status,
        description=description,
        content_markdown=markdown_content,
        tags=tags,
        bom=bom_items
    )

    database.save_or_update_idea(idea)

    # Optional connections
    conns = args.get("connections", [])
    for c in conns:
        if isinstance(c, dict) and "target" in c:
            edge = IdeaEdge(
                source=idea_id,
                target=c["target"],
                weight=float(c.get("weight", 0.6)),
                relation_type=c.get("relation_type", "synergy"),
                description=c.get("description", ""),
                shared_parts=c.get("shared_parts", [])
            )
            database.insert_edge(edge)

    notify_backend_reload()

    return json.dumps({
        "success": True,
        "message": f"Successfully created idea '{title}' ({idea_id}.md)",
        "file_path": os.path.join(IDEAS_DIR, f"{idea_id}.md")
    }, indent=2)

def tool_update_idea(args: Dict[str, Any]) -> str:
    idea_id = args.get("idea_id")
    if not idea_id:
        return json.dumps({"error": "idea_id parameter is required"})

    idea = database.get_idea_by_id(idea_id)
    if not idea:
        return json.dumps({"error": f"Idea '{idea_id}' not found"})

    if "title" in args and args["title"]:
        idea.title = args["title"]
        idea.name = args["title"]
    if "category" in args and args["category"]:
        idea.category = args["category"]
    if "status" in args and args["status"]:
        idea.status = args["status"]
    if "description" in args:
        idea.description = args["description"]
    if "content_markdown" in args:
        idea.content_markdown = args["content_markdown"]
    if "tags" in args and isinstance(args["tags"], list):
        idea.tags = args["tags"]
    if "bom" in args and isinstance(args["bom"], list):
        bom_items = []
        for b in args["bom"]:
            if isinstance(b, dict) and "item" in b:
                bom_items.append(BOMItem(**b))
            elif isinstance(b, str) and b.strip():
                bom_items.append(BOMItem(item=b.strip(), qty=1))
        idea.bom = bom_items

    database.save_or_update_idea(idea)
    notify_backend_reload()

    return json.dumps({
        "success": True,
        "message": f"Successfully updated idea '{idea.title}'",
        "file_path": os.path.join(IDEAS_DIR, f"{idea_id}.md")
    }, indent=2)

def tool_link_ideas(args: Dict[str, Any]) -> str:
    source = args.get("source")
    target = args.get("target")
    if not source or not target:
        return json.dumps({"error": "source and target are required"})

    rel_type = args.get("relation_type", "synergy")
    weight = float(args.get("weight", 0.6))
    desc = args.get("description", "")
    shared_parts = args.get("shared_parts", [])

    edge = IdeaEdge(
        source=source,
        target=target,
        weight=weight,
        relation_type=rel_type,
        description=desc,
        shared_parts=shared_parts
    )
    database.insert_edge(edge)
    notify_backend_reload()

    return json.dumps({
        "success": True,
        "message": f"Linked '{source}' -> '{target}' ({rel_type})",
        "edge": edge.model_dump()
    }, indent=2)

def tool_find_similarities(args: Dict[str, Any]) -> str:
    from backend.graph_engine import engine
    engine.reload_graph()

    idea_id = args.get("idea_id")
    limit = args.get("limit", 6)

    if idea_id:
        sims = engine.find_similar_ideas(idea_id, limit=limit)
        return json.dumps({
            "target_idea_id": idea_id,
            "similar_ideas": sims
        }, indent=2)

    # If no specific idea_id, find global similarity opportunities
    unlinked = engine.suggest_unlinked_ideas()
    return json.dumps({
        "suggested_connections": unlinked
    }, indent=2)

def tool_analyze_bom(args: Dict[str, Any]) -> str:
    summary = database.get_bom_aggregation()
    return json.dumps({
        "total_unique_items": summary.total_unique_items,
        "shared_items_count": summary.shared_items_count,
        "bulk_buy_recommendations": summary.bulk_buy_recommendations,
        "shared_items": [item.model_dump() for item in summary.items if item.is_shared]
    }, indent=2)

def tool_fuse_ideas(args: Dict[str, Any]) -> str:
    idea_a_id = args.get("idea_a")
    idea_b_id = args.get("idea_b")
    new_title = args.get("new_title")

    a = database.get_idea_by_id(idea_a_id)
    b = database.get_idea_by_id(idea_b_id)
    if not a or not b:
        return json.dumps({"error": "Both idea_a and idea_b must exist"})

    title = new_title or f"{a.title} & {b.title}"
    import re
    merged_id = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")

    # Combine BOM
    part_map = {}
    for item in a.bom + b.bom:
        k = item.item.strip().lower()
        if k not in part_map:
            part_map[k] = BOMItem(item=item.item, qty=item.qty, notes=item.notes)
        else:
            part_map[k].qty += item.qty

    merged_tags = list(set(a.tags + b.tags))
    merged_markdown = f"""# {title}

## Consolidated Project Concept
Fused from [{a.title}] and [{b.title}].

### From {a.title}:
{a.content_markdown}

---

### From {b.title}:
{b.content_markdown}
"""

    merged_idea = IdeaNode(
        id=merged_id,
        title=title,
        category=a.category or b.category,
        status="in-progress",
        description=f"Consolidated project combining {a.title} and {b.title}",
        content_markdown=merged_markdown,
        tags=merged_tags,
        bom=list(part_map.values())
    )

    database.save_or_update_idea(merged_idea)

    # Redirect edges to new node
    all_edges = database.get_all_edges()
    for e in all_edges:
        src = merged_id if e.source in (idea_a_id, idea_b_id) else e.source
        tgt = merged_id if e.target in (idea_a_id, idea_b_id) else e.target
        if src != tgt:
            database.insert_edge(IdeaEdge(
                source=src, target=tgt, weight=e.weight,
                relation_type=e.relation_type, description=e.description, shared_parts=e.shared_parts
            ))

    # Remove old ideas
    database.delete_idea(idea_a_id)
    database.delete_idea(idea_b_id)

    notify_backend_reload()

    return json.dumps({
        "success": True,
        "message": f"Successfully fused '{a.title}' and '{b.title}' into '{title}' ({merged_id}.md)",
        "new_id": merged_id
    }, indent=2)

def tool_split_idea(args: Dict[str, Any]) -> str:
    idea_id = args.get("idea_id")
    sub_ideas_data = args.get("sub_ideas", [])
    if not idea_id or not sub_ideas_data:
        return json.dumps({"error": "idea_id and sub_ideas array required"})

    original = database.get_idea_by_id(idea_id)
    if not original:
        return json.dumps({"error": f"Original idea '{idea_id}' not found"})

    created_sub_ids = []
    import re
    for idx, s in enumerate(sub_ideas_data):
        stitle = s.get("title", f"{original.title} - Part {idx+1}")
        sid = s.get("id") or re.sub(r"[^a-z0-9]+", "-", stitle.lower()).strip("-")
        snode = IdeaNode(
            id=sid,
            title=stitle,
            category=s.get("category", original.category),
            status=s.get("status", "concept"),
            description=s.get("description", ""),
            content_markdown=s.get("markdown_content", f"# {stitle}\n\nSub-project split from {original.title}."),
            tags=s.get("tags", original.tags),
            bom=[BOMItem(**b) for b in s.get("bom", [])]
        )
        database.save_or_update_idea(snode)
        created_sub_ids.append(sid)

        # Link as subproject
        database.insert_edge(IdeaEdge(
            source=original.id,
            target=sid,
            weight=0.9,
            relation_type="subproject",
            description=f"Modular component of {original.title}"
        ))

    notify_backend_reload()

    return json.dumps({
        "success": True,
        "message": f"Split '{original.title}' into {len(created_sub_ids)} sub-projects",
        "sub_idea_ids": created_sub_ids
    }, indent=2)

def tool_get_graph_stats(args: Dict[str, Any]) -> str:
    from backend.graph_engine import engine
    engine.reload_graph()
    g = engine.get_graph_data()
    bom_sum = database.get_bom_aggregation()

    return json.dumps({
        "total_ideas": len(g.nodes),
        "total_connections": len(g.edges),
        "categories": g.categories,
        "statuses": g.statuses,
        "shared_bom_connections": g.shared_bom_count,
        "unique_bom_parts": bom_sum.total_unique_items,
        "bulk_buy_opportunities_count": bom_sum.shared_items_count,
        "top_bulk_buy_recommendations": bom_sum.bulk_buy_recommendations[:4]
    }, indent=2)

# ==============================================================================
# TOOL REGISTRY & DISPATCH
# ==============================================================================

TOOLS = [
    {
        "name": "mindmap_list_ideas",
        "description": "Lists ideas and maker projects with optional filtering by category, status, or search query.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Filter by category name (e.g. 'Hardware & Electronics')"},
                "status": {"type": "string", "enum": ["concept", "prototyping", "in-progress", "completed", "archived"]},
                "query": {"type": "string", "description": "Keyword search across title, description, and tags"},
                "limit": {"type": "integer", "default": 50}
            }
        }
    },
    {
        "name": "mindmap_get_idea",
        "description": "Retrieves the complete markdown file content, frontmatter metadata, BOM items, and connections for an idea.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "idea_id": {"type": "string", "description": "Kebab-case ID of the idea (e.g. 'smart-solder-fume-extractor')"}
            },
            "required": ["idea_id"]
        }
    },
    {
        "name": "mindmap_add_idea",
        "description": "Creates a new idea/project node, automatically writing its .md file to the ideas/ folder, categorizing it, and indexing its BOM.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Title of the project or idea"},
                "category": {"type": "string", "description": "Category name (e.g. 'Hardware & Electronics', 'Software & AI')"},
                "status": {"type": "string", "enum": ["concept", "prototyping", "in-progress", "completed", "archived"]},
                "description": {"type": "string", "description": "1-2 sentence overview"},
                "markdown_content": {"type": "string", "description": "Full markdown note content"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "bom": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item": {"type": "string"},
                            "qty": {"type": "integer"},
                            "notes": {"type": "string"}
                        },
                        "required": ["item"]
                    }
                },
                "connections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "target": {"type": "string"},
                            "relation_type": {"type": "string", "enum": ["shared_bom", "synergy", "depends_on", "subproject", "related"]},
                            "description": {"type": "string"},
                            "shared_parts": {"type": "array", "items": {"type": "string"}}
                        },
                        "required": ["target"]
                    }
                }
            },
            "required": ["title"]
        }
    },
    {
        "name": "mindmap_update_idea",
        "description": "Updates an existing idea's markdown content, BOM items, tags, category, or status, re-writing the .md file.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "idea_id": {"type": "string"},
                "title": {"type": "string"},
                "category": {"type": "string"},
                "status": {"type": "string"},
                "description": {"type": "string"},
                "content_markdown": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "bom": {"type": "array"}
            },
            "required": ["idea_id"]
        }
    },
    {
        "name": "mindmap_link_ideas",
        "description": "Establishes a connection between two ideas (e.g. shared_bom for shared hardware parts, synergy, depends_on).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "source": {"type": "string"},
                "target": {"type": "string"},
                "relation_type": {"type": "string", "enum": ["shared_bom", "synergy", "depends_on", "subproject", "related"]},
                "weight": {"type": "number"},
                "description": {"type": "string"},
                "shared_parts": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["source", "target"]
        }
    },
    {
        "name": "mindmap_find_similarities",
        "description": "Scans across all projects to identify similarities, shared BOM components, and potential synergy links.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "idea_id": {"type": "string", "description": "Optional idea ID to find matches specifically for that project"},
                "limit": {"type": "integer", "default": 6}
            }
        }
    },
    {
        "name": "mindmap_analyze_bom",
        "description": "Cross-project Bill of Materials aggregator! Aggregates parts across all projects and finds bulk-buy opportunities.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "mindmap_fuse_ideas",
        "description": "Combines two related ideas into one consolidated project, merging their BOM and markdown notes into a new file.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "idea_a": {"type": "string"},
                "idea_b": {"type": "string"},
                "new_title": {"type": "string"}
            },
            "required": ["idea_a", "idea_b"]
        }
    },
    {
        "name": "mindmap_split_idea",
        "description": "Splits a large idea into modular sub-projects and links them as subprojects.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "idea_id": {"type": "string"},
                "sub_ideas": {"type": "array"}
            },
            "required": ["idea_id", "sub_ideas"]
        }
    },
    {
        "name": "mindmap_get_graph_stats",
        "description": "Retrieves high-level summary of total ideas, categories, connections, BOM parts, and bulk-buy opportunities.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    }
]

DISPATCH = {
    "mindmap_list_ideas": tool_list_ideas,
    "mindmap_get_idea": tool_get_idea,
    "mindmap_add_idea": tool_add_idea,
    "mindmap_update_idea": tool_update_idea,
    "mindmap_link_ideas": tool_link_ideas,
    "mindmap_find_similarities": tool_find_similarities,
    "mindmap_analyze_bom": tool_analyze_bom,
    "mindmap_fuse_ideas": tool_fuse_ideas,
    "mindmap_split_idea": tool_split_idea,
    "mindmap_get_graph_stats": tool_get_graph_stats
}

def send_response(msg: Dict[str, Any]):
    line = json.dumps(msg) + "\n"
    sys.stdout.write(line)
    sys.stdout.flush()

def handle_request(req: Dict[str, Any]):
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params", {})

    if method == "initialize":
        send_response({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "idea-mindmap", "version": "2.0.0"}
            }
        })
        return

    if method in ("notifications/initialized", "initialized"):
        return

    if method == "ping":
        send_response({"jsonrpc": "2.0", "id": req_id, "result": {}})
        return

    if method == "tools/list":
        send_response({"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}})
        return

    if method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        if tool_name not in DISPATCH:
            send_response({
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Tool '{tool_name}' not found."}
            })
            return

        try:
            handler = DISPATCH[tool_name]
            result_text = handler(arguments)
            send_response({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": [{"type": "text", "text": result_text}]}
            })
        except Exception as e:
            send_response({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "isError": True,
                    "content": [{"type": "text", "text": f"Error: {str(e)}\n{traceback.format_exc()}"}]
                }
            })
        return

    if req_id is not None:
        send_response({
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method '{method}' not implemented."}
        })

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            handle_request(req)
        except json.JSONDecodeError:
            pass
        except Exception as e:
            sys.stderr.write(f"MCP Server Error: {str(e)}\n")
            sys.stderr.flush()

if __name__ == "__main__":
    main()
