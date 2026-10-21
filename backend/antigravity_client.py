import asyncio
import json
import os
import shutil
import re
from typing import Optional, Dict, Any, List

class AntigravityClient:
    def __init__(self):
        self.cli_path = self._find_cli_path()
        self._active_process = None

    def _find_cli_path(self) -> Optional[str]:
        standard = os.path.expanduser("~/.local/bin/agy")
        if os.path.exists(standard) and os.access(standard, os.X_OK):
            return standard
        which_path = shutil.which("agy")
        if which_path:
            return which_path
        return None

    async def check_health(self) -> Dict[str, Any]:
        if not self.cli_path:
            return {
                "online": False,
                "error": "Antigravity CLI (agy) not found in ~/.local/bin/agy or PATH."
            }

        try:
            process = await asyncio.create_subprocess_exec(
                self.cli_path, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=5.0)
            if process.returncode == 0:
                version_str = stdout.decode().strip()
                return {
                    "online": True,
                    "version": version_str,
                    "cli_path": self.cli_path,
                    "models": [
                        "gemini-3.8-flash-low",
                        "gemini-3.8-flash-high",
                        "gemini-3.1-pro-high",
                        "gemini-3.7-flash-high",
                        "claude-sonnet-4-6",
                        "gpt-oss-120b-medium"
                    ]
                }
            else:
                return {
                    "online": False,
                    "error": stderr.decode().strip() or "CLI exited with non-zero status"
                }
        except Exception as e:
            return {"online": False, "error": str(e)}

    async def brainstorm_idea(
        self,
        idea_prompt: str,
        category: Optional[str] = None,
        existing_categories: Optional[List[str]] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Expands an informal idea into a structured project node with category, tags, BOM, and markdown."""
        if not self.cli_path:
            return {"success": False, "error": "Antigravity CLI (agy) not found"}

        selected_model = model or "gemini-3.8-flash-low"
        cats_str = ", ".join(existing_categories) if existing_categories else "General"
        
        if category:
            cat_guidance = f"The user requested category: '{category}'. Use this or refine it."
        else:
            cat_guidance = (
                f"Existing categories in this mindmap: [{cats_str}]. "
                "You have full creative authority to either select an existing category if it is a natural fit, "
                "OR CREATE A BRAND NEW CATEGORY (e.g. 'Robotics', 'Audio Synthesizers', 'Optics & Lasers', 'Biotech', 'Wearables', 'Woodworking') "
                "if this project opens a new domain or theme."
            )

        prompt = f"""You are the Creative Idea Mindmap Architect.
The user wants to add an idea/project to their creative mindmap:
"{idea_prompt}"

Category Instructions:
{cat_guidance}

Respond ONLY with valid JSON matching this schema:
{{
  "id": "kebab-case-slug",
  "title": "Clean Descriptive Project Title",
  "category": "Category Name",
  "status": "concept" | "prototyping" | "in-progress" | "completed",
  "description": "1-2 sentence overview",
  "tags": ["tag1", "tag2", "tag3"],
  "bom": [
    {{
      "item": "Specific Component or Material Name",
      "qty": 1,
      "notes": "Purpose in this project"
    }}
  ],
  "markdown_content": "# Clean Descriptive Project Title\\n\\n## Concept & Objectives\\nDetailed notes...\\n\\n## Key Features\\n- ...\\n\\n## Assembly & Implementation Plan\\n..."
}}"""

        cmd = [
            self.cli_path,
            "-p", prompt,
            "--model", selected_model,
            "--disable-slash-commands"
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60.0)

            if process.returncode != 0:
                return {"success": False, "error": stderr.decode().strip() or "CLI error"}

            raw_output = stdout.decode().strip()
            cleaned = re.sub(r"^```json\s*", "", raw_output, flags=re.MULTILINE)
            cleaned = re.sub(r"^```\s*", "", cleaned, flags=re.MULTILINE)
            cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()

            json_match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
            if json_match:
                cleaned = json_match.group(1)

            parsed = json.loads(cleaned)
            return {
                "success": True,
                "data": parsed,
                "model": selected_model
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def evaluate_link(
        self,
        idea_a: Dict[str, Any],
        idea_b: Dict[str, Any],
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyzes connection and shared parts between two ideas."""
        if not self.cli_path:
            return {"success": False, "error": "Antigravity CLI not found"}

        selected_model = model or "gemini-3.8-flash-low"

        prompt = f"""Analyze the creative/engineering connection between two mindmap ideas:

Project A: {idea_a.get('title')} ({idea_a.get('category')}): {idea_a.get('description')}
BOM A: {json.dumps(idea_a.get('bom', []))}

Project B: {idea_b.get('title')} ({idea_b.get('category')}): {idea_b.get('description')}
BOM B: {json.dumps(idea_b.get('bom', []))}

Determine:
1. 'relation_type': 'shared_bom' | 'synergy' | 'depends_on' | 'subproject' | 'related'
2. 'shared_parts': array of component names that can be bought together or shared
3. 'weight': float 0.1 to 1.0 (strength of synergy)
4. 'description': 1-2 concise sentences explaining why they connect and any bulk-buy opportunity.

Respond ONLY with valid JSON:
{{
  "relation_type": "shared_bom" | "synergy" | "depends_on" | "subproject" | "related",
  "shared_parts": ["part1"],
  "weight": 0.8,
  "description": "Explanation..."
}}"""

        cmd = [
            self.cli_path,
            "-p", prompt,
            "--model", selected_model,
            "--disable-slash-commands"
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30.0)

            if process.returncode == 0:
                raw_output = stdout.decode().strip()
                cleaned = re.sub(r"^```json\s*", "", raw_output, flags=re.MULTILINE)
                cleaned = re.sub(r"^```\s*", "", cleaned, flags=re.MULTILINE)
                cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()
                json_match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
                if json_match:
                    cleaned = json_match.group(1)
                data = json.loads(cleaned)
                return {"success": True, "data": data}
        except Exception as e:
            return {"success": False, "error": str(e)}

        return {"success": False, "error": "Link evaluation failed"}

    async def chat_with_mcp(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
        model: Optional[str] = None,
        referenced_ideas: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        return await self.chat_with_agent(
            message=message,
            history=history,
            provider="agy",
            model=model,
            referenced_ideas=referenced_ideas
        )

    async def chat_with_agent(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
        provider: str = "agy",
        model: Optional[str] = None,
        referenced_ideas: Optional[List[Dict[str, Any]]] = None,
        endpoint_url: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Unified multi-agent interface supporting AGY, Claude, Codex, Ollama, OpenCode, and Custom Agents."""
        provider = (provider or "agy").lower()

        # Build Context & Prompt
        system_instruction = """You are the Creative Mindmap AI Partner.
Your job is to manage, connect, organize, and expand the user's creative ideas and maker projects.
Each project has a Markdown file, frontmatter metadata, a Bill of Materials (BOM), and connections.
You help brainstorm, audit BOM parts for bulk purchasing synergies, link related projects, and curate ideas.
You have full authority to suggest or create new project categories whenever ideas branch into new topics or domains. In SquirrelMap, categories are open-ended and dynamically generated from the projects.
Always be concise, practical, creative, and reference specific components and connections."""

        referenced_context = ""
        if referenced_ideas:
            ref_texts = []
            for r in referenced_ideas:
                title = r.get("title", "Untitled")
                category = r.get("category", "General")
                status = r.get("status", "concept")
                desc = r.get("description", "")
                tags = ", ".join(r.get("tags", []))
                bom_items = ", ".join([f"{b.get('item')} (x{b.get('qty', 1)})" for b in r.get("bom", [])]) or "None"
                ref_texts.append(
                    f"--- Referenced Context Project: {title} ---\n"
                    f"Category: {category} | Status: {status} | Tags: {tags}\n"
                    f"Description: {desc}\n"
                    f"Bill of Materials (BOM): {bom_items}"
                )
            referenced_context = "USER REFERENCED CONTEXT PROJECTS (The user tagged these cards):\n" + "\n\n".join(ref_texts) + "\n\n"

        history_context = ""
        if history:
            recent = history[-6:]
            formatted_turns = []
            for h in recent:
                role = "User" if h.get("role") == "user" else "Assistant"
                formatted_turns.append(f"{role}: {h.get('content', '')}")
            if formatted_turns:
                history_context = "Conversation history:\n" + "\n".join(formatted_turns) + "\n\n"

        full_prompt = f"{system_instruction}\n\n{referenced_context}{history_context}User: {message}\nAssistant:"

        # -------------------------------------------------------------
        # 1. PROVIDER: Antigravity (AGY)
        # -------------------------------------------------------------
        if provider == "agy":
            if not self.cli_path:
                return {"success": False, "error": "Antigravity CLI (agy) not found in PATH"}

            selected_model = model or "gemini-3.8-flash-low"
            cmd = [
                self.cli_path,
                "-p", full_prompt,
                "--model", selected_model,
                "--disable-slash-commands"
            ]
            try:
                proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90.0)
                if proc.returncode == 0:
                    return {"success": True, "response": stdout.decode().strip(), "model": selected_model, "provider": "agy"}
                return {"success": False, "error": stderr.decode().strip() or "AGY process error", "model": selected_model}
            except Exception as e:
                return {"success": False, "error": f"AGY execution failed: {str(e)}"}

        # -------------------------------------------------------------
        # 2. PROVIDER: Anthropic Claude (Claude Code CLI or API)
        # -------------------------------------------------------------
        elif provider == "claude":
            claude_bin = shutil.which("claude") or "/home/rec0il/.local/bin/claude"
            raw_model = (model or "sonnet").lower().strip()
            if "haiku" in raw_model:
                claude_model_arg = "haiku"
            elif "opus" in raw_model:
                claude_model_arg = "opus"
            elif "sonnet" in raw_model or "claude" in raw_model or not raw_model or raw_model == "default":
                claude_model_arg = "sonnet"
            else:
                claude_model_arg = raw_model

            selected_model = claude_model_arg
            if os.path.exists(claude_bin):
                cmd = [claude_bin, "--model", claude_model_arg, "-p", full_prompt]
                try:
                    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90.0)
                    if proc.returncode == 0:
                        return {"success": True, "response": stdout.decode().strip(), "model": selected_model, "provider": "claude"}
                    return {"success": False, "error": stderr.decode().strip() or "Claude CLI returned error", "model": selected_model}
                except Exception as e:
                    return {"success": False, "error": f"Claude CLI error: {str(e)}"}
            return {"success": False, "error": "Claude executable not found"}

        # -------------------------------------------------------------
        # 3. PROVIDER: Local Ollama
        # -------------------------------------------------------------
        elif provider == "ollama":
            url = endpoint_url or "http://localhost:11434/api/chat"
            selected_model = model or "llama3.1:8b"
            ollama_messages = [{"role": "system", "content": f"{system_instruction}\n\n{referenced_context}"}]
            if history:
                for h in history[-6:]:
                    ollama_messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
            ollama_messages.append({"role": "user", "content": message})

            payload = {
                "model": selected_model,
                "messages": ollama_messages,
                "stream": False
            }
            try:
                import urllib.request
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "SquirrelMap"}
                )
                loop = asyncio.get_event_loop()
                def do_request():
                    with urllib.request.urlopen(req, timeout=90.0) as resp:
                        return json.loads(resp.read().decode())
                data = await loop.run_in_executor(None, do_request)
                resp_text = data.get("message", {}).get("content", "")
                return {"success": True, "response": resp_text, "model": selected_model, "provider": "ollama"}
            except Exception as e:
                return {"success": False, "error": f"Ollama connection error: {str(e)}. Ensure Ollama is running at {url}."}

        # -------------------------------------------------------------
        # 4. PROVIDER: OpenCode
        # -------------------------------------------------------------
        elif provider == "opencode":
            opencode_bin = shutil.which("opencode") or "/home/rec0il/.opencode/bin/opencode"
            selected_model = model or "opencode-default"
            if os.path.exists(opencode_bin):
                cmd = [opencode_bin, "run", "--format", "default", full_prompt]
                try:
                    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90.0)
                    if proc.returncode == 0:
                        out = stdout.decode().strip()
                        return {"success": True, "response": out, "model": selected_model, "provider": "opencode"}
                    return {"success": False, "error": stderr.decode().strip() or "OpenCode returned error"}
                except Exception as e:
                    return {"success": False, "error": f"OpenCode execution error: {str(e)}"}
            return {"success": False, "error": "OpenCode executable not found"}

        # -------------------------------------------------------------
        # 5. PROVIDER: OpenAI Codex / GPT or Custom Agent Endpoint
        # -------------------------------------------------------------
        elif provider in ["codex", "custom"]:
            url = endpoint_url or "https://api.openai.com/v1/chat/completions"
            selected_model = model or ("gpt-4o" if provider == "codex" else "custom-model")
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            messages = [{"role": "system", "content": f"{system_instruction}\n\n{referenced_context}"}]
            if history:
                for h in history[-6:]:
                    messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
            messages.append({"role": "user", "content": message})

            payload = {
                "model": selected_model,
                "messages": messages,
                "temperature": 0.7
            }
            try:
                import urllib.request
                req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
                loop = asyncio.get_event_loop()
                def do_request():
                    with urllib.request.urlopen(req, timeout=90.0) as resp:
                        return json.loads(resp.read().decode())
                data = await loop.run_in_executor(None, do_request)
                resp_text = data["choices"][0]["message"]["content"]
                return {"success": True, "response": resp_text, "model": selected_model, "provider": provider}
            except Exception as e:
                return {"success": False, "error": f"{provider.capitalize()} API error: {str(e)}"}

        return {"success": False, "error": f"Unknown agent provider: {provider}"}

antigravity_client = AntigravityClient()
