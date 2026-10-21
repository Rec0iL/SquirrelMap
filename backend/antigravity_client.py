import asyncio
import json
import os
import shutil
import re
from typing import Optional, Dict, Any, List

from backend.database import DATA_DIR as _DB_DATA_DIR, IDEAS_DIR
from backend.whisper_service import _get_clean_subprocess_env

# DATA_DIR may be unset (dev mode); fall back to the ideas folder's parent
DATA_DIR = _DB_DATA_DIR or os.path.dirname(IDEAS_DIR)

VALID_AGY_MODELS = [
    "gemini-3.8-flash-low",
    "gemini-3.8-flash-medium",
    "gemini-3.8-flash-high",
    "gemini-4-argon-low",
    "gemini-4-argon-medium",
    "gemini-4-argon-high",
    "claude-sonnet-5-5-medium",
    "claude-opus-5-5-high",
    "gpt-oss-120b-medium"
]

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

    def _normalize_agy_model(self, model: Optional[str]) -> str:
        if not model:
            return "gemini-3.8-flash-low"
        m = model.strip().lower()
        if m in VALID_AGY_MODELS:
            return m
        if "sonnet" in m:
            return "claude-sonnet-5-5-medium"
        if "opus" in m:
            return "claude-opus-5-5-high"
        if "argon" in m:
            if "high" in m:
                return "gemini-4-argon-high"
            if "low" in m:
                return "gemini-4-argon-low"
            return "gemini-4-argon-medium"
        if "3.8" in m:
            if "high" in m:
                return "gemini-3.8-flash-high"
            if "medium" in m or "med" in m:
                return "gemini-3.8-flash-medium"
            return "gemini-3.8-flash-low"
        if "high" in m or "pro" in m:
            return "gemini-3.8-flash-high"
        if "gpt" in m or "oss" in m:
            return "gpt-oss-120b-medium"
        return "gemini-3.8-flash-low"

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
                    "models": VALID_AGY_MODELS,
                    "default_model": "gemini-3.8-flash-low"
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
        """Expands an informal idea into a structured project node with category, tags, BOM, and markdown.
        Automatically self-corrects and retries if execution fails or invalid JSON is produced."""
        if not self.cli_path:
            return {"success": False, "error": "Antigravity CLI (agy) not found in PATH"}

        selected_model = self._normalize_agy_model(model)
        cats_str = ", ".join(existing_categories) if existing_categories else "General"
        
        cat_guidance = ""
        if category and category.strip():
            cat_guidance = f'The user preferred category is: "{category.strip()}". Use this category or a refined version.'
        else:
            cat_guidance = (
                f"Existing categories in the mindmap: [{cats_str}].\n"
                "You are FREE and encouraged to assign one of these existing categories OR invent a fresh, distinct category "
                "if this project opens a new domain or theme."
            )

        base_prompt = f"""You are the Creative Idea Mindmap Architect.
The user wants to add an idea/project to their creative mindmap:
"{idea_prompt}"

Category Instructions:
{cat_guidance}

Respond ONLY with valid JSON matching this schema:
{{
  "title": "Descriptive Project Name",
  "category": "Category Name",
  "description": "Concise 2-3 sentence overview of what this project does and why it is cool.",
  "tags": ["tag1", "tag2", "tag3"],
  "bom": [
    {{"item": "Component or Material name", "qty": 1, "specs": "Key specification (e.g. 5V 2A, 10k resistor)"}},
    {{"item": "Another part", "qty": 2, "specs": "..."}}
  ],
  "markdown_content": "# Clean Descriptive Project Title\n\n## Concept & Objectives\nDetailed notes...\n\n## Key Features\n- ...\n\n## Assembly & Implementation Plan\n..."
}}"""

        current_prompt = base_prompt
        last_error = None
        max_attempts = 3

        for attempt in range(1, max_attempts + 1):
            cmd = [
                self.cli_path,
                "-p", current_prompt,
                "--model", selected_model,
                "--disable-slash-commands"
            ]

            try:
                print(f"[Brainstorm ({selected_model}) Attempt {attempt}/{max_attempts}]: starting execution...", flush=True)
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    cwd=DATA_DIR,
                    env=_get_clean_subprocess_env(),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=90.0)

                raw_output = stdout.decode().strip()
                err_output = stderr.decode().strip()

                if process.returncode != 0:
                    last_error = err_output or raw_output or f"CLI returned exit code {process.returncode}"
                    print(f"[Brainstorm Attempt {attempt}/{max_attempts} Failed]: {last_error}", flush=True)

                    if "invalid model selection" in last_error or "not recognized as a known model" in last_error:
                        selected_model = "gemini-3.8-flash-low"
                        current_prompt = (
                            f"{base_prompt}\n\n"
                            f"[SYSTEM SELF-CORRECTION: Previous model selection was rejected by CLI. "
                            f"Falling back to gemini-3.8-flash-low. Return valid JSON only.]"
                        )
                    elif attempt < max_attempts:
                        current_prompt = (
                            f"{base_prompt}\n\n"
                            f"[SYSTEM SELF-CORRECTION (Attempt {attempt}/{max_attempts})]: Previous execution attempt failed with error: {last_error}. "
                            f"Diagnose this error, avoid the failure condition, and output ONLY valid JSON.]"
                        )
                    if attempt < max_attempts:
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": f"Brainstorm execution failed after {max_attempts} attempts: {last_error}"}

                if not raw_output:
                    last_error = err_output or "CLI returned empty output"
                    print(f"[Brainstorm Attempt {attempt}/{max_attempts} Empty]: {last_error}", flush=True)
                    if attempt < max_attempts:
                        current_prompt = (
                            f"{base_prompt}\n\n"
                            f"[SYSTEM SELF-CORRECTION: Previous attempt returned empty response. "
                            f"Generate the full requested JSON project schema immediately.]"
                        )
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": "Agent returned empty response."}

                cleaned = re.sub(r"^```json\s*", "", raw_output, flags=re.MULTILINE)
                cleaned = re.sub(r"^```\s*", "", cleaned, flags=re.MULTILINE)
                cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()

                json_match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
                if json_match:
                    cleaned = json_match.group(1)

                try:
                    parsed = json.loads(cleaned)
                    print(f"[Brainstorm Success]: Generated {parsed.get('title')} on attempt {attempt}", flush=True)
                    return {
                        "success": True,
                        "data": parsed,
                        "model": selected_model,
                        "attempts": attempt
                    }
                except json.JSONDecodeError as jde:
                    last_error = f"JSON parse error: {str(jde)}"
                    print(f"[Brainstorm Attempt {attempt}/{max_attempts} JSON Error]: {last_error}", flush=True)
                    if attempt < max_attempts:
                        current_prompt = (
                            f"{base_prompt}\n\n"
                            f"[SYSTEM SELF-CORRECTION: Your previous output was not valid JSON ({str(jde)}). "
                            f"Raw output snippet:\n{raw_output[:250]}\n"
                            f"Please fix any unescaped quotes or missing brackets, and return strictly valid JSON ONLY.]"
                        )
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": f"Failed to parse AI JSON response after {max_attempts} attempts: {str(jde)}"}

            except asyncio.TimeoutError:
                last_error = "Brainstorm CLI command timed out after 90 seconds"
                print(f"[Brainstorm Attempt {attempt} Timeout]", flush=True)
                if attempt < max_attempts:
                    current_prompt = (
                        f"{base_prompt}\n\n"
                        f"[SYSTEM SELF-CORRECTION: Generation timed out. Please provide a more concise and direct JSON response.]"
                    )
                    await asyncio.sleep(1.0)
                    continue
                return {"success": False, "error": last_error}
            except Exception as e:
                last_error = str(e)
                print(f"[Brainstorm Attempt {attempt} Exception]: {last_error}", flush=True)
                if attempt < max_attempts:
                    await asyncio.sleep(1.0)
                    continue
                return {"success": False, "error": f"Brainstorm error: {last_error}"}

        return {"success": False, "error": last_error or "Unknown error"}

    async def evaluate_link(
        self,
        idea_a: Dict[str, Any],
        idea_b: Dict[str, Any],
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyzes connection and shared parts between two ideas."""
        if not self.cli_path:
            return {"success": False, "error": "Antigravity CLI not found"}

        selected_model = self._normalize_agy_model(model)

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
        api_key: Optional[str] = None,
        is_voice: Optional[bool] = False
    ) -> Dict[str, Any]:
        """Unified multi-agent interface supporting AGY, Claude, Codex, Ollama, OpenCode, and Custom Agents.
        Includes an automated 3-attempt diagnostic self-correction loop when errors or empty outputs occur."""
        provider = (provider or "agy").lower()

        # Build Context & Base Prompt
        user_vault = os.path.expanduser("~/SquirrelMap")
        system_instruction = f"""You are the Creative Mindmap AI Partner.
Your job is to manage, connect, organize, and expand the user's creative ideas and maker projects.
Each project has a Markdown file, frontmatter metadata, a Bill of Materials (BOM), and connections.
You help brainstorm, audit BOM parts for bulk purchasing synergies, link related projects, and curate ideas.
You have full authority to suggest or create new project categories whenever ideas branch into new topics or domains. In SquirrelMap, categories are open-ended and dynamically generated from the projects.

WORKING DIRECTORY & PROJECT VAULT:
Your working directory is: {DATA_DIR}
Project Markdown files are stored in: {IDEAS_DIR} (read-only for you; do not modify it).

WHEN THE USER ASKS YOU TO CREATE, ADD, OR STASH A PROJECT:
1. Always format your project note with full YAML frontmatter and structured markdown:
---
title: Project Title
status: concept
category: Category Name
tags: [tag1, tag2]
connections: []
---

# Project Title
1-2 sentence overview and objectives.

## Features
- Key bulleted features

## BOM
| Item | Qty | Notes |
| --- | --- | --- |

2. Do NOT try to write or edit any files yourself. SquirrelMap saves and indexes the project automatically from your reply.
3. Always include the complete Markdown block (with YAML frontmatter) in your response, wrapped in a ```markdown code fence.
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

        voice_directive = ""
        if is_voice:
            voice_directive = """
[VOICE TRANSCRIPTION DIRECTIVE - WHISPER SPEECH-TO-PROJECT SYNTHESIS]
The user message below was transcribed from a spoken recording using Whisper AI.
Spoken descriptions are naturally loosely structured, full of tangents, side notes, and stream-of-consciousness brainstorming.
Your task is to:
1. STRUCTURE INTO A PROPER PROJECT:
   - Identify the primary project concept and give it a crisp, memorable Project Title.
   - Suggest or assign a fitting Category (from existing categories or invent a fresh one if it breaks new ground).
   - Core Concept & Objectives: Summarize what the user is trying to build.
   - Key Features: Organized, bulleted list of functionality.
   - Implementation / Prototyping Roadmap: Practical steps to assemble or code it.
   - Preliminary Bill of Materials (BOM): List specific parts, sensors, modules, mechanical hardware, or materials mentioned or implied.
2. EXTRACT OPEN QUESTIONS, ISSUES & TANGENTS:
   At the very end of your response, create a dedicated markdown section:
   ### ❓ Open Questions, Tangents & Unresolved Ideas
   Extract and highlight every tangent, unresolved doubt, alternative direction, or question the user mentioned during their speech, and provide your constructive recommendation or resolution for each one.
"""

        base_prompt = f"{system_instruction}\n{voice_directive}\n\n{referenced_context}{history_context}User: {message}\nAssistant:"
        current_prompt = base_prompt
        last_error = None
        max_attempts = 3

        # -------------------------------------------------------------
        # 1. PROVIDER: Antigravity (AGY)
        # -------------------------------------------------------------
        if provider == "agy":
            if not self.cli_path:
                return {"success": False, "error": "Antigravity CLI (agy) not found in PATH"}

            selected_model = self._normalize_agy_model(model)

            for attempt in range(1, max_attempts + 1):
                cmd = [
                    self.cli_path,
                    "-p", current_prompt,
                    "--model", selected_model,
                    "--disable-slash-commands"
                ]

                print(f"[chat_with_agent:agy] Attempt {attempt}/{max_attempts} with model '{selected_model}'...", flush=True)

                try:
                    proc = await asyncio.create_subprocess_exec(
                        *cmd,
                        cwd=DATA_DIR,
                        env=_get_clean_subprocess_env(),
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90.0)
                    raw_out = stdout.decode().strip()
                    err_out = stderr.decode().strip()

                    if proc.returncode != 0:
                        last_error = err_out or raw_out or f"AGY process exited with code {proc.returncode}"
                        print(f"[chat_with_agent:agy] Attempt {attempt} failed: {last_error}", flush=True)

                        # Detect invalid model selection and automatically fall back
                        if "invalid model selection" in last_error or "not recognized as a known model" in last_error:
                            print(f"[chat_with_agent:agy] Falling back from '{selected_model}' to 'gemini-3.8-flash-low'", flush=True)
                            selected_model = "gemini-3.8-flash-low"
                            current_prompt = (
                                f"{base_prompt}\n\n"
                                f"[SYSTEM SELF-CORRECTION: Model selection failed ({last_error}). "
                                f"Switched to 'gemini-3.8-flash-low'. Please answer the user.]"
                            )
                        elif attempt < max_attempts:
                            current_prompt = (
                                f"{base_prompt}\n\n"
                                f"[SYSTEM SELF-CORRECTION (Attempt {attempt}/{max_attempts})]: Previous execution error: {last_error}. "
                                f"Diagnose this error, resolve the issue, and provide the complete response to the user.]"
                            )
                        if attempt < max_attempts:
                            await asyncio.sleep(1.0)
                            continue
                        return {"success": False, "error": f"AGY execution failed after {max_attempts} attempts: {last_error}", "model": selected_model}

                    if not raw_out:
                        last_error = err_out or "AGY returned empty output (stdout was empty)"
                        print(f"[chat_with_agent:agy] Attempt {attempt} returned empty output", flush=True)
                        if attempt < max_attempts:
                            current_prompt = (
                                f"{base_prompt}\n\n"
                                f"[SYSTEM SELF-CORRECTION: Your previous execution completed without output. "
                                f"Please provide your full, direct response to the user now.]"
                            )
                            await asyncio.sleep(1.0)
                            continue
                        return {"success": False, "error": f"AGY returned empty response after {max_attempts} attempts.", "model": selected_model}

                    # Success!
                    print(f"[chat_with_agent:agy] Success on attempt {attempt} ({len(raw_out)} chars)", flush=True)
                    return {
                        "success": True,
                        "response": raw_out,
                        "model": selected_model,
                        "provider": "agy",
                        "attempts": attempt
                    }

                except asyncio.TimeoutError:
                    last_error = "AGY command timed out after 90 seconds"
                    print(f"[chat_with_agent:agy] Attempt {attempt} timed out", flush=True)
                    if attempt < max_attempts:
                        current_prompt = (
                            f"{base_prompt}\n\n"
                            f"[SYSTEM SELF-CORRECTION: Previous request timed out. Please answer concisely.]"
                        )
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": last_error, "model": selected_model}
                except Exception as e:
                    last_error = str(e)
                    print(f"[chat_with_agent:agy] Attempt {attempt} exception: {last_error}", flush=True)
                    if attempt < max_attempts:
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": f"AGY execution error: {last_error}", "model": selected_model}

            return {"success": False, "error": last_error or "Unknown AGY error", "model": selected_model}

        # -------------------------------------------------------------
        # 2. PROVIDER: Anthropic Claude (Claude Code CLI or API)
        # -------------------------------------------------------------
        elif provider == "claude":
            claude_bin = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
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
            if not os.path.exists(claude_bin):
                return {"success": False, "error": "Claude executable not found at ~/.local/bin/claude or in PATH"}

            for attempt in range(1, max_attempts + 1):
                cmd = [claude_bin, "--model", claude_model_arg, "-p", current_prompt]
                print(f"[chat_with_agent:claude] Attempt {attempt}/{max_attempts} with model '{selected_model}'...", flush=True)

                try:
                    proc = await asyncio.create_subprocess_exec(*cmd, cwd=DATA_DIR, env=_get_clean_subprocess_env(), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90.0)
                    raw_out = stdout.decode().strip()
                    err_out = stderr.decode().strip()

                    if proc.returncode != 0:
                        last_error = err_out or raw_out or f"Claude CLI returned exit code {proc.returncode}"
                        print(f"[chat_with_agent:claude] Attempt {attempt} failed: {last_error}", flush=True)
                        if attempt < max_attempts:
                            current_prompt = (
                                f"{base_prompt}\n\n"
                                f"[SYSTEM SELF-CORRECTION (Attempt {attempt}/{max_attempts})]: Previous error: {last_error}. "
                                f"Please diagnose the error, fix the response, and answer the user.]"
                            )
                            await asyncio.sleep(1.0)
                            continue
                        return {"success": False, "error": f"Claude CLI error after {max_attempts} attempts: {last_error}", "model": selected_model}

                    if not raw_out:
                        last_error = err_out or "Claude returned empty response"
                        if attempt < max_attempts:
                            await asyncio.sleep(1.0)
                            continue
                        return {"success": False, "error": last_error, "model": selected_model}

                    print(f"[chat_with_agent:claude] Success on attempt {attempt} ({len(raw_out)} chars)", flush=True)
                    return {"success": True, "response": raw_out, "model": selected_model, "provider": "claude", "attempts": attempt}

                except Exception as e:
                    last_error = str(e)
                    if attempt < max_attempts:
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": f"Claude error: {last_error}", "model": selected_model}

            return {"success": False, "error": last_error or "Claude execution failed", "model": selected_model}

        # -------------------------------------------------------------
        # 3. PROVIDER: Local Ollama
        # -------------------------------------------------------------
        elif provider == "ollama":
            url = endpoint_url or "http://localhost:11434/api/chat"
            selected_model = model or "llama3.1:8b"
            import urllib.request

            for attempt in range(1, max_attempts + 1):
                ollama_messages = [{"role": "system", "content": f"{system_instruction}\n\n{referenced_context}"}]
                if history:
                    for h in history[-6:]:
                        ollama_messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
                ollama_messages.append({"role": "user", "content": message if attempt == 1 else current_prompt})

                payload = {
                    "model": selected_model,
                    "messages": ollama_messages,
                    "stream": False
                }
                print(f"[chat_with_agent:ollama] Attempt {attempt}/{max_attempts} to {url}...", flush=True)

                try:
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
                    resp_text = data.get("message", {}).get("content", "").strip()

                    if not resp_text:
                        last_error = "Ollama returned empty response content"
                        if attempt < max_attempts:
                            await asyncio.sleep(1.0)
                            continue
                        return {"success": False, "error": last_error, "model": selected_model}

                    print(f"[chat_with_agent:ollama] Success on attempt {attempt}", flush=True)
                    return {"success": True, "response": resp_text, "model": selected_model, "provider": "ollama", "attempts": attempt}

                except Exception as e:
                    last_error = str(e)
                    print(f"[chat_with_agent:ollama] Attempt {attempt} error: {last_error}", flush=True)
                    if attempt < max_attempts:
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": f"Ollama connection error: {last_error}. Ensure Ollama is running at {url}.", "model": selected_model}

            return {"success": False, "error": last_error or "Ollama error", "model": selected_model}

        # -------------------------------------------------------------
        # 4. PROVIDER: OpenCode
        # -------------------------------------------------------------
        elif provider == "opencode":
            opencode_bin = shutil.which("opencode") or os.path.expanduser("~/.opencode/bin/opencode")
            selected_model = model or "opencode-default"
            if not os.path.exists(opencode_bin):
                return {"success": False, "error": "OpenCode executable not found"}

            for attempt in range(1, max_attempts + 1):
                cmd = [opencode_bin, "run", "--format", "default", current_prompt]
                print(f"[chat_with_agent:opencode] Attempt {attempt}/{max_attempts}...", flush=True)

                try:
                    proc = await asyncio.create_subprocess_exec(*cmd, cwd=DATA_DIR, env=_get_clean_subprocess_env(), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90.0)
                    out = stdout.decode().strip()
                    err = stderr.decode().strip()

                    if proc.returncode == 0 and out:
                        return {"success": True, "response": out, "model": selected_model, "provider": "opencode", "attempts": attempt}

                    last_error = err or out or f"OpenCode exited with code {proc.returncode}"
                    if attempt < max_attempts:
                        current_prompt = f"{base_prompt}\n\n[SYSTEM SELF-CORRECTION: Previous attempt failed: {last_error}. Please correct and complete.]"
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": f"OpenCode error: {last_error}", "model": selected_model}

                except Exception as e:
                    last_error = str(e)
                    if attempt < max_attempts:
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": f"OpenCode execution error: {last_error}", "model": selected_model}

            return {"success": False, "error": last_error or "OpenCode failed", "model": selected_model}

        # -------------------------------------------------------------
        # 5. PROVIDER: OpenAI Codex / GPT or Custom Agent Endpoint
        # -------------------------------------------------------------
        elif provider in ["codex", "custom"]:
            url = endpoint_url or "https://api.openai.com/v1/chat/completions"
            selected_model = model or ("gpt-4o" if provider == "codex" else "custom-model")
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            import urllib.request
            for attempt in range(1, max_attempts + 1):
                messages = [{"role": "system", "content": f"{system_instruction}\n\n{referenced_context}"}]
                if history:
                    for h in history[-6:]:
                        messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
                messages.append({"role": "user", "content": message if attempt == 1 else current_prompt})

                payload = {
                    "model": selected_model,
                    "messages": messages,
                    "temperature": 0.7
                }
                print(f"[chat_with_agent:{provider}] Attempt {attempt}/{max_attempts} to {url}...", flush=True)

                try:
                    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
                    loop = asyncio.get_event_loop()
                    def do_request():
                        with urllib.request.urlopen(req, timeout=90.0) as resp:
                            return json.loads(resp.read().decode())
                    data = await loop.run_in_executor(None, do_request)
                    resp_text = data["choices"][0]["message"]["content"].strip()
                    if not resp_text:
                        last_error = "API returned empty content"
                        if attempt < max_attempts:
                            await asyncio.sleep(1.0)
                            continue
                        return {"success": False, "error": last_error, "model": selected_model}

                    return {"success": True, "response": resp_text, "model": selected_model, "provider": provider, "attempts": attempt}

                except Exception as e:
                    last_error = str(e)
                    print(f"[chat_with_agent:{provider}] Attempt {attempt} error: {last_error}", flush=True)
                    if attempt < max_attempts:
                        await asyncio.sleep(1.0)
                        continue
                    return {"success": False, "error": f"{provider.capitalize()} API error: {last_error}", "model": selected_model}

            return {"success": False, "error": last_error or "API error", "model": selected_model}

        return {"success": False, "error": f"Unknown agent provider: {provider}"}

antigravity_client = AntigravityClient()
