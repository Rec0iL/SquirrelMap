from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator

STATUS_MAP = {
    "idea": "concept",
    "draft": "concept",
    "planned": "concept",
    "backlog": "concept",
    "new": "concept",
    "active": "in-progress",
    "wip": "in-progress",
    "progress": "in-progress",
    "building": "in-progress",
    "done": "completed",
    "finished": "completed",
    "prototype": "prototyping"
}

IdeaStatus = Literal['concept', 'prototyping', 'in-progress', 'completed', 'archived']
RelationType = Literal['shared_bom', 'synergy', 'depends_on', 'subproject', 'related']

class BOMItem(BaseModel):
    item: str
    qty: int = 1
    notes: Optional[str] = ''
    link: Optional[str] = ''

class IdeaNode(BaseModel):
    id: str
    title: str
    name: Optional[str] = None  # Alias for compatibility
    category: str = 'General'
    status: IdeaStatus = 'concept'
    description: str = ''
    content_markdown: str = ''
    tags: List[str] = Field(default_factory=list)
    bom: List[BOMItem] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    
    # Graph centrality metrics calculated by graph engine
    pagerank: Optional[float] = 0.0
    degree: Optional[int] = 0
    in_degree: Optional[int] = 0
    out_degree: Optional[int] = 0
    size: Optional[float] = 1.0

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: Any) -> str:
        if not v or not isinstance(v, str):
            return "concept"
        s = v.strip().lower()
        if s in STATUS_MAP:
            return STATUS_MAP[s]
        if s in ["concept", "prototyping", "in-progress", "completed", "archived"]:
            return s
        return "concept"

    def model_post_init(self, __context):
        if not self.name:
            self.name = self.title
        elif not self.title:
            self.title = self.name

class IdeaEdge(BaseModel):
    source: str
    target: str
    weight: float = Field(ge=0.0, le=1.0, default=0.5)
    relation_type: RelationType = 'synergy'
    description: Optional[str] = ''
    shared_parts: List[str] = Field(default_factory=list)

class GraphData(BaseModel):
    nodes: List[IdeaNode]
    edges: List[IdeaEdge]
    categories: List[str]
    statuses: List[str]
    total_ideas: int = 0
    total_connections: int = 0
    shared_bom_count: int = 0

class BOMProjectUsage(BaseModel):
    idea_id: str
    idea_title: str
    category: str
    qty: int
    notes: str = ''

class AggregatedBOMItem(BaseModel):
    item: str
    total_qty: int
    projects: List[BOMProjectUsage]
    is_shared: bool = False

class BOMSummary(BaseModel):
    items: List[AggregatedBOMItem]
    total_unique_items: int
    shared_items_count: int
    bulk_buy_recommendations: List[str]

class IdeaBrainstormRequest(BaseModel):
    idea: str
    category: Optional[str] = None
    existing_skills_or_tags: Optional[List[str]] = Field(default_factory=list)
    model: Optional[str] = 'gemini-3.8-flash-low'
    provider: Optional[str] = 'antigravity'

class FuseIdeasRequest(BaseModel):
    idea_a: str
    idea_b: str
    new_title: Optional[str] = None
    category: Optional[str] = None

class SplitIdeaRequest(BaseModel):
    idea_id: str
    target_count: int = 2

class McpChatMessage(BaseModel):
    role: str
    content: str

class McpChatRequest(BaseModel):
    message: str
    history: List[McpChatMessage] = Field(default_factory=list)
    provider: Optional[str] = 'agy'
    model: Optional[str] = 'gemini-3.8-flash-low'
    referenced_ideas: Optional[List[Dict[str, Any]]] = None
    endpoint_url: Optional[str] = None
    api_key: Optional[str] = None
    is_voice: Optional[bool] = False
    voice_metadata: Optional[Dict[str, Any]] = None


class ChatSessionSave(BaseModel):
    title: str
    provider: Optional[str] = None
    model: Optional[str] = None
    messages: List[Dict[str, Any]] = []
    history: List[Dict[str, Any]] = []
