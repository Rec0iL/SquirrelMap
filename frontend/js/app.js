/**
 * app.js - Main Application Orchestrator for Creative Idea Mindmap
 * Handles graph loading, local Markdown editor synchronization, BOM management,
 * category filtering, connection linking, and toast notifications.
 */

class IdeaMindmapApp {
  constructor() {
    this.graph3d = null;
    this.modals = null;
    this.mcpChat = null;

    this.allNodes = [];
    this.allEdges = [];
    this.activeCategory = 'all';
    this.selectedNode = null;

    // DOM Elements
    this.searchInput = document.getElementById('searchInput');
    this.searchResults = document.getElementById('searchResults');
    this.categoryPillsContainer = document.getElementById('categoryPillsContainer');
    this.themeSelect = document.getElementById('themeSelect');
    this.btnCreateNewIdea = document.getElementById('btnCreateNewIdea');
    this.btnExportGraph = document.getElementById('btnExportGraph');

    // HUD Mode Selectors
    this.layoutModeSelect = document.getElementById('layoutModeSelect');
    this.nodeSizeModeSelect = document.getElementById('nodeSizeModeSelect');
    this.nodeColorModeSelect = document.getElementById('nodeColorModeSelect');

    // HUD Camera Buttons
    this.btnResetCamera = document.getElementById('btnResetCamera');
    this.btnToggleAutoRotate = document.getElementById('btnToggleAutoRotate');
    this.btnTakeSnapshot = document.getElementById('btnTakeSnapshot');
    this.btnToggleHorizon = document.getElementById('btnToggleHorizon');

    // HUD Counters
    this.statSkillsCount = document.getElementById('statSkillsCount');
    this.statEdgesCount = document.getElementById('statEdgesCount');
    this.statSharedBomCount = document.getElementById('statSharedBomCount');

    // Inspector Panel Elements
    this.inspectorPanel = document.getElementById('inspectorPanel');
    this.btnCloseInspector = document.getElementById('btnCloseInspector');
    this.inspStatusSelect = document.getElementById('inspStatusSelect');
    this.inspCategoryInput = document.getElementById('inspCategoryInput');
    this.inspTitleInput = document.getElementById('inspTitleInput');
    this.inspTagsInput = document.getElementById('inspTagsInput');

    // Inspector Tabs
    this.inspTabBtns = document.querySelectorAll('.insp-tab-btn');
    this.inspTabPanes = document.querySelectorAll('.insp-tab-pane');

    // Markdown Editor
    this.inspMarkdownTextarea = document.getElementById('inspMarkdownTextarea');
    this.inspMarkdownPreview = document.getElementById('inspMarkdownPreview');
    this.btnMdEditMode = document.getElementById('btnMdEditMode');
    this.btnMdPreviewMode = document.getElementById('btnMdPreviewMode');
    this.btnSaveMarkdownNotes = document.getElementById('btnSaveMarkdownNotes');
    this.markdownSaveStatus = document.getElementById('markdownSaveStatus');
    this.mdToolBtns = document.querySelectorAll('.md-tool-btn');

    // BOM
    this.newBomItemName = document.getElementById('newBomItemName');
    this.newBomItemQty = document.getElementById('newBomItemQty');
    this.newBomItemNotes = document.getElementById('newBomItemNotes');
    this.btnAddBomItem = document.getElementById('btnAddBomItem');
    this.inspBomList = document.getElementById('inspBomList');

    // Connections
    this.inspOutgoingList = document.getElementById('inspOutgoingList');
    this.targetSkillSearchInput = document.getElementById('targetSkillSearchInput');
    this.targetSearchResults = document.getElementById('targetSearchResults');
    this.selectedTargetContainer = document.getElementById('selectedTargetContainer');
    this.linkRelationTypeSelect = document.getElementById('linkRelationTypeSelect');
    this.linkDescriptionInput = document.getElementById('linkDescriptionInput');
    this.btnAiProposeLink = document.getElementById('btnAiProposeLink');
    this.btnEstablishLink = document.getElementById('btnEstablishLink');
    this.selectedLinkTarget = null;

    // Synergies & Similarities
    this.inspSimilaritiesList = document.getElementById('inspSimilaritiesList');

    // Inspector Bottom Actions
    this.btnSaveAllChanges = document.getElementById('btnSaveAllChanges');
    this.btnFocusNode = document.getElementById('btnFocusNode');
    this.btnDeleteIdea = document.getElementById('btnDeleteIdea');
    this.btnDeleteIdeaHeader = document.getElementById('btnDeleteIdeaHeader');

    // New Project Modal
    this.newIdeaModalBackdrop = document.getElementById('newIdeaModalBackdrop');
    this.btnCloseNewIdeaModal = document.getElementById('btnCloseNewIdeaModal');
    this.btnCancelNewIdeaModal = document.getElementById('btnCancelNewIdeaModal');
    this.btnSubmitNewIdeaModal = document.getElementById('btnSubmitNewIdeaModal');
    this.newIdeaTitleInput = document.getElementById('newIdeaTitleInput');
    this.newIdeaCategoryInput = document.getElementById('newIdeaCategoryInput');
    this.newIdeaStatusSelect = document.getElementById('newIdeaStatusSelect');
    this.newIdeaDescInput = document.getElementById('newIdeaDescInput');
    this.newIdeaTagsInput = document.getElementById('newIdeaTagsInput');
    this.categoryDatalist = document.getElementById('categoryDatalist');

    // Confirm Dialog Modal
    this.confirmModalBackdrop = document.getElementById('confirmModalBackdrop');
    this.confirmModalTitle = document.getElementById('confirmModalTitle');
    this.confirmModalMessage = document.getElementById('confirmModalMessage');
    this.btnCloseConfirmModal = document.getElementById('btnCloseConfirmModal');
    this.btnCancelConfirmModal = document.getElementById('btnCancelConfirmModal');
    this.btnAcceptConfirmModal = document.getElementById('btnAcceptConfirmModal');
    this._confirmResolver = null;

    // Toast Container
    this.toastContainer = document.getElementById('toastContainer');

    // Multi-Selection State & Controls
    this.selectedNodeIds = new Set();
    this.isMultiSelectMode = false;
    this.btnToggleMultiSelect = document.getElementById('btnToggleMultiSelect');
    this.multiSelectCountBadge = document.getElementById('multiSelectCountBadge');
    this.multiSelectBtnLabel = document.getElementById('multiSelectBtnLabel');
    this.multiSelectActionBar = document.getElementById('multiSelectActionBar');
    this.multiSelectHudCount = document.getElementById('multiSelectHudCount');
    this.btnViewSelectedBom = document.getElementById('btnViewSelectedBom');
    this.btnViewSelectedBomCount = document.getElementById('btnViewSelectedBomCount');
    this.btnDeselectAllNodes = document.getElementById('btnDeselectAllNodes');
    this.btnExitMultiSelect = document.getElementById('btnExitMultiSelect');
    this.btnToggleAddToSelection = document.getElementById('btnToggleAddToSelection');
    this.btnToggleAddToSelectionText = document.getElementById('btnToggleAddToSelectionText');
    this.btnInspectorDeselectAll = document.getElementById('btnInspectorDeselectAll');
  }

  async start() {
    this.graph3d = new IdeaGraph3D('3d-graph');
    this.graph3d.onNodeSelectedCallback = (node) => this.onNodeSelected(node);
    this.graph3d.onMultiSelectChangeCallback = (selectedIds) => {
      this.selectedNodeIds = selectedIds;
      this.updateMultiSelectUI();
    };

    this.modals = new IdeaModalsController(this);
    this.mcpChat = new McpChatManager(this);

    this.bindEvents();
    await this.loadGraphData();
    await this.modals.loadBomSummary();
  }

  bindEvents() {
    // Search Autocomplete
    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => this.handleSearch());
      this.searchInput.addEventListener('focus', () => this.handleSearch());
    }
    document.addEventListener('click', (e) => {
      if (this.searchResults && !this.searchInput.contains(e.target) && !this.searchResults.contains(e.target)) {
        this.searchResults.style.display = 'none';
      }
      if (this.targetSearchResults && !this.targetSkillSearchInput.contains(e.target) && !this.targetSearchResults.contains(e.target)) {
        this.targetSearchResults.style.display = 'none';
      }
    });

    // Theme Switcher
    if (this.themeSelect) {
      this.themeSelect.addEventListener('change', (e) => {
        document.body.className = e.target.value;
      });
    }

    // New Project Button & Modal
    if (this.btnCreateNewIdea) {
      this.btnCreateNewIdea.addEventListener('click', () => this.openNewIdeaModal());
    }
    if (this.btnCloseNewIdeaModal) {
      this.btnCloseNewIdeaModal.addEventListener('click', () => this.closeNewIdeaModal());
    }
    if (this.btnCancelNewIdeaModal) {
      this.btnCancelNewIdeaModal.addEventListener('click', () => this.closeNewIdeaModal());
    }
    if (this.btnSubmitNewIdeaModal) {
      this.btnSubmitNewIdeaModal.addEventListener('click', () => this.submitNewIdea());
    }
    if (this.newIdeaModalBackdrop) {
      this.newIdeaModalBackdrop.addEventListener('click', (e) => {
        if (e.target === this.newIdeaModalBackdrop) this.closeNewIdeaModal();
      });
    }
    if (this.newIdeaTitleInput) {
      this.newIdeaTitleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.submitNewIdea();
      });
    }

    // Auto-save category and status on inspector change
    if (this.inspCategoryInput) {
      this.inspCategoryInput.addEventListener('change', () => {
        if (this.selectedNode) {
          this.selectedNode.category = this.inspCategoryInput.value.trim() || 'General';
          this.saveAllCurrentNodeChanges();
        }
      });
    }
    if (this.inspStatusSelect) {
      this.inspStatusSelect.addEventListener('change', () => {
        if (this.selectedNode) {
          this.selectedNode.status = this.inspStatusSelect.value;
          this.saveAllCurrentNodeChanges();
        }
      });
    }

    // Export Mindmap
    if (this.btnExportGraph) {
      this.btnExportGraph.addEventListener('click', () => this.exportMindmapJson());
    }

    // Multi-Select Mode Events
    if (this.btnToggleMultiSelect) {
      this.btnToggleMultiSelect.addEventListener('click', () => this.toggleMultiSelectMode());
    }
    if (this.btnDeselectAllNodes) {
      this.btnDeselectAllNodes.addEventListener('click', () => this.deselectAllNodes());
    }
    if (this.btnInspectorDeselectAll) {
      this.btnInspectorDeselectAll.addEventListener('click', () => this.deselectAllNodes());
    }
    if (this.btnExitMultiSelect) {
      this.btnExitMultiSelect.addEventListener('click', () => this.toggleMultiSelectMode(false));
    }
    if (this.btnToggleAddToSelection) {
      this.btnToggleAddToSelection.addEventListener('click', () => this.toggleCurrentNodeInSelection());
    }
    if (this.btnViewSelectedBom) {
      this.btnViewSelectedBom.addEventListener('click', () => {
        if (this.modals) this.modals.openBomModal('selected');
      });
    }

    // Layout & Visualization Controls
    if (this.layoutModeSelect) {
      this.layoutModeSelect.addEventListener('change', (e) => this.graph3d.setLayoutMode(e.target.value));
    }
    if (this.nodeSizeModeSelect) {
      this.nodeSizeModeSelect.addEventListener('change', (e) => this.graph3d.setNodeSizeMode(e.target.value));
    }
    if (this.nodeColorModeSelect) {
      this.nodeColorModeSelect.addEventListener('change', (e) => this.graph3d.setNodeColorMode(e.target.value));
    }

    // HUD Camera Buttons
    if (this.btnResetCamera) {
      this.btnResetCamera.addEventListener('click', () => this.graph3d.resetCamera());
    }
    if (this.btnToggleAutoRotate) {
      this.btnToggleAutoRotate.addEventListener('click', () => {
        const rotating = this.graph3d.toggleAutoRotate();
        this.btnToggleAutoRotate.classList.toggle('active', rotating);
      });
    }
    if (this.btnTakeSnapshot) {
      this.btnTakeSnapshot.addEventListener('click', () => this.takeSnapshot());
    }
    if (this.btnToggleHorizon) {
      this.btnToggleHorizon.addEventListener('click', () => {
        const active = this.graph3d.toggleHorizonMode();
        this.btnToggleHorizon.classList.toggle('active', active);
      });
    }

    // Inspector Panel Close
    if (this.btnCloseInspector) {
      this.btnCloseInspector.addEventListener('click', () => this.closeInspector());
    }

    // Inspector Tabs Switcher
    this.inspTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchInspectorTab(targetTab);
      });
    });

    // Markdown Editor Toolbar & Modes
    if (this.btnMdEditMode) {
      this.btnMdEditMode.addEventListener('click', () => this.setMarkdownMode('edit'));
    }
    if (this.btnMdPreviewMode) {
      this.btnMdPreviewMode.addEventListener('click', () => this.setMarkdownMode('preview'));
    }
    this.mdToolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const insert = btn.getAttribute('data-insert') || '';
        const close = btn.getAttribute('data-close') || '';
        this.insertMarkdownSyntax(insert, close);
      });
    });

    // Markdown Notes Save
    if (this.btnSaveMarkdownNotes) {
      this.btnSaveMarkdownNotes.addEventListener('click', () => this.saveCurrentNodeNotes());
    }

    // BOM Management
    if (this.btnAddBomItem) {
      this.btnAddBomItem.addEventListener('click', () => this.addBomItem());
    }
    if (this.newBomItemName) {
      this.newBomItemName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.addBomItem();
      });
    }

    // Connection Search
    if (this.targetSkillSearchInput) {
      this.targetSkillSearchInput.addEventListener('input', () => this.handleTargetSearch());
    }
    if (this.btnAiProposeLink) {
      this.btnAiProposeLink.addEventListener('click', () => this.proposeAiLink());
    }
    if (this.btnEstablishLink) {
      this.btnEstablishLink.addEventListener('click', () => this.establishConnection());
    }

    // Save All Changes & Focus & Delete
    if (this.btnSaveAllChanges) {
      this.btnSaveAllChanges.addEventListener('click', () => this.saveAllCurrentNodeChanges());
    }
    if (this.btnFocusNode) {
      this.btnFocusNode.addEventListener('click', () => {
        if (this.selectedNode) this.graph3d.focusOnNode(this.selectedNode.id);
      });
    }
    if (this.btnDeleteIdea) {
      this.btnDeleteIdea.addEventListener('click', () => this.deleteCurrentIdea());
    }
    if (this.btnDeleteIdeaHeader) {
      this.btnDeleteIdeaHeader.addEventListener('click', () => this.deleteCurrentIdea());
    }

    // Confirm Modal Listeners
    if (this.btnCloseConfirmModal) {
      this.btnCloseConfirmModal.addEventListener('click', () => this.closeConfirmDialog(false));
    }
    if (this.btnCancelConfirmModal) {
      this.btnCancelConfirmModal.addEventListener('click', () => this.closeConfirmDialog(false));
    }
    if (this.btnAcceptConfirmModal) {
      this.btnAcceptConfirmModal.addEventListener('click', () => this.closeConfirmDialog(true));
    }
    if (this.confirmModalBackdrop) {
      this.confirmModalBackdrop.addEventListener('click', (e) => {
        if (e.target === this.confirmModalBackdrop) this.closeConfirmDialog(false);
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.newIdeaModalBackdrop && (this.newIdeaModalBackdrop.classList.contains('active') || this.newIdeaModalBackdrop.classList.contains('open'))) {
          this.closeNewIdeaModal();
        }
        if (this.confirmModalBackdrop && (this.confirmModalBackdrop.classList.contains('active') || this.confirmModalBackdrop.classList.contains('open'))) {
          this.closeConfirmDialog(false);
        }
      }
    });
  }

  async loadGraphData() {
    try {
      const url = this.activeCategory && this.activeCategory !== 'all' 
        ? `/api/graph?category=${encodeURIComponent(this.activeCategory)}` 
        : '/api/graph';

      const resp = await fetch(url);
      const data = await resp.json();

      this.allNodes = data.nodes || [];
      this.allEdges = data.edges || [];

      // Update HUD stats
      if (this.statSkillsCount) this.statSkillsCount.textContent = data.total_ideas || this.allNodes.length;
      if (this.statEdgesCount) this.statEdgesCount.textContent = data.total_connections || this.allEdges.length;
      if (this.statSharedBomCount) this.statSharedBomCount.textContent = data.shared_bom_count || 0;

      // Render Categories
      this.renderCategoryPills(data.categories || []);

      // Feed into 3D graph
      this.graph3d.setData(this.allNodes, this.allEdges);

      // Refresh inspector if an idea is already selected
      if (this.selectedNode) {
        const fresh = this.allNodes.find(n => n.id === this.selectedNode.id);
        if (fresh) {
          this.onNodeSelected(fresh);
        } else {
          this.closeInspector();
        }
      }
    } catch (err) {
      console.error('Failed to load graph data:', err);
      this.showToast('Failed to load mindmap data.', 'error');
    }
  }

  renderCategoryPills(categories) {
    if (this.categoryDatalist) {
      this.categoryDatalist.innerHTML = categories.map(cat => `<option value="${cat}">`).join('');
    }

    if (!this.categoryPillsContainer) return;

    let html = `<button class="layer-btn ${this.activeCategory === 'all' ? 'active' : ''}" data-category="all">All</button>`;
    categories.forEach(cat => {
      const isActive = this.activeCategory && this.activeCategory.toLowerCase() === cat.toLowerCase();
      html += `<button class="layer-btn ${isActive ? 'active' : ''}" data-category="${cat}">${cat}</button>`;
    });

    this.categoryPillsContainer.innerHTML = html;

    const btns = this.categoryPillsContainer.querySelectorAll('.layer-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeCategory = btn.getAttribute('data-category');
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        this.loadGraphData();
      });
    });

    // Horizontal mouse wheel & drag scrolling for category pills
    if (!this._categoryWheelBound) {
      this._categoryWheelBound = true;
      this.setupCategoryPillsScrolling();
    }
    setTimeout(() => this.updateCategoryPillScrollButtons(), 60);
  }

  updateCategoryPillScrollButtons() {
    if (!this.categoryPillsContainer) return;
    const btnLeft = document.getElementById('btnScrollPillsLeft');
    const btnRight = document.getElementById('btnScrollPillsRight');
    const el = this.categoryPillsContainer;
    const canScroll = el.scrollWidth > el.clientWidth + 2;
    if (btnLeft) {
      btnLeft.classList.toggle('hidden', !canScroll || el.scrollLeft <= 4);
    }
    if (btnRight) {
      btnRight.classList.toggle('hidden', !canScroll || el.scrollLeft >= el.scrollWidth - el.clientWidth - 4);
    }
  }

  setupCategoryPillsScrolling() {
    if (!this.categoryPillsContainer) return;

    // Mouse wheel horizontal scroll
    this.categoryPillsContainer.addEventListener('wheel', (e) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta !== 0) {
        e.preventDefault();
        this.categoryPillsContainer.scrollLeft += delta;
        this.updateCategoryPillScrollButtons();
      }
    }, { passive: false });

    this.categoryPillsContainer.addEventListener('scroll', () => {
      this.updateCategoryPillScrollButtons();
    });

    // Drag to scroll
    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasDragged = false;

    this.categoryPillsContainer.addEventListener('mousedown', (e) => {
      isDown = true;
      hasDragged = false;
      this.categoryPillsContainer.classList.add('grabbing');
      startX = e.pageX - this.categoryPillsContainer.offsetLeft;
      startScrollLeft = this.categoryPillsContainer.scrollLeft;
    });

    window.addEventListener('mouseup', () => {
      if (isDown) {
        isDown = false;
        this.categoryPillsContainer.classList.remove('grabbing');
      }
    });

    this.categoryPillsContainer.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - this.categoryPillsContainer.offsetLeft;
      const walk = (x - startX) * 1.5;
      if (Math.abs(walk) > 4) hasDragged = true;
      this.categoryPillsContainer.scrollLeft = startScrollLeft - walk;
      this.updateCategoryPillScrollButtons();
    });

    this.categoryPillsContainer.addEventListener('click', (e) => {
      if (hasDragged) {
        e.stopPropagation();
        e.preventDefault();
        hasDragged = false;
      }
    }, true);

    const btnLeft = document.getElementById('btnScrollPillsLeft');
    const btnRight = document.getElementById('btnScrollPillsRight');
    if (btnLeft) {
      btnLeft.addEventListener('click', () => {
        this.categoryPillsContainer.scrollBy({ left: -180, behavior: 'smooth' });
        setTimeout(() => this.updateCategoryPillScrollButtons(), 250);
      });
    }
    if (btnRight) {
      btnRight.addEventListener('click', () => {
        this.categoryPillsContainer.scrollBy({ left: 180, behavior: 'smooth' });
        setTimeout(() => this.updateCategoryPillScrollButtons(), 250);
      });
    }

    window.addEventListener('resize', () => this.updateCategoryPillScrollButtons());
  }

  onNodeSelected(node) {
    if (!node) {
      this.closeInspector(false);
      return;
    }

    this.selectedNode = node;
    this.openInspector();

    // Fill Header
    if (this.inspStatusSelect) this.inspStatusSelect.value = node.status || 'concept';
    if (this.inspCategoryInput) this.inspCategoryInput.value = node.category || 'General';
    if (this.inspTitleInput) this.inspTitleInput.value = node.title || node.name || '';
    if (this.inspTagsInput) this.inspTagsInput.value = (node.tags || []).join(', ');

    // Fill Markdown Editor
    if (this.inspMarkdownTextarea) {
      this.inspMarkdownTextarea.value = node.content_markdown || `# ${node.title}\n\n${node.description}\n`;
    }
    this.updateMarkdownPreview();
    this.setMarkdownMode('edit');

    // Fill BOM
    this.renderNodeBom(node.bom || []);

    // Fill Connections
    this.renderNodeConnections(node.id);

    // Multi-Hop Cascade Influence
    this.renderCascadeDistribution(node);

    // Fetch and render similarities
    this.fetchAndRenderSimilarities(node.id);

    // Sync multi-select inspector buttons
    this.updateMultiSelectUI();

    // Reset Link Target
    this.selectedLinkTarget = null;
    if (this.selectedTargetContainer) this.selectedTargetContainer.style.display = 'none';
    if (this.targetSkillSearchInput) this.targetSkillSearchInput.value = '';
    if (this.btnEstablishLink) this.btnEstablishLink.disabled = true;
  }


  renderCascadeDistribution(node) {
    const container = document.getElementById('inspCascadeContainer');
    const summaryBadge = document.getElementById('cascadeHopsSummary');
    if (!container) return;

    container.innerHTML = '';

    const downstream = this.graph3d.cascadeDownstreamHops || {};
    const upstream = this.graph3d.cascadeUpstreamHops || {};

    const hopGroups = { 1: [], 2: [], 3: [] };
    let totalDownstream = 0;

    Object.entries(downstream).forEach(([nid, info]) => {
      if (nid === node.id) return;
      const targetNode = this.allNodes.find(n => n.id === nid);
      if (!targetNode) return;
      const hop = info.hop;
      totalDownstream++;
      if (hop === 1) hopGroups[1].push({ node: targetNode, transfer: info.transfer });
      else if (hop === 2) hopGroups[2].push({ node: targetNode, transfer: info.transfer });
      else hopGroups[3].push({ node: targetNode, transfer: info.transfer, hop });
    });

    const upstreamList = [];
    Object.entries(upstream).forEach(([nid, info]) => {
      if (nid === node.id) return;
      const sourceNode = this.allNodes.find(n => n.id === nid);
      if (sourceNode) upstreamList.push({ node: sourceNode, hop: info.hop });
    });

    if (summaryBadge) {
      summaryBadge.textContent = `${totalDownstream} Cascade Ripples`;
    }

    if (totalDownstream === 0 && upstreamList.length === 0) {
      container.innerHTML = `<div style="font-size: 0.78rem; color: var(--text-muted);">No multi-hop ripples detected for this project.</div>`;
      return;
    }

    // Render Hop 1
    if (hopGroups[1].length > 0) {
      const g = document.createElement('div');
      g.className = 'cascade-hop-group';
      g.innerHTML = `
        <div class="cascade-hop-header hop-1">
          <span>⚡ Direct Reach (Hop 1)</span>
          <span>${hopGroups[1].length} projects</span>
        </div>
        <div class="cascade-cards-grid">
          ${hopGroups[1].map(item => `
            <div class="cascade-node-card" data-id="${item.node.id}" title="${item.node.title || item.node.name}">
              <span class="cascade-node-name">${item.node.title || item.node.name}</span>
              <span class="cascade-flow-pct hop-1">${Math.round((item.transfer || 0.8) * 100)}% Synergy</span>
            </div>
          `).join('')}
        </div>
      `;
      g.querySelectorAll('.cascade-node-card').forEach(card => {
        card.addEventListener('click', () => {
          this.graph3d.focusOnNode(card.getAttribute('data-id'));
        });
      });
      container.appendChild(g);
    }

    // Render Hop 2
    if (hopGroups[2].length > 0) {
      const g = document.createElement('div');
      g.className = 'cascade-hop-group';
      g.innerHTML = `
        <div class="cascade-hop-header hop-2">
          <span>🌿 Secondary Ripple (Hop 2)</span>
          <span>${hopGroups[2].length} projects</span>
        </div>
        <div class="cascade-cards-grid">
          ${hopGroups[2].map(item => `
            <div class="cascade-node-card" data-id="${item.node.id}" title="${item.node.title || item.node.name}">
              <span class="cascade-node-name">${item.node.title || item.node.name}</span>
              <span class="cascade-flow-pct hop-2">${Math.round((item.transfer || 0.6) * 100)}% Synergy</span>
            </div>
          `).join('')}
        </div>
      `;
      g.querySelectorAll('.cascade-node-card').forEach(card => {
        card.addEventListener('click', () => {
          this.graph3d.focusOnNode(card.getAttribute('data-id'));
        });
      });
      container.appendChild(g);
    }

    // Render Hop 3+
    if (hopGroups[3].length > 0) {
      const g = document.createElement('div');
      g.className = 'cascade-hop-group';
      g.innerHTML = `
        <div class="cascade-hop-header hop-3">
          <span>✨ Extended Cascade (Hop 3+)</span>
          <span>${hopGroups[3].length} projects</span>
        </div>
        <div class="cascade-cards-grid">
          ${hopGroups[3].map(item => `
            <div class="cascade-node-card" data-id="${item.node.id}" title="${item.node.title || item.node.name}">
              <span class="cascade-node-name">${item.node.title || item.node.name}</span>
              <span class="cascade-flow-pct hop-3">${Math.round((item.transfer || 0.4) * 100)}% Synergy</span>
            </div>
          `).join('')}
        </div>
      `;
      g.querySelectorAll('.cascade-node-card').forEach(card => {
        card.addEventListener('click', () => {
          this.graph3d.focusOnNode(card.getAttribute('data-id'));
        });
      });
      container.appendChild(g);
    }

    // Render Upstream
    if (upstreamList.length > 0) {
      const g = document.createElement('div');
      g.className = 'cascade-hop-group';
      g.innerHTML = `
        <div class="cascade-hop-header hop-upstream">
          <span>🏛️ Foundational Roots</span>
          <span>${upstreamList.length} projects</span>
        </div>
        <div class="cascade-cards-grid">
          ${upstreamList.map(item => `
            <div class="cascade-node-card" data-id="${item.node.id}" title="${item.node.title || item.node.name}">
              <span class="cascade-node-name">${item.node.title || item.node.name}</span>
              <span class="cascade-flow-pct hop-upstream">Root Feeder</span>
            </div>
          `).join('')}
        </div>
      `;
      g.querySelectorAll('.cascade-node-card').forEach(card => {
        card.addEventListener('click', () => {
          this.graph3d.focusOnNode(card.getAttribute('data-id'));
        });
      });
      container.appendChild(g);
    }
  }

  openInspector() {
    if (this.inspectorPanel) this.inspectorPanel.classList.add('open');
  }

  closeInspector(deselectGraph = true) {
    if (this._isClosingInspector) return;
    this._isClosingInspector = true;
    try {
      if (this.inspectorPanel) this.inspectorPanel.classList.remove('open');
      this.selectedNode = null;
      if (deselectGraph && this.graph3d && !this.isMultiSelectMode) {
        this.graph3d.clearSelection(false);
      }
      this.updateMultiSelectUI();
    } finally {
      this._isClosingInspector = false;
    }
  }

  showConfirmDialog({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Delete Idea', danger = true } = {}) {
    if (!this.confirmModalBackdrop) {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }

    if (this.confirmModalTitle) this.confirmModalTitle.textContent = title;
    if (this.confirmModalMessage) this.confirmModalMessage.textContent = message;
    if (this.btnAcceptConfirmModal) {
      this.btnAcceptConfirmModal.textContent = confirmText;
      if (danger) {
        this.btnAcceptConfirmModal.style.background = '#ef4444';
        this.btnAcceptConfirmModal.style.borderColor = '#ef4444';
        this.btnAcceptConfirmModal.style.color = '#ffffff';
      } else {
        this.btnAcceptConfirmModal.style.background = 'var(--neon-blue)';
        this.btnAcceptConfirmModal.style.borderColor = 'var(--neon-blue)';
        this.btnAcceptConfirmModal.style.color = '#ffffff';
      }
    }

    this.confirmModalBackdrop.classList.add('active');
    this.confirmModalBackdrop.classList.add('open');
    this.confirmModalBackdrop.style.display = 'flex';
    this.confirmModalBackdrop.style.opacity = '1';
    this.confirmModalBackdrop.style.pointerEvents = 'auto';
    this.confirmModalBackdrop.setAttribute('aria-hidden', 'false');

    return new Promise((resolve) => {
      this._confirmResolver = resolve;
    });
  }

  closeConfirmDialog(result = false) {
    if (this.confirmModalBackdrop) {
      this.confirmModalBackdrop.classList.remove('active');
      this.confirmModalBackdrop.classList.remove('open');
      this.confirmModalBackdrop.style.display = 'none';
      this.confirmModalBackdrop.style.opacity = '0';
      this.confirmModalBackdrop.style.pointerEvents = 'none';
      this.confirmModalBackdrop.setAttribute('aria-hidden', 'true');
    }
    if (this._confirmResolver) {
      const res = this._confirmResolver;
      this._confirmResolver = null;
      res(result);
    }
  }

  switchInspectorTab(tabId) {
    this.inspTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    this.inspTabPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    if (tabId === 'tabNotes') {
      this.updateMarkdownPreview();
    }
  }

  setMarkdownMode(mode) {
    if (mode === 'preview') {
      this.updateMarkdownPreview();
      if (this.inspMarkdownTextarea) this.inspMarkdownTextarea.style.display = 'none';
      if (this.inspMarkdownPreview) this.inspMarkdownPreview.style.display = 'block';
      if (this.btnMdPreviewMode) this.btnMdPreviewMode.classList.add('active');
      if (this.btnMdEditMode) this.btnMdEditMode.classList.remove('active');
    } else {
      if (this.inspMarkdownTextarea) this.inspMarkdownTextarea.style.display = 'block';
      if (this.inspMarkdownPreview) this.inspMarkdownPreview.style.display = 'none';
      if (this.btnMdEditMode) this.btnMdEditMode.classList.add('active');
      if (this.btnMdPreviewMode) this.btnMdPreviewMode.classList.remove('active');
    }
  }

  updateMarkdownPreview() {
    if (!this.inspMarkdownPreview || !this.inspMarkdownTextarea) return;
    const raw = this.inspMarkdownTextarea.value || '';
    if (window.marked && typeof marked.parse === 'function') {
      this.inspMarkdownPreview.innerHTML = marked.parse(raw);
    } else {
      this.inspMarkdownPreview.textContent = raw;
    }
  }

  insertMarkdownSyntax(insert, close = '') {
    if (!this.inspMarkdownTextarea) return;
    const el = this.inspMarkdownTextarea;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const sel = text.substring(start, end);

    const replacement = insert + sel + close;
    el.value = text.substring(0, start) + replacement + text.substring(end);
    el.focus();
    el.selectionStart = start + insert.length;
    el.selectionEnd = start + insert.length + sel.length;
  }

  async saveCurrentNodeNotes() {
    if (!this.selectedNode) return;

    if (this.inspTitleInput) this.selectedNode.title = this.inspTitleInput.value.trim() || this.selectedNode.title;
    if (this.inspCategoryInput) this.selectedNode.category = this.inspCategoryInput.value.trim() || this.selectedNode.category || 'General';
    if (this.inspStatusSelect) this.selectedNode.status = this.inspStatusSelect.value;
    if (this.inspTagsInput) {
      const tagsStr = this.inspTagsInput.value.trim();
      this.selectedNode.tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    }

    const rawMarkdown = this.inspMarkdownTextarea ? this.inspMarkdownTextarea.value : '';
    if (this.markdownSaveStatus) this.markdownSaveStatus.textContent = 'Saving...';

    this.selectedNode.content_markdown = rawMarkdown;

    try {
      const resp = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.selectedNode)
      });
      const res = await resp.json();

      if (res.success) {
        if (this.markdownSaveStatus) this.markdownSaveStatus.textContent = 'Saved to ideas/' + this.selectedNode.id + '.md';
        this.showToast('Markdown notes saved!', 'success');
      } else {
        if (this.markdownSaveStatus) this.markdownSaveStatus.textContent = 'Save failed';
      }
    } catch (err) {
      if (this.markdownSaveStatus) this.markdownSaveStatus.textContent = 'Error saving';
      this.showToast(err.message, 'error');
    }
  }

  renderNodeBom(bomItems) {
    if (!this.inspBomList) return;

    if (!bomItems || bomItems.length === 0) {
      this.inspBomList.innerHTML = '<div style="font-size: 0.78rem; color: var(--text-muted);">No components listed yet.</div>';
      return;
    }

    const html = bomItems.map((b, idx) => {
      return `
        <div class="bom-item-card">
          <div class="bom-item-info">
            <div class="bom-item-title">
              <span class="bom-qty-chip">x${b.qty || 1}</span>
              ${b.item}
            </div>
            ${b.notes ? `<div class="bom-item-notes">${b.notes}</div>` : ''}
          </div>
          <button class="panel-close-btn btn-delete-bom" data-idx="${idx}" title="Remove Part" style="width: 24px; height: 24px;">×</button>
        </div>
      `;
    }).join('');

    this.inspBomList.innerHTML = html;

    const delBtns = this.inspBomList.querySelectorAll('.btn-delete-bom');
    delBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        this.selectedNode.bom.splice(idx, 1);
        this.renderNodeBom(this.selectedNode.bom);
        await this.saveCurrentNodeNotes();
        await this.modals.loadBomSummary();
        await this.loadGraphData();
      });
    });
  }

  addBomItem() {
    if (!this.selectedNode) return;
    const name = this.newBomItemName.value.trim();
    if (!name) return;

    const qty = parseInt(this.newBomItemQty.value, 10) || 1;
    const notes = this.newBomItemNotes.value.trim();

    if (!this.selectedNode.bom) this.selectedNode.bom = [];
    this.selectedNode.bom.push({ item: name, qty: qty, notes: notes });

    this.newBomItemName.value = '';
    this.newBomItemNotes.value = '';
    this.newBomItemQty.value = '1';

    this.renderNodeBom(this.selectedNode.bom);
    this.saveCurrentNodeNotes();
    this.modals.loadBomSummary();
  }

  renderNodeConnections(nodeId) {
    if (!this.inspOutgoingList) return;

    const outgoing = this.allEdges.filter(e => {
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      return src === nodeId;
    });
    const incoming = this.allEdges.filter(e => {
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      return tgt === nodeId;
    });

    const conns = [...outgoing, ...incoming];

    if (conns.length === 0) {
      this.inspOutgoingList.innerHTML = '<div style="font-size: 0.78rem; color: var(--text-muted);">No connections yet</div>';
      return;
    }

    const html = conns.map(e => {
      const srcId = typeof e.source === 'object' ? e.source.id : e.source;
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
      const isOutgoing = srcId === nodeId;
      const otherId = isOutgoing ? tgtId : srcId;
      const otherNode = this.allNodes.find(n => n.id === otherId);
      const otherTitle = otherNode ? otherNode.title : otherId;

      const isShared = e.relation_type === 'shared_bom' || (e.shared_parts && e.shared_parts.length);
      const badgeStyle = isShared 
        ? 'background: rgba(14, 165, 233, 0.2); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.3);'
        : 'background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);';

      const sharedPartsStr = (e.shared_parts && e.shared_parts.length) 
        ? `<div style="font-size: 0.70rem; color: #38bdf8; margin-top: 2px;">⚡ Shared: ${e.shared_parts.join(', ')}</div>` 
        : '';

      return `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--glass-border); border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 0.8rem; font-weight: 600; color: #f8fafc; cursor: pointer;" class="conn-jump" data-target="${otherId}">
              ${isOutgoing ? '→' : '←'} ${otherTitle}
            </div>
            <span style="font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; ${badgeStyle}">
              ${e.relation_type.replace('_', ' ').toUpperCase()}
            </span>
            ${sharedPartsStr}
          </div>
          <button class="panel-close-btn btn-delete-edge" data-src="${srcId}" data-tgt="${tgtId}" title="Delete Link">×</button>
        </div>
      `;
    }).join('');

    this.inspOutgoingList.innerHTML = html;

    // Jump to connected node on click
    this.inspOutgoingList.querySelectorAll('.conn-jump').forEach(elem => {
      elem.addEventListener('click', () => {
        const tgt = elem.getAttribute('data-target');
        this.graph3d.focusOnNode(tgt);
      });
    });

    // Delete edge
    this.inspOutgoingList.querySelectorAll('.btn-delete-edge').forEach(btn => {
      btn.addEventListener('click', async () => {
        const src = btn.getAttribute('data-src');
        const tgt = btn.getAttribute('data-tgt');
        await this.deleteConnection(src, tgt);
      });
    });
  }

  async fetchAndRenderSimilarities(nodeId) {
    if (!this.inspSimilaritiesList) return;
    this.inspSimilaritiesList.innerHTML = '<div style="font-size: 0.78rem; color: var(--text-muted);">Scanning for hardware similarities...</div>';

    try {
      const resp = await fetch(`/api/similarity/${nodeId}`);
      const sims = await resp.json();

      if (!sims || sims.length === 0) {
        this.inspSimilaritiesList.innerHTML = '<div style="font-size: 0.78rem; color: var(--text-muted);">No direct component synergies detected yet.</div>';
        return;
      }

      const html = sims.map(s => {
        const connectBtn = s.already_connected 
          ? '<span style="font-size: 0.70rem; color: #34d399;">✓ Connected</span>' 
          : `<button class="btn-action btn-quick-link" data-id="${s.idea_id}" data-parts="${(s.shared_parts || []).join(',')}" style="padding: 2px 8px; font-size: 0.72rem;">+ Link</button>`;

        return `
          <div class="similarity-card">
            <div class="sim-header">
              <span class="sim-title">${s.title}</span>
              ${connectBtn}
            </div>
            <div style="font-size: 0.72rem; color: #38bdf8;">📁 ${s.category}</div>
            <div class="sim-reason">${(s.reasons || []).join(' · ')}</div>
          </div>
        `;
      }).join('');

      this.inspSimilaritiesList.innerHTML = html;

      this.inspSimilaritiesList.querySelectorAll('.btn-quick-link').forEach(btn => {
        btn.addEventListener('click', async () => {
          const targetId = btn.getAttribute('data-id');
          const partsStr = btn.getAttribute('data-parts');
          const parts = partsStr ? partsStr.split(',').filter(Boolean) : [];
          await this.quickLinkIdeas(nodeId, targetId, parts);
        });
      });
    } catch (err) {
      this.inspSimilaritiesList.innerHTML = '<div style="font-size: 0.78rem; color: var(--text-muted);">Error detecting similarities.</div>';
    }
  }

  async quickLinkIdeas(sourceId, targetId, sharedParts) {
    try {
      const relType = sharedParts.length > 0 ? 'shared_bom' : 'synergy';
      const desc = sharedParts.length > 0 ? `Shared components: ${sharedParts.join(', ')}` : 'Synergy detected';

      const resp = await fetch('/api/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: sourceId,
          target: targetId,
          weight: 0.75,
          relation_type: relType,
          description: desc,
          shared_parts: sharedParts
        })
      });
      const res = await resp.json();

      if (res.success) {
        this.showToast('Projects connected!', 'success');
        await this.loadGraphData();
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  handleTargetSearch() {
    const q = this.targetSkillSearchInput.value.trim().toLowerCase();
    if (!q) {
      this.targetSearchResults.style.display = 'none';
      return;
    }

    const matches = this.allNodes.filter(n => {
      if (this.selectedNode && n.id === this.selectedNode.id) return false;
      return n.title.toLowerCase().includes(q) || (n.tags || []).some(t => t.toLowerCase().includes(q));
    }).slice(0, 5);

    if (matches.length === 0) {
      this.targetSearchResults.innerHTML = '<div style="padding: 6px 10px; font-size: 0.75rem; color: var(--text-muted);">No matching projects</div>';
      this.targetSearchResults.style.display = 'block';
      return;
    }

    this.targetSearchResults.innerHTML = matches.map(m => `
      <div class="search-result-item" data-id="${m.id}" style="padding: 6px 10px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <div style="font-weight: 600; font-size: 0.78rem; color: #f8fafc;">${m.title}</div>
        <div style="font-size: 0.68rem; color: #38bdf8;">📁 ${m.category}</div>
      </div>
    `).join('');
    this.targetSearchResults.style.display = 'block';

    this.targetSearchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        this.selectTargetProject(id);
      });
    });
  }

  selectTargetProject(targetId) {
    const target = this.allNodes.find(n => n.id === targetId);
    if (!target) return;

    this.selectedLinkTarget = target;
    this.targetSearchResults.style.display = 'none';
    this.targetSkillSearchInput.value = '';

    if (this.selectedTargetContainer) {
      this.selectedTargetContainer.style.display = 'block';
      this.selectedTargetContainer.innerHTML = `
        <div style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.8rem; font-weight: 600; color: #38bdf8;">🎯 Target: ${target.title}</span>
          <button class="panel-close-btn" id="btnClearTarget" style="width: 20px; height: 20px;">×</button>
        </div>
      `;
      document.getElementById('btnClearTarget').addEventListener('click', () => {
        this.selectedLinkTarget = null;
        this.selectedTargetContainer.style.display = 'none';
        this.btnEstablishLink.disabled = true;
      });
    }

    if (this.btnEstablishLink) this.btnEstablishLink.disabled = false;
  }

  async proposeAiLink() {
    if (!this.selectedNode || !this.selectedLinkTarget) {
      this.showToast('Please pick a target project to link with.', 'error');
      return;
    }

    this.btnAiProposeLink.disabled = true;
    this.btnAiProposeLink.textContent = '✨ Proposing...';

    try {
      const resp = await fetch('/api/ai/propose-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: this.selectedNode.id,
          target: this.selectedLinkTarget.id,
          use_ai: true
        })
      });
      const data = await resp.json();

      if (data.relation_type) this.linkRelationTypeSelect.value = data.relation_type;
      if (data.description) this.linkDescriptionInput.value = data.description;
      this.showToast('AI proposed connection details!', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      this.btnAiProposeLink.disabled = false;
      this.btnAiProposeLink.textContent = '✨ AI Propose';
    }
  }

  async establishConnection() {
    if (!this.selectedNode || !this.selectedLinkTarget) return;

    const relType = this.linkRelationTypeSelect.value;
    const desc = this.linkDescriptionInput.value.trim();

    try {
      const resp = await fetch('/api/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: this.selectedNode.id,
          target: this.selectedLinkTarget.id,
          weight: 0.75,
          relation_type: relType,
          description: desc
        })
      });
      const res = await resp.json();

      if (res.success) {
        this.showToast('Connection established!', 'success');
        this.linkDescriptionInput.value = '';
        this.selectedLinkTarget = null;
        if (this.selectedTargetContainer) this.selectedTargetContainer.style.display = 'none';
        await this.loadGraphData();
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  async deleteConnection(source, target) {
    try {
      // Optimistic edge removal
      this.allEdges = this.allEdges.filter(e => {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        return !((s === source && t === target) || (s === target && t === source));
      });
      if (this.graph3d) {
        this.graph3d.setData(this.allNodes, this.allEdges);
      }
      if (this.selectedNode) {
        this.renderNodeConnections(this.selectedNode.id);
        this.renderCascadeDistribution(this.selectedNode);
      }

      const resp = await fetch(`/api/edges?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`, {
        method: 'DELETE'
      });
      const res = await resp.json();
      if (res.success) {
        this.showToast('Connection deleted.', 'info');
        await this.loadGraphData();
        if (this.selectedNode) {
          this.renderNodeConnections(this.selectedNode.id);
          this.renderCascadeDistribution(this.selectedNode);
        }
      } else {
        this.showToast('Failed to delete connection.', 'error');
        await this.loadGraphData();
      }
    } catch (err) {
      console.error('Delete connection error:', err);
      this.showToast(err.message, 'error');
      await this.loadGraphData();
    }
  }

  async saveAllCurrentNodeChanges() {
    if (!this.selectedNode) return;

    this.selectedNode.title = this.inspTitleInput.value.trim() || this.selectedNode.title;
    this.selectedNode.category = this.inspCategoryInput.value.trim() || 'General';
    this.selectedNode.status = this.inspStatusSelect.value;
    this.selectedNode.content_markdown = this.inspMarkdownTextarea.value;

    const tagsStr = this.inspTagsInput.value.trim();
    this.selectedNode.tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    await this.saveCurrentNodeNotes();
    await this.loadGraphData();
    this.showToast('All changes saved to ' + this.selectedNode.id + '.md', 'success');
  }

  async deleteCurrentIdea() {
    if (!this.selectedNode) {
      this.showToast('Please select a project idea first to delete it.', 'info');
      return;
    }
    const idea = this.selectedNode;
    const ideaId = idea.id;
    const ideaTitle = idea.title || idea.name || ideaId;

    const confirmed = await this.showConfirmDialog({
      title: `Delete '${ideaTitle}'?`,
      message: `Are you sure you want to permanently delete ideas/${ideaId}.md and all its connections?`,
      confirmText: 'Delete Idea',
      danger: true
    });

    if (!confirmed) return;

    try {
      // 1. Optimistic removal from 3D scene & state
      this.allNodes = this.allNodes.filter(n => n.id !== ideaId);
      this.allEdges = this.allEdges.filter(e => {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        return s !== ideaId && t !== ideaId;
      });
      if (this.graph3d) {
        this.graph3d.setData(this.allNodes, this.allEdges);
        this.graph3d.clearSelection(false);
      }
      this.closeInspector(false);

      // 2. Call backend delete API
      const resp = await fetch(`/api/ideas/${encodeURIComponent(ideaId)}`, { method: 'DELETE' });
      const res = await resp.json();

      if (res.success) {
        this.showToast(`Deleted '${ideaTitle}'.`, 'info');
        await this.loadGraphData();
        if (this.modals && this.modals.loadBomSummary) {
          await this.modals.loadBomSummary();
        }
      } else {
        this.showToast(res.detail || 'Failed to delete idea.', 'error');
        await this.loadGraphData();
      }
    } catch (err) {
      console.error('Delete idea error:', err);
      this.showToast('Error deleting idea: ' + err.message, 'error');
      await this.loadGraphData();
    }
  }

  openNewIdeaModal() {
    if (!this.newIdeaModalBackdrop) return;
    if (this.newIdeaTitleInput) this.newIdeaTitleInput.value = '';
    if (this.newIdeaDescInput) this.newIdeaDescInput.value = '';
    if (this.newIdeaTagsInput) this.newIdeaTagsInput.value = '';
    if (this.newIdeaCategoryInput) {
      this.newIdeaCategoryInput.value = (this.activeCategory && this.activeCategory !== 'all') ? this.activeCategory : '';
    }
    if (this.newIdeaStatusSelect) this.newIdeaStatusSelect.value = 'concept';

    this.newIdeaModalBackdrop.classList.add('active', 'open');
    this.newIdeaModalBackdrop.style.display = 'flex';
    this.newIdeaModalBackdrop.style.opacity = '1';
    this.newIdeaModalBackdrop.style.pointerEvents = 'auto';
    this.newIdeaModalBackdrop.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
      if (this.newIdeaTitleInput) this.newIdeaTitleInput.focus();
    }, 60);
  }

  closeNewIdeaModal() {
    if (!this.newIdeaModalBackdrop) return;
    this.newIdeaModalBackdrop.classList.remove('active', 'open');
    this.newIdeaModalBackdrop.style.display = 'none';
    this.newIdeaModalBackdrop.style.opacity = '0';
    this.newIdeaModalBackdrop.style.pointerEvents = 'none';
    this.newIdeaModalBackdrop.setAttribute('aria-hidden', 'true');
  }

  async submitNewIdea() {
    const title = this.newIdeaTitleInput ? this.newIdeaTitleInput.value.trim() : '';
    if (!title) {
      this.showToast('Please enter a project title.', 'error');
      if (this.newIdeaTitleInput) this.newIdeaTitleInput.focus();
      return;
    }

    const category = (this.newIdeaCategoryInput && this.newIdeaCategoryInput.value.trim()) || 'General';
    const status = (this.newIdeaStatusSelect && this.newIdeaStatusSelect.value) || 'concept';
    const desc = (this.newIdeaDescInput && this.newIdeaDescInput.value.trim()) || 'New creative project concept.';
    const tagsRaw = (this.newIdeaTagsInput && this.newIdeaTagsInput.value.trim()) || '';
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `project-${Date.now()}`;

    const newIdea = {
      id: slug,
      title: title,
      name: title,
      category: category,
      status: status,
      description: desc,
      content_markdown: `# ${title}\n\n${desc}\n\n## Goals & Notes\n- Requirements\n- Hardware ideas\n`,
      tags: tags,
      bom: []
    };

    try {
      const resp = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIdea)
      });
      const res = await resp.json();

      if (res.success) {
        this.closeNewIdeaModal();
        this.showToast(`Created project '${title}' in '${category}'!`, 'success');
        await this.loadGraphData();
        const created = this.allNodes.find(n => n.id === slug);
        if (created) {
          this.onNodeSelected(created);
          if (this.graph3d) this.graph3d.focusOnNode(slug);
        }
      } else {
        this.showToast('Failed to create project: ' + (res.detail || 'Server error'), 'error');
      }
    } catch (err) {
      this.showToast('Error: ' + err.message, 'error');
    }
  }

  handleSearch() {
    const q = this.searchInput.value.trim().toLowerCase();
    if (!q) {
      this.searchResults.style.display = 'none';
      return;
    }

    const matches = this.allNodes.filter(n => {
      const titleMatch = (n.title || '').toLowerCase().includes(q);
      const descMatch = (n.description || '').toLowerCase().includes(q);
      const tagMatch = (n.tags || []).some(t => t.toLowerCase().includes(q));
      const bomMatch = (n.bom || []).some(b => (b.item || '').toLowerCase().includes(q));
      return titleMatch || descMatch || tagMatch || bomMatch;
    }).slice(0, 7);

    if (matches.length === 0) {
      this.searchResults.innerHTML = '<div style="padding: 8px 12px; font-size: 0.78rem; color: var(--text-muted);">No ideas or parts matched</div>';
      this.searchResults.style.display = 'block';
      return;
    }

    this.searchResults.innerHTML = matches.map(m => `
      <div class="search-result-item" data-id="${m.id}" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <div style="font-weight: 600; font-size: 0.82rem; color: #f8fafc;">${m.title}</div>
        <div style="font-size: 0.70rem; color: #38bdf8;">📁 ${m.category} · ${(m.bom && m.bom.length) || 0} BOM Parts</div>
      </div>
    `).join('');
    this.searchResults.style.display = 'block';

    this.searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        this.searchResults.style.display = 'none';
        this.searchInput.value = '';
        this.graph3d.focusOnNode(id);
      });
    });
  }

  takeSnapshot() {
    if (!this.graph3d || !this.graph3d.graph) return;
    const renderer = this.graph3d.graph.renderer();
    if (!renderer) return;

    const dataUrl = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `idea-mindmap-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    this.showToast('High-resolution snapshot saved!', 'success');
  }

  exportMindmapJson() {
    const payload = {
      version: '2.0.0',
      exported_at: new Date().toISOString(),
      ideas: this.allNodes,
      connections: this.allEdges
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `idea-mindmap-export-${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    this.showToast('Mindmap exported as JSON!', 'success');
  }

  showToast(message, type = 'info') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  toggleMultiSelectMode(forcedState = null) {
    this.isMultiSelectMode = (forcedState !== null) ? forcedState : !this.isMultiSelectMode;
    if (this.graph3d) {
      this.graph3d.setMultiSelectMode(this.isMultiSelectMode);
    }
    if (this.isMultiSelectMode) {
      if (this.selectedNode && this.selectedNodeIds.size === 0) {
        this.selectedNodeIds.add(this.selectedNode.id);
        if (this.graph3d) this.graph3d.addNodeToMultiSelect(this.selectedNode.id);
      }
      this.showToast('Multi-Select Mode active. Click nodes or Add to Selection.', 'info');
    } else {
      this.showToast('Exited Multi-Select Mode.', 'info');
    }
    this.updateMultiSelectUI();
  }

  toggleCurrentNodeInSelection() {
    if (!this.selectedNode) return;
    const nodeId = this.selectedNode.id;

    if (this.selectedNodeIds.has(nodeId)) {
      this.selectedNodeIds.delete(nodeId);
      if (this.graph3d) this.graph3d.removeNodeFromMultiSelect(nodeId);
      this.showToast(`Removed '${this.selectedNode.title || this.selectedNode.name}' from selection.`, 'info');
    } else {
      this.isMultiSelectMode = true;
      if (this.graph3d) this.graph3d.setMultiSelectMode(true);

      this.selectedNodeIds.add(nodeId);
      if (this.graph3d) this.graph3d.addNodeToMultiSelect(nodeId);
      this.showToast(`Added '${this.selectedNode.title || this.selectedNode.name}' to selection (${this.selectedNodeIds.size} selected).`, 'success');
    }
    this.updateMultiSelectUI();
  }

  deselectAllNodes() {
    this.selectedNodeIds.clear();
    if (this.graph3d) {
      this.graph3d.clearMultiSelection();
    }
    this.updateMultiSelectUI();
    this.showToast('Cleared all selected projects.', 'info');
  }

  updateMultiSelectUI() {
    const count = this.selectedNodeIds.size;

    // Navbar toggle button
    if (this.btnToggleMultiSelect) {
      this.btnToggleMultiSelect.classList.toggle('active-cyan', this.isMultiSelectMode);
    }
    if (this.multiSelectCountBadge) {
      if (count > 0) {
        this.multiSelectCountBadge.textContent = count;
        this.multiSelectCountBadge.style.display = 'inline-block';
      } else {
        this.multiSelectCountBadge.style.display = 'none';
      }
    }

    // Floating HUD Action Bar
    if (this.multiSelectActionBar) {
      if (this.isMultiSelectMode || count > 0) {
        this.multiSelectActionBar.style.display = 'flex';
      } else {
        this.multiSelectActionBar.style.display = 'none';
      }
    }
    if (this.multiSelectHudCount) {
      this.multiSelectHudCount.textContent = `${count} project${count === 1 ? '' : 's'} selected`;
    }
    if (this.btnViewSelectedBomCount) {
      this.btnViewSelectedBomCount.textContent = count;
    }
    if (this.btnViewSelectedBom) {
      this.btnViewSelectedBom.disabled = (count === 0);
    }

    // Inspector Add to Selection button
    if (this.btnToggleAddToSelection && this.btnToggleAddToSelectionText) {
      if (this.selectedNode && this.selectedNodeIds.has(this.selectedNode.id)) {
        this.btnToggleAddToSelectionText.textContent = 'Remove from Selection';
        this.btnToggleAddToSelection.classList.add('active-cyan');
      } else {
        this.btnToggleAddToSelectionText.textContent = 'Add to Selection';
        this.btnToggleAddToSelection.classList.remove('active-cyan');
      }
    }
    if (this.btnInspectorDeselectAll) {
      this.btnInspectorDeselectAll.style.display = (count > 0) ? 'inline-flex' : 'none';
    }

    // Update BOM modal badges if open
    if (this.modals && this.modals.updateBomScopeButtons) {
      this.modals.updateBomScopeButtons();
    }
  }

}

// Auto-launch on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new IdeaMindmapApp();
  window.app.start();
});
