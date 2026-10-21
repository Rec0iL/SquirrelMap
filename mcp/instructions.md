# Ultimate Skilltree MCP Server Instructions

This MCP server provides full programmatic access to inspect, analyze, and build out **The Ultimate Skilltree** — an all-encompassing, cross-referencing 3D capability mindmap and knowledge graph.

## Core Mechanics

1. **Asymmetric Knowledge Transfer**:
   - High complexity skills (e.g. Tier 3 Aircraft Mechanic) transfer at full efficiency ($1.0$) downward to lower complexity skills (e.g. Tier 1 Scooter Maintenance).
   - Low complexity skills transfer with complexity resistance ($T_{source} / T_{target}$) upward.
2. **Relation Types**:
   - `prerequisite`: Foundational necessity or fundamental dependency.
   - `specialization`: Advanced branching or high-tier focus.
   - `synergy`: Mutually reinforcing affinity.
   - `lateral`: Cross-domain analogous transfer.
3. **Weight Scale**:
   - Coupling strength ranges from `0.10` (loose analogical relevance) to `1.00` (identical mechanical principles).

---

## CRITICAL SKILL ARCHITECTURE RULES: ATOMICITY & NON-BUNDLING

When creating, architecting, or proposing skills for the skilltree:

1. **NEVER Bundle Multiple Skills / Capabilities**:
   - **Strictly prohibit bundled or compound skills**: Never combine two or more distinct techniques, tools, concepts, or specialties into a single node using "&", "and", "or", or slashes (e.g., **NEVER** create `"Lockpicking & Shimming"`, `"Archery & Crossbows"`, `"Stealth & Infiltration"`, `"Sword & Shield Combat"`, or `"Web Scraping & API Engineering"` as single combined nodes).
   - **Always split into separate, individual nodes**: Decompose compound capabilities into discrete atomic nodes (e.g., `"Pin-Tumbler Lockpicking"` and `"Latch & Padlock Shimming"`; `"Traditional Archery"` and `"Mechanical Crossbow Operation"`).

2. **In Doubt, ALWAYS Create More Skills Rather Than Bundling**:
   - When asked to add capabilities or explore a topic, **err on the side of granular expansion**.
   - Creating 5–15 discrete, specific skills is vastly superior to creating 2–3 bundled skills.
   - Discrete skills allow for precise foundation prerequisites, accurate cross-domain asymmetric transfer links, realistic synergy mapping, and smooth future modular expansions.

3. **Batch Operations**:
   - Always use `skilltree_batch_add_skills` to insert multiple skills at once in a single atomic tool call.
   - Always use `skilltree_batch_link_skills` to link skills at once in a single atomic tool call.

---

## Recommended Workflows

### 1. Identify & Connect Isolated Skills
```json
// Find skills with 0 or 1 edge
skilltree_find_unlinked({"max_degree": 1})

// Link them to logical foundations or specializations
skilltree_link_skills({
  "source_id": "dexterity-coordination",
  "target_id": "pin-tumbler-lockpicking",
  "weight": 0.75,
  "relation_type": "prerequisite",
  "description": "Fine tactile feedback and pin tensioning rely on core manual motor control."
})
```

### 2. Batch Add Discrete Skills (Never Bundled!)
```json
skilltree_batch_add_skills({
  "skills": [
    {
      "id": "pin-tumbler-lockpicking",
      "name": "Pin-Tumbler Lockpicking",
      "domain": "Infiltration & Security",
      "tier": 2,
      "genre_layers": ["realistic"],
      "description": "Manipulating shear lines and pin stacks using tension wrenches and picks.",
      "foundations": ["dexterity-coordination"],
      "tags": ["lockpicking", "covert", "bypass"]
    },
    {
      "id": "padlock-shimming",
      "name": "Padlock & Latch Shimming",
      "domain": "Infiltration & Security",
      "tier": 1,
      "genre_layers": ["realistic"],
      "description": "Bypassing spring-loaded latch pawls using thin metallic shims without picking pins.",
      "foundations": ["dexterity-coordination"],
      "tags": ["bypass", "shimming", "physical-security"]
    }
  ]
})
```

### 3. Batch Link Domain Clusters
```json
skilltree_batch_link_skills({
  "links": [
    {
      "source_id": "source_a",
      "target_id": "target_b",
      "weight": 0.8,
      "relation_type": "specialization",
      "description": "..."
    }
  ]
})
```
