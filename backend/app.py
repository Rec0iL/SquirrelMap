import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any, List

from backend.models import (
    IdeaNode, IdeaEdge, GraphData, BOMSummary,
    IdeaBrainstormRequest, FuseIdeasRequest, SplitIdeaRequest,
    McpChatRequest
)
from backend import database
from backend.graph_engine import engine
from backend.antigravity_client import antigravity_client

# Initialize database & sync markdown files on disk
database.init_db()
engine.reload_graph()

app = FastAPI(title="Creative Idea Mindmap API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {
        "status": "online",
        "app": "Creative Idea Mindmap",
        "ideas_count": len(engine.ideas_map),
        "connections_count": engine.graph.number_of_edges(),
        "categories_count": len(engine.categories)
    }

@app.get("/api/graph", response_model=GraphData)
async def get_graph(category: Optional[str] = Query(None, description="Category filter")):
    engine.reload_graph()
    return engine.get_graph_data(category_filter=category)

@app.get("/api/ideas", response_model=List[IdeaNode])
async def list_ideas(category: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None):
    ideas = database.get_all_ideas()
    if category and category.lower() != "all":
        ideas = [i for i in ideas if i.category.lower() == category.lower()]
    if status and status.lower() != "all":
        ideas = [i for i in ideas if i.status.lower() == status.lower()]
    if q:
        wild = q.lower()
        ideas = [i for i in ideas if wild in i.title.lower() or wild in i.description.lower() or any(wild in t.lower() for t in i.tags)]
    return ideas

@app.get("/api/ideas/{idea_id}", response_model=IdeaNode)
async def get_idea(idea_id: str):
    idea = database.get_idea_by_id(idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    return idea

@app.post("/api/ideas")
async def save_or_update_idea_endpoint(idea: IdeaNode):
    saved = database.save_or_update_idea(idea)
    engine.reload_graph()
    return {"success": True, "idea": saved}

@app.delete("/api/ideas/{idea_id}")
async def delete_idea_endpoint(idea_id: str):
    success = database.delete_idea(idea_id)
    engine.reload_graph()
    return {"success": success}

@app.post("/api/edges")
async def create_edge_endpoint(edge: IdeaEdge):
    success = database.insert_edge(edge)
    engine.reload_graph()
    return {"success": success}

@app.delete("/api/edges")
async def delete_edge_endpoint(source: str = Query(...), target: str = Query(...)):
    success = database.delete_edge(source, target)
    engine.reload_graph()
    return {"success": success}

@app.get("/api/bom/summary", response_model=BOMSummary)
async def get_bom_summary(idea_ids: Optional[str] = Query(None)):
    id_list = [i.strip() for i in idea_ids.split(",") if i.strip()] if idea_ids else None
    return database.get_bom_aggregation(idea_ids=id_list)

@app.get("/api/similarity/{idea_id}")
async def get_similarities(idea_id: str, limit: int = 6):
    return engine.find_similar_ideas(idea_id, limit=limit)

@app.post("/api/ai/propose-link")
async def propose_link_endpoint(payload: Dict[str, Any]):
    source_id = payload.get("source")
    target_id = payload.get("target")
    use_ai = payload.get("use_ai", False)
    model = payload.get("model")

    if not source_id or not target_id:
        raise HTTPException(status_code=400, detail="Both source and target IDs are required")

    s1 = engine.ideas_map.get(source_id)
    s2 = engine.ideas_map.get(target_id)
    if not s1 or not s2:
        raise HTTPException(status_code=404, detail="Idea not found")

    proposal = engine.propose_link_details(source_id, target_id)

    if use_ai:
        ai_res = await antigravity_client.evaluate_link(
            idea_a=s1.model_dump(),
            idea_b=s2.model_dump(),
            model=model
        )
        if ai_res.get("success") and ai_res.get("data"):
            d = ai_res["data"]
            if "relation_type" in d:
                proposal["relation_type"] = d["relation_type"]
            if "weight" in d:
                proposal["weight"] = round(float(d["weight"]), 2)
            if "description" in d:
                proposal["description"] = d["description"]
            if "shared_parts" in d and isinstance(d["shared_parts"], list):
                proposal["shared_parts"] = d["shared_parts"]
            proposal["ai_enhanced"] = True

    return proposal

@app.post("/api/ai/brainstorm")
async def brainstorm_endpoint(req: IdeaBrainstormRequest):
    result = await antigravity_client.brainstorm_idea(
        idea_prompt=req.idea,
        category=req.category,
        existing_categories=engine.categories,
        model=req.model
    )
    return result

@app.get("/api/ai/status")
async def ai_status():
    status = await antigravity_client.check_health()
    return status

@app.get("/api/ai/ollama-models")
async def get_ollama_models():
    try:
        import urllib.request
        import json
        req = urllib.request.Request("http://localhost:11434/api/tags", headers={"User-Agent": "SquirrelMap"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode())
            models = [m.get("name") for m in data.get("models", [])]
            return {"available": True, "models": models}
    except Exception as e:
        return {"available": False, "models": [], "error": str(e)}

@app.get("/api/ai/claude-models")
async def get_claude_models():
    import shutil
    import asyncio
    claude_bin = shutil.which("claude") or "/home/rec0il/.local/bin/claude"
    if not os.path.exists(claude_bin):
        return {
            "available": False,
            "version": None,
            "models": [],
            "error": "Claude CLI executable not found"
        }
    
    version_str = "Installed"
    try:
        proc = await asyncio.create_subprocess_exec(
            claude_bin, "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3.0)
        if proc.returncode == 0:
            version_str = stdout.decode().strip()
    except Exception:
        pass

    return {
        "available": True,
        "version": version_str,
        "models": [
            {"id": "sonnet", "name": "Claude Sonnet (Recommended)", "description": "High intelligence, coding & reasoning"},
            {"id": "haiku", "name": "Claude Haiku (Fast & Lightweight)", "description": "Ultra fast responses & low latency"},
            {"id": "opus", "name": "Claude Opus (Deep Reasoning)", "description": "Most capable for complex architectures"}
        ]
    }

@app.post("/api/mcp/chat")
async def mcp_chat_endpoint(req: McpChatRequest):
    message = (req.message or "").strip()
    if not message and not req.referenced_ideas:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if not message and req.referenced_ideas:
        message = "Please review and analyze this referenced project."

    result = await antigravity_client.chat_with_agent(
        message=message,
        history=[{"role": m.role, "content": m.content} for m in req.history],
        provider=req.provider or "agy",
        model=req.model,
        referenced_ideas=req.referenced_ideas,
        endpoint_url=req.endpoint_url,
        api_key=req.api_key
    )

    # Reload graph in case tools updated markdown files
    engine.reload_graph()

    return {
        "success": result.get("success", False),
        "response": result.get("response", ""),
        "provider": req.provider or "agy",
        "model": result.get("model", req.model),
        "error": result.get("error"),
        "stats": {
            "total_ideas": len(engine.ideas_map),
            "total_connections": engine.graph.number_of_edges(),
            "categories": engine.categories
        }
    }

# Mount static files for the frontend
custom_fe = os.environ.get("SQUIRRELMAP_FRONTEND_DIR")
if custom_fe and os.path.exists(custom_fe):
    FRONTEND_DIR = os.path.abspath(custom_fe)
elif getattr(sys, 'frozen', False):
    base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    FRONTEND_DIR = os.path.abspath(os.path.join(base_dir, "frontend"))
    if not os.path.exists(FRONTEND_DIR):
        FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(sys.executable), "..", "frontend"))
else:
    FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
