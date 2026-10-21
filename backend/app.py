import os
import sys
from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any, List

from backend.models import (
    IdeaNode, IdeaEdge, GraphData, BOMSummary,
    IdeaBrainstormRequest, FuseIdeasRequest, SplitIdeaRequest,
    McpChatRequest, ChatSessionSave
)
from backend import database
from backend.graph_engine import engine
from backend.antigravity_client import antigravity_client
from backend import whisper_service

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
    print(f"\n[API /api/ai/brainstorm] Idea: '{req.idea[:80]}...', Model: {req.model}, Category: {req.category}", flush=True)
    result = await antigravity_client.brainstorm_idea(
        idea_prompt=req.idea,
        category=req.category,
        existing_categories=engine.categories,
        model=req.model
    )
    if result.get("success"):
        print(f"[API /api/ai/brainstorm] Success (attempts: {result.get('attempts', 1)})", flush=True)
    else:
        print(f"[API /api/ai/brainstorm] Failed: {result.get('error')}", flush=True)
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

@app.get("/api/whisper/status")
async def whisper_status_endpoint():
    return whisper_service.is_whisper_available()

@app.post("/api/whisper/transcribe")
async def whisper_transcribe_endpoint(file: UploadFile = File(...), model: Optional[str] = Query("base")):
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio recording submitted")
    print(f"\n[API /api/whisper/transcribe] Received {file.filename} ({len(audio_bytes)} bytes)...", flush=True)
    res = await whisper_service.transcribe_audio_file(
        file_bytes=audio_bytes,
        original_filename=file.filename,
        model_name=model or "base"
    )
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error", "Whisper transcription failed"))
    return res

@app.get("/api/whisper/audio/{filename}")
async def whisper_audio_endpoint(filename: str):
    safe_name = os.path.basename(filename)
    audio_path = os.path.join(whisper_service.get_audio_dir(), safe_name)
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio recording not found")
    media_type = "audio/webm"
    if safe_name.endswith(".ogg"):
        media_type = "audio/ogg"
    elif safe_name.endswith(".wav"):
        media_type = "audio/wav"
    elif safe_name.endswith(".mp3"):
        media_type = "audio/mpeg"
    return FileResponse(audio_path, media_type=media_type)

@app.post("/api/mcp/chat")
async def mcp_chat_endpoint(req: McpChatRequest):
    try:
        return await _mcp_chat_impl(req)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "response": "", "created_idea": None, "error": f"Internal error: {type(e).__name__}: {e}"}

async def _mcp_chat_impl(req: McpChatRequest):
    message = (req.message or "").strip()
    if not message and not req.referenced_ideas:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if not message and req.referenced_ideas:
        message = "Please review and analyze this referenced project."

    voice_tag = " [VOICE-TRANSCRIBED]" if req.is_voice else ""
    print(f"\n[API /api/mcp/chat] Incoming message{voice_tag}: '{message[:80]}...' (provider: {req.provider or 'agy'}, model: {req.model}, refs: {len(req.referenced_ideas or [])})", flush=True)

    result = await antigravity_client.chat_with_agent(
        message=message,
        history=[{"role": m.role, "content": m.content} for m in req.history],
        provider=req.provider or "agy",
        model=req.model,
        referenced_ideas=req.referenced_ideas,
        endpoint_url=req.endpoint_url,
        api_key=req.api_key,
        is_voice=req.is_voice
    )

    created_idea = None
    if result.get("success"):
        resp_len = len(result.get("response", ""))
        attempts = result.get("attempts", 1)
        print(f"[API /api/mcp/chat] Success (attempts: {attempts}, len: {resp_len} chars)", flush=True)

        # Auto-detect and save project notes drafted with YAML frontmatter
        extracted = database.extract_idea_from_text(result.get("response", ""))
        if extracted:
            try:
                idea_obj = IdeaNode(**extracted)
                database.save_or_update_idea(idea_obj)
                created_idea = idea_obj.model_dump()
                print(f"[API /api/mcp/chat] Auto-saved parsed project note: '{idea_obj.title}' ({idea_obj.id})", flush=True)
            except Exception as save_err:
                print(f"[API /api/mcp/chat] Note auto-save warning: {save_err}", flush=True)
    else:
        err = result.get("error", "Unknown error")
        print(f"[API /api/mcp/chat] Failure: {err}", flush=True)

    # Reload graph in case tools updated markdown files
    engine.reload_graph()

    return {
        "success": result.get("success", False),
        "response": result.get("response", ""),
        "created_idea": created_idea,
        "provider": req.provider or "agy",
        "model": result.get("model", req.model),
        "attempts": result.get("attempts", 1),
        "error": result.get("error"),
        "stats": {
            "total_ideas": len(engine.ideas_map),
            "total_connections": engine.graph.number_of_edges(),
            "categories": engine.categories
        }
    }

import re as _re

_CHAT_ID_RE = _re.compile(r"^[A-Za-z0-9_-]{1,64}$")

def _check_chat_id(chat_id: str):
    if not _CHAT_ID_RE.match(chat_id):
        raise HTTPException(status_code=400, detail="Invalid chat id")

@app.get("/api/chats")
async def list_chats_endpoint():
    return database.list_chat_sessions()

@app.get("/api/chats/{chat_id}")
async def get_chat_endpoint(chat_id: str):
    _check_chat_id(chat_id)
    sess = database.get_chat_session(chat_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Chat not found")
    return sess

@app.put("/api/chats/{chat_id}")
async def save_chat_endpoint(chat_id: str, body: ChatSessionSave):
    _check_chat_id(chat_id)
    database.save_chat_session(chat_id, body.title[:200] or "Untitled chat", body.provider, body.model, body.messages, body.history)
    return {"success": True}

@app.delete("/api/chats/{chat_id}")
async def delete_chat_endpoint(chat_id: str):
    _check_chat_id(chat_id)
    messages = database.delete_chat_session(chat_id)
    if messages is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    # Remove voice recordings that belonged to this chat
    audio_dir = whisper_service.get_audio_dir()
    for m in messages:
        url = m.get("audioUrl") if isinstance(m, dict) else None
        if url:
            path = os.path.join(audio_dir, os.path.basename(url))
            try:
                if os.path.isfile(path):
                    os.remove(path)
            except OSError:
                pass
    return {"success": True}

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
