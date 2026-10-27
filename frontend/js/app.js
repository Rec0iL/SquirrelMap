/**
 * app.js - Main Application Orchestrator for Creative Idea Mindmap
 * Handles graph loading, local Markdown editor synchronization, BOM management,
 * category filtering, connection linking, and toast notifications.
 */

const RELATION_LABELS = {
  shared_bom: 'Shared BOM',
  synergy: 'Synergy',
  related: 'Related',
  depends_on: 'Depends on',
  subproject: 'Sub-project'
};

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
    this.btnMdSplitMode = document.getElementById('btnMdSplitMode');
    this.mdEditorContainer = document.getElementById('mdEditorContainer');
    this.markdownSaveStatus = document.getElementById('markdownSaveStatus');
    this.inspectorResizeHandle = document.getElementById('inspectorResizeHandle');
    this.btnInspectorWide = document.getElementById('btnInspectorWide');
    this.inspBomCount = document.getElementById('inspBomCount');
    this.inspConnCount = document.getElementById('inspConnCount');

    // Unsaved inspector edits are saved automatically shortly after typing stops
    this.inspDirty = false;
    this.inspEditVersion = 0;
    this.inspSaveTimer = null;
    this.mdMode = this.loadPref('squirrelmap_notes_mode', 'read');
    this.lastCategories = [];
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
    this.linkDirectionHint = document.getElementById('linkDirectionHint');
    this.selectedLinkTarget = null;

    // Synergies & Similarities
    this.inspSimilaritiesList = document.getElementById('inspSimilaritiesList');

    // Inspector Bottom Actions
    this.btnSaveAllChanges = document.getElementById('btnSaveAllChanges');
    this.btnFocusNode = document.getElementById('btnFocusNode');
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

    // Inspector edits are tracked and saved automatically; status and category save right away
    [this.inspTitleInput, this.inspTagsInput, this.inspCategoryInput, this.inspMarkdownTextarea].forEach(el => {
      if (el) el.addEventListener('input', () => this.markInspectorDirty());
    });
    [this.inspStatusSelect, this.inspCategoryInput].forEach(el => {
      if (el) el.addEventListener('change', () => {
        this.markInspectorDirty();
        this.saveCurrentNodeNotes();
      });
    });
    if (this.inspMarkdownTextarea) {
      this.inspMarkdownTextarea.addEventListener('input', () => {
        if (this.mdMode !== 'split') return;
        clearTimeout(this._previewTimer);
        this._previewTimer = setTimeout(() => this.updateMarkdownPreview(), 200);
      });
    }
    if (this.inspMarkdownPreview) {
      this.inspMarkdownPreview.addEventListener('dblclick', () => {
        if (this.mdMode === 'read') this.setMarkdownMode('edit');
        if (this.inspMarkdownTextarea) this.inspMarkdownTextarea.focus();
      });
    }
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && this.selectedNode && this.inspectorPanel && this.inspectorPanel.classList.contains('open')) {
        e.preventDefault();
        this.saveCurrentNodeNotes();
      }
    });
    window.addEventListener('beforeunload', () => {
      // Last chance for edits typed less than a moment ago
      if (this.inspDirty && this.selectedNode) {
        this.collectInspectorEdits(this.selectedNode);
        fetch('/api/ideas', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.ideaPayload(this.selectedNode))
        });
      }
    });
    this.setupInspectorResize();

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
    [this.btnMdPreviewMode, this.btnMdEditMode, this.btnMdSplitMode].forEach(btn => {
      if (btn) btn.addEventListener('click', () => this.setMarkdownMode(btn.getAttribute('data-mode')));
    });
    this.mdToolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const insert = btn.getAttribute('data-insert') || '';
        const close = btn.getAttribute('data-close') || '';
        this.insertMarkdownSyntax(insert, close);
      });
    });

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
    if (this.linkRelationTypeSelect) {
      this.linkRelationTypeSelect.addEventListener('change', () => this.updateLinkDirectionHint());
    }

    // Save, Wide View, Focus & Delete
    if (this.btnSaveAllChanges) {
      this.btnSaveAllChanges.addEventListener('click', () => this.saveCurrentNodeNotes());
    }
    if (this.btnInspectorWide) {
      this.btnInspectorWide.addEventListener('click', () => this.toggleInspectorWide());
    }
    if (this.btnFocusNode) {
      this.btnFocusNode.addEventListener('click', () => {
        if (this.selectedNode) this.graph3d.focusOnNode(this.selectedNode.id);
      });
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
      this.lastCategories = data.categories || [];
      this.renderCategoryPills(this.lastCategories);

      // Feed into 3D graph
      this.graph3d.setData(this.allNodes, this.allEdges);

      // Refresh inspector if an idea is already selected
      if (this.selectedNode) {
        const fresh = this.allNodes.find(n => n.id === this.selectedNode.id);
        if (fresh) {
          this.onNodeSelected(fresh); // keeps unsaved edits in the editor
        } else {
          this.discardInspectorEdits(); // the project was deleted, e.g. by the agent
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

    const switching = !this.selectedNode || this.selectedNode.id !== node.id;
    if (switching) this.flushInspectorSave(); // save edits of the project being left

    this.selectedNode = node;
    this.openInspector();

    if (switching || !this.inspDirty) {
      this.inspDirty = false;
      this.fillInspectorFields(node);
      if (switching) this.setSaveStatus('All changes saved', '');
    } else {
      // Refreshed data for the same project while the user is typing: keep their edits
      this.collectInspectorEdits(node);
    }

    this.renderNodeBom(node.bom || []);
    this.renderNodeConnections(node.id);
    this.renderNetworkReach(node);
    this.fetchAndRenderSimilarities(node.id);
    this.updateMultiSelectUI();

    if (switching) {
      this.selectedLinkTarget = null;
      if (this.selectedTargetContainer) this.selectedTargetContainer.style.display = 'none';
      if (this.targetSkillSearchInput) this.targetSkillSearchInput.value = '';
      if (this.btnEstablishLink) this.btnEstablishLink.disabled = true;
    }
    this.updateLinkDirectionHint();
  }

  fillInspectorFields(node) {
    if (this.inspStatusSelect) this.inspStatusSelect.value = node.status || 'concept';
    if (this.inspCategoryInput) this.inspCategoryInput.value = node.category || 'General';
    if (this.inspTitleInput) this.inspTitleInput.value = node.title || node.name || '';
    if (this.inspTagsInput) this.inspTagsInput.value = (node.tags || []).join(', ');

    if (this.inspMarkdownTextarea) {
      const md = node.content_markdown || `# ${node.title}\n\n${node.description || ''}\n`;
      // Leave cursor and scroll position alone when the note did not change
      if (this.inspMarkdownTextarea.value !== md) {
        this.inspMarkdownTextarea.value = md;
        this.inspMarkdownTextarea.scrollTop = 0;
        if (this.inspMarkdownPreview) this.inspMarkdownPreview.scrollTop = 0;
      }
    }
    this.setMarkdownMode(this.mdMode);
  }

  // ---- Inspector editing & saving ----

  loadPref(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  savePref(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) { /* storage unavailable */ }
  }

  setSaveStatus(text, state) {
    if (!this.markdownSaveStatus) return;
    this.markdownSaveStatus.textContent = text;
    this.markdownSaveStatus.className = 'insp-save-status' + (state ? ' ' + state : '');
  }

  markInspectorDirty() {
    if (!this.selectedNode) return;
    this.inspDirty = true;
    this.inspEditVersion++;
    this.setSaveStatus('Unsaved changes…', 'dirty');
    clearTimeout(this.inspSaveTimer);
    this.inspSaveTimer = setTimeout(() => this.saveCurrentNodeNotes(), 1500);
  }

  discardInspectorEdits() {
    clearTimeout(this.inspSaveTimer);
    this.inspDirty = false;
  }

  /** Copies the inspector's form values onto a project object. */
  collectInspectorEdits(node) {
    if (this.inspTitleInput) node.title = this.inspTitleInput.value.trim() || node.title;
    node.name = node.title;
    if (this.inspCategoryInput) node.category = this.inspCategoryInput.value.trim() || node.category || 'General';
    if (this.inspStatusSelect) node.status = this.inspStatusSelect.value;
    if (this.inspTagsInput) {
      const tagsStr = this.inspTagsInput.value.trim();
      node.tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    }
    if (this.inspMarkdownTextarea) node.content_markdown = this.inspMarkdownTextarea.value;
  }

  /** Only the idea's own fields: graph nodes also carry positions and 3D objects that must not be sent. */
  ideaPayload(node) {
    return {
      id: node.id,
      title: node.title,
      name: node.title,
      category: node.category || 'General',
      status: node.status || 'concept',
      description: node.description || '',
      content_markdown: node.content_markdown || '',
      tags: node.tags || [],
      bom: (node.bom || []).map(b => ({ item: b.item, qty: b.qty || 1, notes: b.notes || '', link: b.link || '' })),
      created_at: node.created_at || null
    };
  }

  flushInspectorSave() {
    if (this.inspDirty && this.selectedNode) this.saveCurrentNodeNotes();
  }

  /** Applies saved fields to the graph's copies of the project so labels and colors update without a reload. */
  syncNodeToGraph(node) {
    const fields = ['title', 'name', 'category', 'status', 'tags', 'content_markdown', 'bom'];
    const copies = [this.allNodes.find(n => n.id === node.id)];
    if (this.graph3d && this.graph3d.graph) {
      copies.push(...this.graph3d.graph.graphData().nodes.filter(n => n.id === node.id));
    }
    copies.forEach(copy => {
      if (copy && copy !== node) fields.forEach(f => { copy[f] = node[f]; });
    });
    if (this.graph3d) this.graph3d.refreshStyles();
    if (node.category && !this.lastCategories.includes(node.category)) {
      this.lastCategories = [...this.lastCategories, node.category].sort();
      this.renderCategoryPills(this.lastCategories);
    }
  }

  // ---- Inspector width ----

  inspectorMaxWidth() {
    return Math.max(380, window.innerWidth - 32 - 96); // keep a strip of the graph visible
  }

  applyInspectorWidth(width, persist = false) {
    if (!this.inspectorPanel) return;
    this.inspectorPreferredWidth = width;
    const w = Math.round(Math.min(Math.max(width, 380), this.inspectorMaxWidth()));
    this.inspectorPanel.style.setProperty('--insp-width', `${w}px`);
    if (persist) this.savePref('squirrelmap_inspector_width', String(w));
    if (this.btnInspectorWide) this.btnInspectorWide.setAttribute('aria-pressed', String(w >= 720));
    this.updateMdModeButtons();
    this.updateInspectorReservedSpace();
  }

  setupInspectorResize() {
    if (!this.inspectorPanel) return;
    this.applyInspectorWidth(parseInt(this.loadPref('squirrelmap_inspector_width', '480'), 10) || 480);
    window.addEventListener('resize', () => this.applyInspectorWidth(this.inspectorPreferredWidth));
    if (!this.inspectorResizeHandle) return;

    this.inspectorResizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = this.inspectorPanel.offsetWidth;
      this.inspectorPanel.classList.add('resizing');
      const onMove = (ev) => this.applyInspectorWidth(startWidth + (startX - ev.clientX));
      const onUp = () => {
        this.inspectorPanel.classList.remove('resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        this.applyInspectorWidth(this.inspectorPanel.offsetWidth, true);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    this.inspectorResizeHandle.addEventListener('dblclick', () => this.toggleInspectorWide());
  }

  toggleInspectorWide() {
    if (!this.inspectorPanel) return;
    if (this.inspectorPanel.offsetWidth >= 720) {
      this.applyInspectorWidth(this.inspectorNarrowWidth || 480, true);
      if (this.mdMode === 'split') this.setMarkdownMode('edit');
    } else {
      this.inspectorNarrowWidth = this.inspectorPanel.offsetWidth;
      this.applyInspectorWidth(1100, true);
      if (this.mdMode === 'edit') this.setMarkdownMode('split');
    }
  }

  /** Projects 2-3 connections away from this one (direct connections are listed above). */
  renderNetworkReach(node) {
    const container = document.getElementById('inspCascadeContainer');
    const summary = document.getElementById('cascadeHopsSummary');
    if (!container) return;

    if (this.graph3d && this.graph3d.computeReach) this.graph3d.computeReach(node.id);
    const hops = (this.graph3d && this.graph3d.reachHops) || {};
    const groups = { 2: [], 3: [] };
    Object.entries(hops).forEach(([id, hop]) => {
      const other = groups[hop] && this.allNodes.find(n => n.id === id);
      if (other) groups[hop].push(other);
    });
    const total = groups[2].length + groups[3].length;
    if (summary) summary.textContent = total ? String(total) : '';

    if (total === 0) {
      container.innerHTML = '<div class="insp-hint">No projects 2–3 connections away.</div>';
      return;
    }

    container.innerHTML = [2, 3].filter(h => groups[h].length).map(h => `
      <div class="cascade-hop-group">
        <div class="cascade-hop-header hop-${h}">
          <span>${h} connections away</span>
          <span>${groups[h].length} project${groups[h].length === 1 ? '' : 's'}</span>
        </div>
        <div class="cascade-cards-grid">
          ${groups[h].map(n => `
            <div class="cascade-node-card" data-id="${escHtml(n.id)}" title="${escHtml(n.title || n.name)}">
              <span class="cascade-node-name">${escHtml(n.title || n.name)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
    container.querySelectorAll('.cascade-node-card').forEach(card => {
      card.addEventListener('click', () => this.graph3d.focusOnNode(card.getAttribute('data-id')));
    });
  }

  openInspector() {
    if (this.inspectorPanel) this.inspectorPanel.classList.add('open');
    this.updateInspectorReservedSpace();
  }

  /** Tells the view toolbar how much room the open inspector takes, so it wraps instead of covering it. */
  updateInspectorReservedSpace() {
    const open = this.inspectorPanel && this.inspectorPanel.classList.contains('open');
    const reserved = open ? this.inspectorPanel.offsetWidth + 32 : 0;
    document.documentElement.style.setProperty('--insp-reserved', `${reserved}px`);
  }

  closeInspector(deselectGraph = true) {
    if (this._isClosingInspector) return;
    this._isClosingInspector = true;
    try {
      this.flushInspectorSave();
      this.inspDirty = false;
      if (this.inspectorPanel) this.inspectorPanel.classList.remove('open');
      this.updateInspectorReservedSpace();
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
    if (!['read', 'edit', 'split'].includes(mode)) mode = 'read';
    this.mdMode = mode;
    this.savePref('squirrelmap_notes_mode', mode);
    if (this.mdEditorContainer) this.mdEditorContainer.className = `md-editor-container mode-${mode}`;
    if (mode !== 'edit') this.updateMarkdownPreview();
    this.updateMdModeButtons();
  }

  updateMdModeButtons() {
    // A narrow panel cannot show split view; it then works (and is shown) as edit
    const narrow = this.inspectorPanel && this.inspectorPanel.offsetWidth > 0 && this.inspectorPanel.offsetWidth < 720;
    const shown = this.mdMode === 'split' && narrow ? 'edit' : this.mdMode;
    [this.btnMdPreviewMode, this.btnMdEditMode, this.btnMdSplitMode].forEach(btn => {
      if (btn) btn.classList.toggle('active', btn.getAttribute('data-mode') === shown);
    });
  }

  updateMarkdownPreview() {
    if (!this.inspMarkdownPreview || !this.inspMarkdownTextarea) return;
    const raw = this.inspMarkdownTextarea.value || '';
    if (!raw.trim()) {
      this.inspMarkdownPreview.innerHTML = '<p class="md-preview-empty">No notes yet. Double-click here or press Edit to start writing.</p>';
      return;
    }
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
    this.markInspectorDirty();
    if (this.mdMode === 'split') this.updateMarkdownPreview();
  }

  async saveCurrentNodeNotes() {
    const node = this.selectedNode;
    if (!node) return false;
    clearTimeout(this.inspSaveTimer);

    // Read the form now: the user may switch projects before the request finishes
    this.collectInspectorEdits(node);
    const payload = this.ideaPayload(node);
    const version = this.inspEditVersion;
    const isShown = () => this.selectedNode && this.selectedNode.id === node.id;
    this.setSaveStatus('Saving…', 'dirty');

    try {
      const resp = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const res = await resp.json().catch(() => ({}));
      if (!resp.ok || !res.success) {
        throw new Error(res.detail ? JSON.stringify(res.detail).slice(0, 160) : `HTTP ${resp.status}`);
      }

      if (isShown()) {
        if (this.inspEditVersion === version) {
          this.inspDirty = false;
          const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          this.setSaveStatus(`Saved to ${node.id}.md · ${time}`, 'saved');
        } else {
          this.setSaveStatus('Unsaved changes…', 'dirty');
        }
      }
      this.syncNodeToGraph(node);
      return true;
    } catch (err) {
      if (isShown()) this.setSaveStatus(`Save failed: ${err.message}`, 'error');
      this.showToast(`Could not save "${node.title}": ${err.message}`, 'error');
      return false;
    }
  }

  renderNodeBom(bomItems) {
    if (!this.inspBomList) return;
    if (this.inspBomCount) this.inspBomCount.textContent = (bomItems && bomItems.length) ? String(bomItems.length) : '';

    if (!bomItems || bomItems.length === 0) {
      this.inspBomList.innerHTML = '<div class="insp-hint">No components listed yet.</div>';
      return;
    }

    const html = bomItems.map((b, idx) => {
      return `
        <div class="bom-item-card">
          <div class="bom-item-info">
            <div class="bom-item-title">
              <span class="bom-qty-chip">x${b.qty || 1}</span>
              ${escHtml(b.item)}
            </div>
            ${b.notes ? `<div class="bom-item-notes">${escHtml(b.notes)}</div>` : ''}
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

    // One card per connected project: links stored in both directions (A->B and B->A) are one connection
    const endId = end => (typeof end === 'object' ? end.id : end);
    const byProject = new Map();
    this.allEdges.forEach(e => {
      const src = endId(e.source);
      const tgt = endId(e.target);
      if (src !== nodeId && tgt !== nodeId) return;
      const otherId = src === nodeId ? tgt : src;
      if (!byProject.has(otherId)) byProject.set(otherId, []);
      byProject.get(otherId).push({ e, isSource: src === nodeId });
    });
    if (this.inspConnCount) this.inspConnCount.textContent = byProject.size ? String(byProject.size) : '';

    if (byProject.size === 0) {
      this.inspOutgoingList.innerHTML = '<div class="insp-hint">No connections yet. Link a project below or check the Synergies tab.</div>';
      return;
    }

    const colors = (this.graph3d && this.graph3d.edgeColors) || {};
    const unique = list => [...new Set(list.filter(Boolean))];
    this.inspOutgoingList.innerHTML = [...byProject.entries()].map(([otherId, links]) => {
      const other = this.allNodes.find(n => n.id === otherId);
      const otherTitle = other ? (other.title || other.name) : otherId;
      const types = unique(links.map(l => l.e.relation_type || 'related'));

      // Direction only means something for these two relations
      const directions = unique(links.map(({ e, isSource }) => {
        if (e.relation_type === 'depends_on') return isSource ? 'this project depends on it' : 'it depends on this project';
        if (e.relation_type === 'subproject') return isSource ? 'it is a sub-project of this one' : 'this is a sub-project of it';
        return '';
      }));
      const descriptions = unique(links.map(l => l.e.description));
      const parts = unique(links.flatMap(l => l.e.shared_parts || [])).join(', ');

      return `
        <div class="conn-item" style="--conn-color: ${colors[types[0]] || '#64748b'};">
          <span class="conn-item-stripe"></span>
          <div class="conn-item-main">
            <button class="conn-item-title conn-jump" data-target="${escHtml(otherId)}" title="Open this project">${escHtml(otherTitle)}</button>
            <div class="conn-item-meta">
              ${types.map(t => `<span class="conn-type-badge" style="--conn-color: ${colors[t] || '#64748b'};">${RELATION_LABELS[t] || escHtml(t)}</span>`).join('')}
              ${directions.map(d => `<span>${d}</span>`).join('')}
            </div>
            ${descriptions.map(d => `<div class="conn-item-desc">${escHtml(d)}</div>`).join('')}
            ${parts ? `<div class="conn-item-parts">⚡ Shared: ${escHtml(parts)}</div>` : ''}
          </div>
          <button class="panel-icon-btn btn-delete-edge" data-other="${escHtml(otherId)}" title="Remove this connection">
            <svg style="width: 14px; height: 14px; fill: currentColor;" viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      `;
    }).join('');

    this.inspOutgoingList.querySelectorAll('.conn-jump').forEach(elem => {
      elem.addEventListener('click', () => this.graph3d.focusOnNode(elem.getAttribute('data-target')));
    });
    this.inspOutgoingList.querySelectorAll('.btn-delete-edge').forEach(btn => {
      // The backend removes the link in both directions
      btn.addEventListener('click', async () => {
        await this.deleteConnection(nodeId, btn.getAttribute('data-other'));
      });
    });
  }

  updateLinkDirectionHint() {
    if (!this.linkDirectionHint || !this.linkRelationTypeSelect) return;
    const here = this.selectedNode ? `"${this.selectedNode.title}"` : 'This project';
    const target = this.selectedLinkTarget ? `"${this.selectedLinkTarget.title}"` : 'the target';
    const type = this.linkRelationTypeSelect.value;
    if (type === 'depends_on') {
      this.linkDirectionHint.textContent = `${here} depends on ${target}. The graph shows an arrow towards ${target}.`;
    } else if (type === 'subproject') {
      this.linkDirectionHint.textContent = `${target} becomes a sub-project of ${here}. The graph shows an arrow towards ${target}.`;
    } else {
      this.linkDirectionHint.textContent = 'Works both ways, no direction.';
    }
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
          <span style="font-size: 0.8rem; font-weight: 600; color: #38bdf8; min-width: 0; overflow-wrap: anywhere;">🎯 Target: ${escHtml(target.title)}</span>
          <button class="panel-close-btn" id="btnClearTarget" style="width: 20px; height: 20px;">×</button>
        </div>
      `;
      document.getElementById('btnClearTarget').addEventListener('click', () => {
        this.selectedLinkTarget = null;
        this.selectedTargetContainer.style.display = 'none';
        this.btnEstablishLink.disabled = true;
        this.updateLinkDirectionHint();
      });
    }

    if (this.btnEstablishLink) this.btnEstablishLink.disabled = false;
    this.updateLinkDirectionHint();
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
      this.updateLinkDirectionHint();
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
        this.renderNetworkReach(this.selectedNode);
      }

      const resp = await fetch(`/api/edges?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`, {
        method: 'DELETE'
      });
      const res = await resp.json();
      if (res.success) {
        this.showToast('Connection deleted.', 'info');
        await this.loadGraphData();
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
    this.discardInspectorEdits();

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
    if (this.btnToggleAddToSelection) {
      const inSelection = !!(this.selectedNode && this.selectedNodeIds.has(this.selectedNode.id));
      this.btnToggleAddToSelection.setAttribute('aria-pressed', String(inSelection));
      this.btnToggleAddToSelection.title = inSelection ? 'Remove from multi-selection' : 'Add to multi-selection';
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
