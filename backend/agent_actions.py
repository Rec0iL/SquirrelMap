"""
Commands the AI agent can run on the user's mindmap.

The agent (any provider: Claude, AGY, Ollama, ...) appends a fenced block to its reply:

    ```squirrelmap-actions
    [{"action": "delete_idea", "id": "chronoflow"}]
    ```

The backend parses and executes the block, removes it from the visible reply and reports the outcome.
Deleted notes are copied to a trash folder first so nothing is lost by accident.
"""
import json
import os
import re
import shutil
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from backend import database
from backend.models import IdeaEdge, BOMItem

ACTION_BLOCK_RE = re.compile(r"```squirrelmap-actions\s*\n(.*?)```", re.DOTALL)

COMMAND_REFERENCE = """SQUIRRELMAP COMMANDS (you CAN change the mindmap - do not tell the user to do it by hand):
To perform changes, end your reply with ONE fenced block of JSON actions. SquirrelMap executes them right after your reply.
```squirrelmap-actions
[
  {"action": "delete_idea", "id": "<project id>"},
  {"action": "update_idea", "id": "<project id>", "title": "...", "category": "...", "status": "concept|prototyping|in-progress|completed|archived",
   "description": "...", "tags": ["replace","all"], "add_tags": ["append"], "content_markdown": "full new note body",
   "append_markdown": "text added to the end of the note",
   "bom": [{"item": "Part", "qty": 1, "notes": ""}],          // replaces the whole BOM
   "add_bom": [{"item": "Part", "qty": 2, "notes": ""}],      // adds / increases quantity
   "remove_bom": ["Part name"]},
  {"action": "add_connection", "source": "<id>", "target": "<id>", "relation_type": "synergy|shared_bom|depends_on|subproject|related", "weight": 0.5, "description": "why"},
  {"action": "remove_connection", "source": "<id>", "target": "<id>"},
  {"action": "merge_ideas", "keep_id": "<id>", "remove_id": "<id>"}   // moves BOM items/tags/connections of remove_id into keep_id, then deletes remove_id
]
```
Rules: the block must be strictly valid JSON (no comments, no trailing commas). Use the exact project ids from the PROJECT INDEX. Only include fields you want to change. Use the block only when the user asked for a change.
To CREATE a new project, do NOT use an action: write the project note with YAML frontmatter as described below and SquirrelMap saves it.
Deleted projects are moved to a trash folder, so a mistake can be undone by the user. After the block do not write anything else."""


def build_project_index(max_items: int = 300) -> str:
    """Compact overview of all projects (ids, titles, status, connections) for the agent prompt."""
    try:
        ideas = database.get_all_ideas()
        edges = database.get_all_edges()
    except Exception as e:
        return f"(project index unavailable: {e})"
    links: Dict[str, List[str]] = {}
    for e in edges:
        links.setdefault(e.source, []).append(e.target)
        links.setdefault(e.target, []).append(e.source)
    if not ideas:
        return "PROJECT INDEX: (no projects yet)"
    lines = ["PROJECT INDEX (id | title | category | status | BOM items | connected to):"]
    for i in ideas[:max_items]:
        lines.append(f"- {i.id} | {i.title} | {i.category} | {i.status} | {len(i.bom)} | {', '.join(sorted(set(links.get(i.id, [])))) or '-'}")
    if len(ideas) > max_items:
        lines.append(f"... and {len(ideas) - max_items} more")
    return "\n".join(lines)


def extract_actions(text: str) -> Tuple[str, List[Dict[str, Any]], Optional[str]]:
    """Returns (text without the action block, actions, parse_error)."""
    actions: List[Dict[str, Any]] = []
    error = None
    for m in ACTION_BLOCK_RE.finditer(text or ""):
        try:
            data = json.loads(m.group(1).strip())
            if isinstance(data, dict):
                data = data.get("actions", [data])
            if isinstance(data, list):
                actions.extend(a for a in data if isinstance(a, dict))
        except Exception as e:
            error = f"Could not read the action block: {e}"
    return ACTION_BLOCK_RE.sub("", text or "").strip(), actions, error


def _resolve(ref: Any):
    """Finds a project by id, or falls back to an exact (case-insensitive) title match."""
    if not ref:
        return None
    ref = str(ref).strip()
    idea = database.get_idea_by_id(ref)
    if idea:
        return idea
    low = ref.lower()
    for i in database.get_all_ideas():
        if i.title.strip().lower() == low or i.id.lower() == low:
            return i
    return None


def _trash(idea_id: str):
    src = os.path.join(database.IDEAS_DIR, f"{idea_id}.md")
    if os.path.isfile(src):
        trash_dir = os.path.join(os.path.dirname(database.IDEAS_DIR), "trash")
        os.makedirs(trash_dir, exist_ok=True)
        shutil.copy2(src, os.path.join(trash_dir, f"{idea_id}.{datetime.now().strftime('%Y%m%d-%H%M%S')}.md"))


def _bom_from(items: Any) -> List[BOMItem]:
    out = []
    for b in items or []:
        if isinstance(b, str):
            out.append(BOMItem(item=b))
        elif isinstance(b, dict) and b.get("item"):
            try:
                qty = max(1, int(b.get("qty", 1)))
            except (TypeError, ValueError):
                qty = 1
            out.append(BOMItem(item=str(b["item"]), qty=qty, notes=str(b.get("notes", "") or ""), link=str(b.get("link", "") or "")))
    return out


def _do_delete(a):
    idea = _resolve(a.get("id"))
    if not idea:
        return False, f"delete_idea: project '{a.get('id')}' not found"
    _trash(idea.id)
    database.delete_idea(idea.id)
    return True, f"Deleted project **{idea.title}** (`{idea.id}`) - a copy is in the trash folder"


def _do_update(a):
    idea = _resolve(a.get("id"))
    if not idea:
        return False, f"update_idea: project '{a.get('id')}' not found"
    changed = []
    for f in ("title", "category", "description"):
        if isinstance(a.get(f), str) and a[f].strip():
            setattr(idea, f, a[f].strip())
            changed.append(f)
    if a.get("status"):
        idea.status = IdeaNode_status(a["status"])
        changed.append("status")
    if isinstance(a.get("tags"), list):
        idea.tags = [str(t) for t in a["tags"]]
        changed.append("tags")
    if isinstance(a.get("add_tags"), list):
        idea.tags = list(dict.fromkeys(idea.tags + [str(t) for t in a["add_tags"]]))
        changed.append("tags")
    if isinstance(a.get("content_markdown"), str):
        idea.content_markdown = a["content_markdown"]
        changed.append("note")
    if isinstance(a.get("append_markdown"), str) and a["append_markdown"].strip():
        idea.content_markdown = (idea.content_markdown.rstrip() + "\n\n" + a["append_markdown"].strip() + "\n")
        changed.append("note")
    if isinstance(a.get("bom"), list):
        idea.bom = _bom_from(a["bom"])
        changed.append("BOM")
    if isinstance(a.get("add_bom"), list):
        by_name = {b.item.strip().lower(): b for b in idea.bom}
        for nb in _bom_from(a["add_bom"]):
            ex = by_name.get(nb.item.strip().lower())
            if ex:
                ex.qty += nb.qty
            else:
                idea.bom.append(nb)
                by_name[nb.item.strip().lower()] = nb
        changed.append("BOM")
    if isinstance(a.get("remove_bom"), list):
        drop = {str(x).strip().lower() for x in a["remove_bom"]}
        idea.bom = [b for b in idea.bom if b.item.strip().lower() not in drop]
        changed.append("BOM")
    if not changed:
        return False, f"update_idea: nothing to change for '{idea.id}'"
    if a.get("title") and not idea.name == idea.title:
        idea.name = idea.title
    database.save_or_update_idea(idea)
    return True, f"Updated **{idea.title}** ({', '.join(dict.fromkeys(changed))})"


def IdeaNode_status(v: str) -> str:
    from backend.models import IdeaNode
    return IdeaNode(id="x", title="x", status=v).status


def _do_connect(a):
    s, t = _resolve(a.get("source")), _resolve(a.get("target"))
    if not s or not t:
        return False, f"add_connection: could not find '{a.get('source') if not s else a.get('target')}'"
    if s.id == t.id:
        return False, "add_connection: cannot connect a project to itself"
    rel = a.get("relation_type") if a.get("relation_type") in ("shared_bom", "synergy", "depends_on", "subproject", "related") else "synergy"
    try:
        w = min(1.0, max(0.0, float(a.get("weight", 0.5))))
    except (TypeError, ValueError):
        w = 0.5
    database.insert_edge(IdeaEdge(source=s.id, target=t.id, weight=w, relation_type=rel, description=str(a.get("description", "") or "")))
    return True, f"Connected **{s.title}** -> **{t.title}** ({rel})"


def _do_disconnect(a):
    s, t = _resolve(a.get("source")), _resolve(a.get("target"))
    if not s or not t:
        return False, f"remove_connection: could not find '{a.get('source') if not s else a.get('target')}'"
    database.delete_edge(s.id, t.id)
    return True, f"Removed connection between **{s.title}** and **{t.title}**"


def _do_merge(a):
    keep, gone = _resolve(a.get("keep_id")), _resolve(a.get("remove_id"))
    if not keep or not gone:
        return False, f"merge_ideas: could not find '{a.get('keep_id') if not keep else a.get('remove_id')}'"
    if keep.id == gone.id:
        return False, "merge_ideas: keep_id and remove_id are the same project"
    by_name = {b.item.strip().lower(): b for b in keep.bom}
    for b in gone.bom:
        ex = by_name.get(b.item.strip().lower())
        if ex:
            ex.qty = max(ex.qty, b.qty)
        else:
            keep.bom.append(b)
    keep.tags = list(dict.fromkeys(keep.tags + gone.tags))
    edges = database.get_all_edges()
    database.save_or_update_idea(keep)
    for e in edges:
        if gone.id in (e.source, e.target):
            other = e.target if e.source == gone.id else e.source
            if other != keep.id:
                database.insert_edge(IdeaEdge(source=keep.id, target=other, weight=e.weight, relation_type=e.relation_type,
                                              description=e.description, shared_parts=e.shared_parts))
    _trash(gone.id)
    database.delete_idea(gone.id)
    return True, f"Merged **{gone.title}** into **{keep.title}**"


HANDLERS = {
    "delete_idea": _do_delete,
    "update_idea": _do_update,
    "add_connection": _do_connect,
    "remove_connection": _do_disconnect,
    "merge_ideas": _do_merge,
}


def run_actions(actions: List[Dict[str, Any]]) -> List[Tuple[bool, str]]:
    results = []
    for a in actions[:50]:
        handler = HANDLERS.get(str(a.get("action", "")).strip())
        if not handler:
            results.append((False, f"Unknown action '{a.get('action')}'"))
            continue
        try:
            results.append(handler(a))
        except Exception as e:
            results.append((False, f"{a.get('action')} failed: {type(e).__name__}: {e}"))
    return results


def process_response(text: str) -> Tuple[str, List[Tuple[bool, str]]]:
    """Executes any action block in an agent reply; returns (reply to show, results)."""
    clean, actions, err = extract_actions(text)
    if not actions and not err:
        return text, []
    results = run_actions(actions)
    if err:
        results.append((False, err))
    summary = "\n".join(f"> {'✅' if ok else '⚠️'} {msg}" for ok, msg in results)
    return f"{clean}\n\n> 🐿️ **SquirrelMap actions**\n{summary}".strip(), results
