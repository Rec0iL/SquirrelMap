import httpx
import json
import re
from typing import Optional, Dict, Any
from .models import AIImportPayload, SkillNode, SkillEdge, SkillConflict

DEFAULT_COLIBRI_URL = "http://localhost:8000/v1"

class ColibriClient:
    def __init__(self, base_url: str = DEFAULT_COLIBRI_URL):
        self.base_url = base_url.rstrip("/")

    async def check_health(self) -> Dict[str, Any]:
        """Check if Colibri / OpenAI-compatible endpoint is available on port 8000."""
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(f"{self.base_url}/models")
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m.get("id") for m in data.get("data", [])] if isinstance(data, dict) else []
                    return {"online": True, "models": models, "url": self.base_url}
        except Exception as e:
            return {"online": False, "error": str(e), "url": self.base_url}
        return {"online": False, "url": self.base_url}

    async def generate_skills(self, topic: str, domain: Optional[str] = None, count: int = 6, layers: Optional[list] = None, model: Optional[str] = None) -> Dict[str, Any]:
        """Prompt Colibri to generate skills, edges, and conflicts according to skilltree.md schema."""
        layers_str = ", ".join(layers) if layers else "realistic, scifi, fantasy"
        domain_str = f" in the '{domain}' domain" if domain else ""

        # Auto-detect model if not explicitly provided
        selected_model = model
        if not selected_model:
            health = await self.check_health()
            if health.get("online") and health.get("models"):
                selected_model = health["models"][0]
            else:
                selected_model = "qwen3.6-colibri"

        system_prompt = """You are the Ultimate Skilltree Architect.
Generate new skills, directed asymmetric edges, and exclusivity conflicts according to the Universal Skilltree Specification.
Always respond with ONLY a single raw JSON object matching this schema:
{
  "skills": [
    {
      "id": "kebab-case-id",
      "name": "Skill Name",
      "domain": "Domain Name",
      "tier": 1-5,
      "genre_layers": ["realistic"|"historical"|"scifi"|"fantasy"|"esoteric"],
      "description": "Short description",
      "foundations": ["foundation-id"],
      "tags": ["tag1", "tag2"]
    }
  ],
  "edges": [
    {
      "source": "skill-id-a",
      "target": "skill-id-b",
      "weight": 0.1-1.0,
      "relation_type": "prerequisite"|"synergy"|"specialization"|"lateral",
      "description": "Reason"
    }
  ],
  "conflicts": [
    {
      "skill_a": "skill-id-a",
      "skill_b": "skill-id-b",
      "conflict_type": "hard_exclusive"|"soft_dampening",
      "description": "Reason"
    }
  ]
}"""

        user_prompt = f"""Generate {count} interconnected skills{domain_str} related to: '{topic}'.
Target Genre Layers: [{layers_str}].
Ensure high-tier skills connect to lower-tier skills with realistic asymmetric transfer weights.
Identify at least 1 potential mutual exclusivity conflict if applicable.
Output strictly JSON without markdown backticks if possible."""

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                payload = {
                    "model": selected_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.4,
                    "max_tokens": 2048
                }
                resp = await client.post(f"{self.base_url}/chat/completions", json=payload)
                if resp.status_code != 200:
                    return {
                        "success": False,
                        "error": f"Colibri returned HTTP {resp.status_code}: {resp.text}"
                    }

                res_json = resp.json()
                content = res_json["choices"][0]["message"]["content"].strip()

                # Strip potential markdown code fences
                cleaned = re.sub(r"^```json\s*", "", content, flags=re.MULTILINE)
                cleaned = re.sub(r"^```\s*", "", cleaned, flags=re.MULTILINE)
                cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()

                parsed = json.loads(cleaned)
                return {
                    "success": True,
                    "payload": parsed,
                    "raw": content
                }
        except httpx.ConnectError:
            return {
                "success": False,
                "error": f"Could not connect to Colibri at {self.base_url}. Ensure Colibri is running, or paste JSON manually into the Review Modal."
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"AI generation error: {str(e)}"
            }

    async def evaluate_link(
        self,
        skill_a_name: str,
        skill_a_desc: str,
        skill_a_tier: int,
        skill_a_domain: str,
        skill_b_name: str,
        skill_b_desc: str,
        skill_b_tier: int,
        skill_b_domain: str,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        selected_model = model
        if not selected_model:
            health = await self.check_health()
            if health.get("online") and health.get("models"):
                selected_model = health["models"][0]
            else:
                selected_model = "qwen3.6-colibri"

        system_prompt = """You are the Ultimate Skilltree Architect.
In our skill tree knowledge graph, a directed edge (X -> Y) means:
'Possessing skill X confers transfer proficiency and capability toward skill Y.'
Downward transfer (higher tier to lower tier) is highly effective because mastery of complex systems easily covers simpler devices.
Upward transfer (lower tier to higher tier) encounters complexity resistance.

Respond ONLY with valid JSON matching this schema:
{
  "direction": "outgoing" | "incoming" | "bidirectional",
  "relation_type": "prerequisite" | "specialization" | "synergy" | "lateral",
  "weight": 0.1-1.0,
  "description": "Short explanation of transfer"
}"""

        user_prompt = f"""Analyze the relationship between:
Skill A (Currently Selected): {skill_a_name} (Tier {skill_a_tier}, Domain: {skill_a_domain}): {skill_a_desc}
Skill B (Target Skill): {skill_b_name} (Tier {skill_b_tier}, Domain: {skill_b_domain}): {skill_b_desc}

Determine EVERYTHING about this link:
1. 'direction':
   - 'outgoing' (A -> B): Practicing Skill A directly confers capability to perform Skill B.
   - 'incoming' (B -> A): Practicing Skill B directly confers capability to perform Skill A.
   - 'bidirectional' (A <-> B): Practicing either skill strongly benefits the other through mutual lateral synergy.
2. 'relation_type': 'prerequisite' | 'specialization' | 'synergy' | 'lateral'
3. 'weight': float 0.10 to 1.00
4. 'description': 1-2 concise sentences explaining why this direction and weight was chosen."""

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                payload = {
                    "model": selected_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 512
                }
                resp = await client.post(f"{self.base_url}/chat/completions", json=payload)
                if resp.status_code == 200:
                    res_json = resp.json()
                    content = res_json["choices"][0]["message"]["content"].strip()
                    cleaned = re.sub(r"^```json\s*", "", content, flags=re.MULTILINE)
                    cleaned = re.sub(r"^```\s*", "", cleaned, flags=re.MULTILINE)
                    cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()
                    json_match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
                    if json_match:
                        cleaned = json_match.group(1)
                    data = json.loads(cleaned)
                    if "direction" in data and data["direction"] not in ["outgoing", "incoming", "bidirectional"]:
                        data["direction"] = "outgoing"
                    return {"success": True, "data": data, "engine": "colibri"}
        except Exception as e:
            return {"success": False, "error": str(e)}
        return {"success": False, "error": "Evaluation failed"}

colibri_client = ColibriClient()
