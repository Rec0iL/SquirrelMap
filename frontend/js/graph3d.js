/**
 * graph3d.js - 3D Force-Directed Graph Controller for Creative Idea Mindmap (SquirrelMap)
 * Features: OrbitControls, Auto-Rotation, BOM & Degree-based sizing, Multi-Hop Cascade Influence,
 * Multiple layout modes (Galaxy, Radial Burst, Pyramid Hierarchy, Inverted Tree, 2D Mindmap),
 * and Category/Status/Cascade coloring.
 */

class IdeaGraph3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.graph = null;
    this.rawNodes = [];
    this.rawEdges = [];
    this.selectedNode = null;
    this.horizonMode = false;
    this.autoRotate = false;
    this._rotateAnimId = null;

    // Multi-Selection state
    this.isMultiSelectMode = false;
    this.selectedNodeIds = new Set();
    this.onMultiSelectChangeCallback = null;

    // Multi-hop cascade state
    this.cascadeDownstreamHops = {}; // id -> { hop, transfer }
    this.cascadeUpstreamHops = {};   // id -> { hop }
    this.cascadeEdgeHops = {};       // "src->tgt" -> { hop, direction }

    // Sizing & Coloring modes
    this.nodeSizeMode = 'degree'; // 'degree' | 'pagerank' | 'bom' | 'uniform'
    this.nodeColorMode = 'category'; // 'category' | 'status' | 'degree' | 'cascade'
    this.layoutMode = 'galaxy'; // 'galaxy' | 'pyramid' | 'radial' | 'inverted' | '2d'

    // Category Color Palette
    this.categoryColors = {
      'Hardware & Electronics': '#38bdf8', // Sky Blue
      'Software & AI': '#a855f7',          // Purple
      'Workshop & Tools': '#f59e0b',       // Amber
      'Audio & Visual': '#ec4899',         // Pink
      'Mechanics & CAD': '#10b981',        // Emerald
      'General': '#94a3b8'                 // Slate
    };

    // Status Colors
    this.statusColors = {
      'concept': '#fbbf24',     // Yellow
      'prototyping': '#c084fc', // Purple
      'in-progress': '#60a5fa', // Blue
      'completed': '#34d399',   // Green
      'archived': '#94a3b8'     // Slate
    };

    // Edge Colors by relationship
    this.edgeColors = {
      'shared_bom': '#38bdf8', // Cyan for shared BOM parts
      'synergy': '#c084fc',    // Purple for synergy
      'depends_on': '#f97316', // Orange for depends_on
      'subproject': '#3b82f6', // Blue for subproject
      'related': '#64748b'     // Grey for general
    };

    this.onNodeSelectedCallback = null;
    this.init();
  }

  init() {
    this.graph = ForceGraph3D()(this.container)
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .nodeLabel(node => {
        const partsCount = (node.bom && node.bom.length) ? `${node.bom.length} BOM parts` : 'No BOM';
        const statusIcon = node.status === 'completed' ? '🚀' : node.status === 'in-progress' ? '🛠️' : node.status === 'prototyping' ? '🔬' : '💡';
        return `
          <div style="background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(56, 189, 248, 0.4); padding: 8px 12px; border-radius: 8px; font-family: sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,0.5);">
            <div style="font-weight: 700; color: #f8fafc; font-size: 13px;">${statusIcon} ${node.title || node.name}</div>
            <div style="font-size: 11px; color: #38bdf8; margin-top: 2px;">📁 ${node.category || 'General'} · ${partsCount}</div>
            <div style="font-size: 10px; color: #94a3b8; margin-top: 4px; max-width: 220px;">${node.description || ''}</div>
          </div>
        `;
      })
      .nodeVal(node => this.getNodeVal(node))
      .nodeColor(node => this.getNodeColor(node))
      .nodeResolution(20)
      .linkSource('source')
      .linkTarget('target')
      .linkColor(link => this.getLinkColor(link))
      .linkWidth(link => this.getLinkWidth(link))
      .linkDirectionalParticles(link => this.getLinkParticles(link))
      .linkDirectionalParticleSpeed(link => this.getLinkParticleSpeed(link))
      .linkDirectionalParticleWidth(link => this.getLinkParticleWidth(link))
      .linkDirectionalParticleColor(link => this.getLinkParticleColor(link))
      .linkLabel(link => {
        const typeBadge = link.relation_type === 'shared_bom' ? '⚡ Shared BOM' : (link.relation_type || 'related').replace('_', ' ').toUpperCase();
        const sharedText = (link.shared_parts && link.shared_parts.length) ? `<br><span style="color: #38bdf8;">Parts: ${link.shared_parts.join(', ')}</span>` : '';
        return `
          <div style="background: rgba(15, 23, 42, 0.9); padding: 6px 10px; border-radius: 6px; font-size: 11px; border: 1px solid rgba(255,255,255,0.1);">
            <strong>${typeBadge}</strong>${sharedText}
            ${link.description ? `<div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">${link.description}</div>` : ''}
          </div>
        `;
      })
      .onNodeClick(node => {
        if (this.isMultiSelectMode) {
          this.toggleNodeInMultiSelect(node);
          this.selectNode(node, true);
        } else {
          this.selectNode(node);
        }
      })
      .onBackgroundClick(() => {
        if (!this.isMultiSelectMode) {
          this.clearSelection(true);
        }
      });

    this.setupWindowResize();
  }

  // Multi-Hop Cascade Graph Traversal (Hops 1 to 4)
  computeCascadeHops(rootId) {
    if (!rootId) {
      this.cascadeDownstreamHops = {};
      this.cascadeUpstreamHops = {};
      this.cascadeEdgeHops = {};
      return;
    }

    const downstream = {};
    const upstream = {};
    const edgeHops = {};

    const outgoingAdj = {};
    const incomingAdj = {};

    this.rawEdges.forEach(e => {
      const s = typeof e.source === 'object' ? e.source.id : e.source;
      const t = typeof e.target === 'object' ? e.target.id : e.target;
      if (!outgoingAdj[s]) outgoingAdj[s] = [];
      outgoingAdj[s].push({ target: t, weight: e.weight || 0.8, relation: e.relation_type });
      if (!incomingAdj[t]) incomingAdj[t] = [];
      incomingAdj[t].push({ source: s, weight: e.weight || 0.8, relation: e.relation_type });
    });

    // Downstream BFS (Direct Reach & Secondary Ripples)
    const queue = [{ id: rootId, hop: 0, transfer: 1.0 }];
    downstream[rootId] = { hop: 0, transfer: 1.0 };
    const MAX_HOPS = 4;

    while (queue.length > 0) {
      const { id, hop, transfer } = queue.shift();
      if (hop >= MAX_HOPS) continue;

      const edges = outgoingAdj[id] || [];
      for (const edge of edges) {
        const nextHop = hop + 1;
        const edgeKey = `${id}->${edge.target}`;
        if (!edgeHops[edgeKey]) {
          edgeHops[edgeKey] = { hop: nextHop, direction: 'outgoing' };
        }

        const nextTransfer = transfer * edge.weight;
        if (!downstream[edge.target] || downstream[edge.target].hop > nextHop) {
          downstream[edge.target] = { hop: nextHop, transfer: nextTransfer };
          queue.push({ id: edge.target, hop: nextHop, transfer: nextTransfer });
        }
      }
    }

    // Upstream BFS (Foundational roots feeding into this project)
    const upQueue = [{ id: rootId, hop: 0 }];
    upstream[rootId] = { hop: 0 };
    while (upQueue.length > 0) {
      const { id, hop } = upQueue.shift();
      if (hop >= 2) continue;

      const edges = incomingAdj[id] || [];
      for (const edge of edges) {
        const nextHop = hop + 1;
        const edgeKey = `${edge.source}->${id}`;
        if (!edgeHops[edgeKey]) {
          edgeHops[edgeKey] = { hop: nextHop, direction: 'incoming' };
        }
        if (!upstream[edge.source] || upstream[edge.source].hop > nextHop) {
          upstream[edge.source] = { hop: nextHop };
          upQueue.push({ id: edge.source, hop: nextHop });
        }
      }
    }

    this.cascadeDownstreamHops = downstream;
    this.cascadeUpstreamHops = upstream;
    this.cascadeEdgeHops = edgeHops;
  }

  getCategoryColor(category) {
    if (!category) return '#94a3b8';
    if (this.categoryColors[category]) return this.categoryColors[category];
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    const color = `hsl(${h}, 75%, 60%)`;
    this.categoryColors[category] = color;
    return color;
  }

  getNodeColor(node) {
    if (this.selectedNode && this.selectedNode.id === node.id) {
      return '#00f5ff'; // Glowing electric cyan for active inspected node
    }

    if (this.selectedNodeIds && this.selectedNodeIds.has(node.id)) {
      return '#06b6d4'; // Bright cyan for multi-selected nodes
    }

    if (this.nodeColorMode === 'cascade' && this.selectedNode) {
      const down = this.cascadeDownstreamHops[node.id];
      if (down) {
        if (down.hop === 1) return '#00f5ff'; // Electric Cyan Hop 1
        if (down.hop === 2) return '#10b981'; // Mint Green Hop 2
        return '#a855f7';                     // Radiant Violet Hop 3+
      }
      const up = this.cascadeUpstreamHops[node.id];
      if (up) return '#f59e0b';               // Golden Amber Upstream
      return 'rgba(71, 85, 105, 0.2)';       // Dimmed background
    }

    if (this.horizonMode && this.selectedNode) {
      const isNeighbor = this.isNeighbor(this.selectedNode.id, node.id);
      if (!isNeighbor && this.selectedNode.id !== node.id) {
        return 'rgba(71, 85, 105, 0.15)'; // Dimmed
      }
    }

    if (this.nodeColorMode === 'status') {
      return this.statusColors[node.status] || '#60a5fa';
    } else if (this.nodeColorMode === 'degree') {
      const deg = node.degree || 1;
      const hue = Math.min(280, 200 + deg * 15);
      return `hsl(${hue}, 80%, 55%)`;
    }

    // Default: category cluster
    return this.getCategoryColor(node.category);
  }

  getNodeVal(node) {
    let base = 3.5;
    if (this.nodeSizeMode === 'uniform') {
      return 3.5;
    } else if (this.nodeSizeMode === 'pagerank') {
      return base + (node.pagerank || 0) * 120.0;
    } else if (this.nodeSizeMode === 'bom') {
      const count = (node.bom && node.bom.length) || 0;
      return base + (count * 1.5);
    }
    // Default: Degree
    const deg = (node.degree || 0);
    let finalVal = base + (deg * 1.2);
    if ((this.selectedNode && this.selectedNode.id === node.id) || (this.selectedNodeIds && this.selectedNodeIds.has(node.id))) {
      finalVal *= 1.35;
    }
    return finalVal;
  }

  getLinkColor(link) {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${srcId}->${tgtId}`;

    if (this.selectedNode) {
      const hopInfo = this.cascadeEdgeHops[edgeKey];
      if (hopInfo) {
        if (hopInfo.direction === 'incoming') return '#f59e0b'; // Amber upstream
        if (hopInfo.hop === 1) return '#00f5ff'; // Electric Cyan Hop 1
        if (hopInfo.hop === 2) return '#10b981'; // Mint Green Hop 2
        return '#a855f7';                        // Radiant Violet Hop 3+
      }
      return 'rgba(255, 255, 255, 0.04)'; // Dimmed non-cascade links
    }

    if (this.horizonMode && this.selectedNode) {
      if (srcId !== this.selectedNode.id && tgtId !== this.selectedNode.id) {
        return 'rgba(255, 255, 255, 0.03)';
      }
    }

    const type = link.relation_type || 'synergy';
    return this.edgeColors[type] || 'rgba(148, 163, 184, 0.4)';
  }

  getLinkWidth(link) {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${srcId}->${tgtId}`;

    if (this.selectedNode) {
      const hopInfo = this.cascadeEdgeHops[edgeKey];
      if (hopInfo) {
        if (hopInfo.hop === 1) return 3.2;
        if (hopInfo.hop === 2) return 2.2;
        return 1.8;
      }
      return 0.6;
    }

    return link.relation_type === 'shared_bom' ? 2.5 : 1.5;
  }

  getLinkParticles(link) {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${srcId}->${tgtId}`;

    if (this.selectedNode) {
      const hopInfo = this.cascadeEdgeHops[edgeKey];
      if (hopInfo) {
        if (hopInfo.hop === 1) return 4;
        if (hopInfo.hop === 2) return 3;
        return 2;
      }
      return 0;
    }

    return link.relation_type === 'shared_bom' ? 3 : 1;
  }

  getLinkParticleSpeed(link) {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${srcId}->${tgtId}`;

    if (this.selectedNode) {
      const hopInfo = this.cascadeEdgeHops[edgeKey];
      if (hopInfo) {
        if (hopInfo.hop === 1) return 0.010;
        if (hopInfo.hop === 2) return 0.006;
        return 0.003;
      }
    }

    return link.relation_type === 'shared_bom' ? 0.008 : 0.004;
  }

  getLinkParticleWidth(link) {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const edgeKey = `${srcId}->${tgtId}`;

    if (this.selectedNode) {
      const hopInfo = this.cascadeEdgeHops[edgeKey];
      if (hopInfo) {
        if (hopInfo.hop === 1) return 3.2;
        if (hopInfo.hop === 2) return 2.4;
        return 1.8;
      }
    }

    return link.relation_type === 'shared_bom' ? 3.0 : 1.8;
  }

  getLinkParticleColor(link) {
    return this.getLinkColor(link);
  }

  isNeighbor(nodeAId, nodeBId) {
    return this.rawEdges.some(e => {
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      return (src === nodeAId && tgt === nodeBId) || (src === nodeBId && tgt === nodeAId);
    });
  }

  setData(nodes, edges) {
    this.rawNodes = nodes;
    this.rawEdges = edges;

    const data = {
      nodes: nodes.map(n => ({ ...n })),
      links: edges.map(e => ({ ...e }))
    };

    this.graph.graphData(data);
    this.applyLayoutMode(this.layoutMode);
  }

  selectNode(node, notify = true) {
    if (this._isSelecting) return;
    this._isSelecting = true;
    try {
      this.selectedNode = node;
      this.computeCascadeHops(node ? node.id : null);
      this.refreshStyles();

      if (notify && this.onNodeSelectedCallback) {
        this.onNodeSelectedCallback(node);
      }
    } finally {
      this._isSelecting = false;
    }
  }

  clearSelection(notify = false) {
    if (this._isClearing) return;
    this._isClearing = true;
    try {
      if (this.isMultiSelectMode) {
        return; // In multi-select mode, clicking background preserves selection!
      }
      this.selectedNode = null;
      this.computeCascadeHops(null);
      this.refreshStyles();

      if (notify && this.onNodeSelectedCallback) {
        this.onNodeSelectedCallback(null);
      }
    } finally {
      this._isClearing = false;
    }
  }

  setMultiSelectMode(enabled) {
    this.isMultiSelectMode = !!enabled;
    this.refreshStyles();
  }

  toggleNodeInMultiSelect(node) {
    if (!node) return;
    if (this.selectedNodeIds.has(node.id)) {
      this.selectedNodeIds.delete(node.id);
    } else {
      this.selectedNodeIds.add(node.id);
    }
    this.refreshStyles();
    if (this.onMultiSelectChangeCallback) {
      this.onMultiSelectChangeCallback(this.selectedNodeIds);
    }
  }

  addNodeToMultiSelect(nodeId) {
    this.selectedNodeIds.add(nodeId);
    this.refreshStyles();
    if (this.onMultiSelectChangeCallback) {
      this.onMultiSelectChangeCallback(this.selectedNodeIds);
    }
  }

  removeNodeFromMultiSelect(nodeId) {
    this.selectedNodeIds.delete(nodeId);
    this.refreshStyles();
    if (this.onMultiSelectChangeCallback) {
      this.onMultiSelectChangeCallback(this.selectedNodeIds);
    }
  }

  clearMultiSelection() {
    this.selectedNodeIds.clear();
    this.refreshStyles();
    if (this.onMultiSelectChangeCallback) {
      this.onMultiSelectChangeCallback(this.selectedNodeIds);
    }
  }

  refreshStyles() {
    if (!this.graph) return;
    this.graph.nodeColor(this.graph.nodeColor());
    this.graph.nodeVal(this.graph.nodeVal());
    this.graph.linkColor(this.graph.linkColor());
    this.graph.linkWidth(this.graph.linkWidth());
    this.graph.linkDirectionalParticles(this.graph.linkDirectionalParticles());
    this.graph.linkDirectionalParticleSpeed(this.graph.linkDirectionalParticleSpeed());
    this.graph.linkDirectionalParticleWidth(this.graph.linkDirectionalParticleWidth());
    this.graph.linkDirectionalParticleColor(this.graph.linkDirectionalParticleColor());
  }

  focusNodeById(nodeId) {
    this.focusOnNode(nodeId);
  }

  focusOnNode(nodeId) {
    const node = this.rawNodes.find(n => n.id === nodeId);
    if (!node) return;

    this.selectNode(node);

    // Smooth camera fly-to animation
    const currentPos = this.graph.cameraPosition();
    const distance = 160;
    const ratio = distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);

    this.graph.cameraPosition(
      {
        x: (node.x || 0) + (node.x || 1) * ratio * 0.4,
        y: (node.y || 0) + 40,
        z: (node.z || 0) + (node.z || 1) * ratio * 0.4
      },
      { x: node.x || 0, y: node.y || 0, z: node.z || 0 },
      1500
    );
  }

  resetCamera() {
    this.graph.cameraPosition({ x: 0, y: 0, z: 380 }, { x: 0, y: 0, z: 0 }, 1200);
  }

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    if (this.autoRotate) {
      let angle = 0;
      const rotate = () => {
        if (!this.autoRotate) return;
        angle += Math.PI / 1200;
        const distance = 380;
        this.graph.cameraPosition({
          x: distance * Math.sin(angle),
          z: distance * Math.cos(angle)
        });
        this._rotateAnimId = requestAnimationFrame(rotate);
      };
      this._rotateAnimId = requestAnimationFrame(rotate);
    } else if (this._rotateAnimId) {
      cancelAnimationFrame(this._rotateAnimId);
    }
    return this.autoRotate;
  }

  toggleHorizonMode() {
    this.horizonMode = !this.horizonMode;
    this.refreshStyles();
    return this.horizonMode;
  }

  setLayoutMode(mode) {
    this.layoutMode = mode;
    this.applyLayoutMode(mode);
  }

  applyLayoutMode(mode) {
    if (!this.graph) return;

    if (mode === '2d') {
      this.graph.numDimensions(2);
      this.graph.dagMode(null);
    } else if (mode === 'radial') {
      this.graph.numDimensions(3);
      this.graph.dagMode('radialout');
    } else if (mode === 'pyramid') {
      this.graph.numDimensions(3);
      this.graph.dagMode('td');
    } else if (mode === 'inverted') {
      this.graph.numDimensions(3);
      this.graph.dagMode('bu');
    } else {
      // Galaxy 3D force default
      this.graph.numDimensions(3);
      this.graph.dagMode(null);
    }

    this.graph.d3ReheatSimulation();
  }

  setNodeSizeMode(mode) {
    this.nodeSizeMode = mode;
    this.graph.nodeVal(node => this.getNodeVal(node));
  }

  setNodeColorMode(mode) {
    this.nodeColorMode = mode;
    this.refreshStyles();
  }

  setupWindowResize() {
    // Keep the WebGL canvas in sync with its container. A ResizeObserver also catches
    // maximize/restore and DPI changes that do not always deliver a timely window "resize" event.
    const fit = () => {
      if (!this.graph || !this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w > 0 && h > 0 && (w !== this._fitW || h !== this._fitH)) {
        this._fitW = w;
        this._fitH = h;
        this.graph.width(w);
        this.graph.height(h);
      }
    };
    const scheduleFit = () => requestAnimationFrame(fit);

    window.addEventListener('resize', scheduleFit);
    if (typeof ResizeObserver !== 'undefined' && this.container) {
      new ResizeObserver(scheduleFit).observe(this.container);
    }
    // Window may still be settling (e.g. maximized right after launch)
    window.addEventListener('load', () => { scheduleFit(); setTimeout(fit, 500); setTimeout(fit, 1500); });
    scheduleFit();
  }
}

window.IdeaGraph3D = IdeaGraph3D;
