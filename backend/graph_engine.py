import networkx as nx
from typing import Dict, List, Any, Optional, Tuple
from collections import Counter
from backend.models import IdeaNode, IdeaEdge, GraphData
from backend import database

class MindmapGraphEngine:
    def __init__(self):
        self.graph = nx.DiGraph()
        self.ideas_map: Dict[str, IdeaNode] = {}
        self.categories: List[str] = []
        self.statuses: List[str] = ["concept", "prototyping", "in-progress", "completed", "archived"]

    def reload_graph(self):
        """Reloads graph from database and recalculates centrality metrics."""
        database.sync_from_markdown_files()
        ideas = database.get_all_ideas()
        edges = database.get_all_edges()

        self.graph.clear()
        self.ideas_map = {idea.id: idea for idea in ideas}

        for idea in ideas:
            self.graph.add_node(idea.id, **idea.model_dump())

        for edge in edges:
            if edge.source in self.ideas_map and edge.target in self.ideas_map:
                self.graph.add_edge(
                    edge.source,
                    edge.target,
                    weight=edge.weight,
                    relation_type=edge.relation_type,
                    description=edge.description,
                    shared_parts=edge.shared_parts
                )

        self._compute_metrics()
        self.categories = sorted(list(set(i.category for i in ideas if i.category)))

    def _compute_metrics(self):
        """Calculates PageRank and degree centrality for dynamic node sizing."""
        if len(self.graph) == 0:
            return

        try:
            pagerank = nx.pagerank(self.graph, weight="weight")
        except Exception:
            pagerank = {n: 1.0 / len(self.graph) for n in self.graph.nodes()}

        for node_id in self.graph.nodes():
            in_deg = self.graph.in_degree(node_id)
            out_deg = self.graph.out_degree(node_id)
            tot_deg = in_deg + out_deg
            pr = pagerank.get(node_id, 0.0)

            node_obj = self.ideas_map.get(node_id)
            if node_obj:
                node_obj.degree = tot_deg
                node_obj.in_degree = in_deg
                node_obj.out_degree = out_deg
                node_obj.pagerank = round(pr, 4)
                # Size calculation: base 1.0 + degree bonus + PageRank multiplier
                node_obj.size = round(1.0 + (tot_deg * 0.35) + (pr * 15.0), 2)

    def get_graph_data(self, category_filter: Optional[str] = None) -> GraphData:
        nodes = list(self.ideas_map.values())
        edges = database.get_all_edges()

        # Guarantee graph integrity: only retain edges where both source and target exist
        valid_node_ids = set(self.ideas_map.keys())
        edges = [e for e in edges if e.source in valid_node_ids and e.target in valid_node_ids]

        if category_filter and category_filter.lower() != "all":
            allowed_ids = {n.id for n in nodes if n.category.lower() == category_filter.lower()}
            nodes = [n for n in nodes if n.id in allowed_ids]
            edges = [e for e in edges if e.source in allowed_ids and e.target in allowed_ids]

        shared_bom_edges = sum(1 for e in edges if e.relation_type == "shared_bom" or len(e.shared_parts) > 0)

        return GraphData(
            nodes=nodes,
            edges=edges,
            categories=self.categories,
            statuses=self.statuses,
            total_ideas=len(nodes),
            total_connections=len(edges),
            shared_bom_count=shared_bom_edges
        )

    def find_similar_ideas(self, idea_id: str, limit: int = 6) -> List[Dict[str, Any]]:
        """Finds other ideas that share components, tags, or concepts with idea_id."""
        source = self.ideas_map.get(idea_id)
        if not source:
            return []

        source_bom_items = {b.item.strip().lower(): b.item.strip() for b in source.bom}
        source_tags = set(t.lower() for t in source.tags)

        results = []
        for other_id, other in self.ideas_map.items():
            if other_id == idea_id:
                continue

            score = 0.0
            reasons = []
            shared_parts = []

            # 1. BOM part matches (very high weight!)
            for b in other.bom:
                norm_b = b.item.strip().lower()
                for s_norm, s_disp in source_bom_items.items():
                    # Exact or strong substring match
                    if norm_b == s_norm or (len(s_norm) > 4 and s_norm in norm_b) or (len(norm_b) > 4 and norm_b in s_norm):
                        shared_parts.append(s_disp)
                        score += 3.0

            if shared_parts:
                reasons.append(f"Shares hardware: {', '.join(set(shared_parts))}")

            # 2. Tag matches
            other_tags = set(t.lower() for t in other.tags)
            common_tags = source_tags.intersection(other_tags)
            if common_tags:
                score += len(common_tags) * 1.5
                reasons.append(f"Shared tags: #{', #'.join(common_tags)}")

            # 3. Category match
            if source.category and other.category and source.category.lower() == other.category.lower():
                score += 1.0

            # Check if already connected
            is_connected = self.graph.has_edge(idea_id, other_id) or self.graph.has_edge(other_id, idea_id)

            if score > 0.5:
                results.append({
                    "idea_id": other.id,
                    "title": other.title,
                    "category": other.category,
                    "score": round(score, 2),
                    "reasons": reasons,
                    "shared_parts": list(set(shared_parts)),
                    "already_connected": is_connected
                })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def propose_link_details(self, source_id: str, target_id: str) -> Dict[str, Any]:
        """Proposes relationship type and rationale between two ideas."""
        s1 = self.ideas_map.get(source_id)
        s2 = self.ideas_map.get(target_id)
        if not s1 or not s2:
            return {"error": "Ideas not found"}

        # Check BOM overlap
        s1_parts = {b.item.strip().lower(): b.item.strip() for b in s1.bom}
        shared = []
        for b in s2.bom:
            norm = b.item.strip().lower()
            for s1_norm, s1_disp in s1_parts.items():
                if norm == s1_norm or (len(s1_norm) > 4 and s1_norm in norm) or (len(norm) > 4 and norm in s1_norm):
                    shared.append(s1_disp)

        shared = list(set(shared))

        if shared:
            rel_type = "shared_bom"
            weight = 0.8
            desc = f"Both projects utilize common parts: {', '.join(shared)}. Bulk buy suggested."
        elif s1.category == s2.category:
            rel_type = "synergy"
            weight = 0.6
            desc = f"Common discipline within {s1.category}."
        else:
            rel_type = "related"
            weight = 0.5
            desc = "Cross-domain creative inspiration."

        return {
            "source": source_id,
            "source_title": s1.title,
            "target": target_id,
            "target_title": s2.title,
            "relation_type": rel_type,
            "weight": weight,
            "description": desc,
            "shared_parts": shared
        }

    def suggest_unlinked_ideas(self) -> List[Dict[str, Any]]:
        """Finds isolated or low-connectivity ideas and suggests connections."""
        suggestions = []
        for node_id, node in self.ideas_map.items():
            deg = self.graph.degree(node_id)
            if deg <= 1:
                similars = self.find_similar_ideas(node_id, limit=2)
                for s in similars:
                    if not s["already_connected"]:
                        suggestions.append({
                            "source": node_id,
                            "source_title": node.title,
                            "target": s["idea_id"],
                            "target_title": s["title"],
                            "reason": "; ".join(s["reasons"]),
                            "shared_parts": s["shared_parts"],
                            "relation_type": "shared_bom" if s["shared_parts"] else "synergy"
                        })
        return suggestions[:10]

engine = MindmapGraphEngine()
