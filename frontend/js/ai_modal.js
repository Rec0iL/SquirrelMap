/**
 * ai_modal.js - AI Brainstorm & Consolidated BOM Modals for Creative Idea Mindmap
 */

class IdeaModalsController {
  constructor(app) {
    this.app = app;
    this.stagedIdea = null;

    // Brainstorm Modal Elements
    this.aiModalBackdrop = document.getElementById('aiModalBackdrop');
    this.btnOpenAiModal = document.getElementById('btnOpenAiModal');
    this.btnCloseAiModal = document.getElementById('btnCloseAiModal');
    this.btnCancelAiModal = document.getElementById('btnCancelAiModal');
    this.btnTriggerAiGenerate = document.getElementById('btnTriggerAiGenerate');
    this.btnCommitMerge = document.getElementById('btnCommitMerge');
    this.aiTopicInput = document.getElementById('aiTopicInput');
    this.aiCategoryInput = document.getElementById('aiCategoryInput');
    this.aiModelSelect = document.getElementById('aiModelSelect');
    this.diffPreviewSection = document.getElementById('diffPreviewSection');
    this.brainstormPreviewCard = document.getElementById('brainstormPreviewCard');

    // Consolidated BOM Modal Elements
    this.bomModalBackdrop = document.getElementById('bomModalBackdrop');
    this.bomModalTitle = document.getElementById('bomModalTitle');
    this.bomModalSubtitle = document.getElementById('bomModalSubtitle');
    this.btnBomScopeSelected = document.getElementById('btnBomScopeSelected');
    this.btnBomScopeAll = document.getElementById('btnBomScopeAll');
    this.bomSelectedCountBadge = document.getElementById('bomSelectedCountBadge');
    this.btnOpenBomModal = document.getElementById('btnOpenBomModal');
    this.btnCloseBomModal = document.getElementById('btnCloseBomModal');
    this.bomGridContainer = document.getElementById('bomGridContainer');
    this.bomRecommendationsContainer = document.getElementById('bomRecommendationsContainer');
    this.bomSharedCount = document.getElementById('bomSharedCount');
    this.bomTotalCount = document.getElementById('bomTotalCount');
    this.sharedBomBadge = document.getElementById('sharedBomBadge');
    this.currentBomScope = 'all';

    this.initEvents();
  }

  initEvents() {
    // Open Brainstorm Modal
    if (this.btnOpenAiModal) {
      this.btnOpenAiModal.addEventListener('click', () => this.openBrainstormModal());
    }
    if (this.btnCloseAiModal) {
      this.btnCloseAiModal.addEventListener('click', () => this.closeBrainstormModal());
    }
    if (this.btnCancelAiModal) {
      this.btnCancelAiModal.addEventListener('click', () => this.closeBrainstormModal());
    }

    // Trigger AI Generation
    if (this.btnTriggerAiGenerate) {
      this.btnTriggerAiGenerate.addEventListener('click', () => this.triggerBrainstorm());
    }

    // Commit New Idea
    if (this.btnCommitMerge) {
      this.btnCommitMerge.addEventListener('click', () => this.commitStagedIdea());
    }

    // BOM Modal
    if (this.btnOpenBomModal) {
      this.btnOpenBomModal.addEventListener('click', () => this.openBomModal());
    }
    if (this.btnBomScopeSelected) {
      this.btnBomScopeSelected.addEventListener('click', () => {
        this.currentBomScope = 'selected';
        this.updateBomScopeButtons();
        this.loadBomSummary();
      });
    }
    if (this.btnBomScopeAll) {
      this.btnBomScopeAll.addEventListener('click', () => {
        this.currentBomScope = 'all';
        this.updateBomScopeButtons();
        this.loadBomSummary();
      });
    }
    if (this.btnCloseBomModal) {
      this.btnCloseBomModal.addEventListener('click', () => this.closeBomModal());
    }

    // Close on backdrop click
    window.addEventListener('click', (e) => {
      if (e.target === this.aiModalBackdrop) this.closeBrainstormModal();
      if (e.target === this.bomModalBackdrop) this.closeBomModal();
    });
  }

  openBrainstormModal() {
    this.stagedIdea = null;
    this.diffPreviewSection.style.display = 'none';
    this.btnCommitMerge.disabled = true;
    this.aiModalBackdrop.classList.add('active', 'open');
    this.aiModalBackdrop.style.display = 'flex';
    this.aiModalBackdrop.style.opacity = '1';
    this.aiModalBackdrop.style.pointerEvents = 'auto';
    this.aiModalBackdrop.setAttribute('aria-hidden', 'false');
    this.aiTopicInput.focus();
  }

  closeBrainstormModal() {
    this.aiModalBackdrop.classList.remove('active', 'open');
    this.aiModalBackdrop.style.display = 'none';
    this.aiModalBackdrop.style.opacity = '0';
    this.aiModalBackdrop.style.pointerEvents = 'none';
    this.aiModalBackdrop.setAttribute('aria-hidden', 'true');
  }

  async triggerBrainstorm() {
    const topic = this.aiTopicInput.value.trim();
    if (!topic) {
      this.app.showToast('Please enter an idea or concept to brainstorm.', 'error');
      return;
    }

    const category = this.aiCategoryInput.value.trim() || undefined;
    const model = this.aiModelSelect ? this.aiModelSelect.value : 'gemini-3.8-flash-low';

    this.btnTriggerAiGenerate.disabled = true;
    this.btnTriggerAiGenerate.innerHTML = '✨ Brainstorming with AI...';

    try {
      const resp = await fetch('/api/ai/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: topic, category: category, model: model })
      });
      const data = await resp.json();

      if (data.success && data.data) {
        this.stagedIdea = data.data;
        this.renderBrainstormPreview(this.stagedIdea);
        this.app.showToast('Idea generated successfully!', 'success');
      } else {
        this.app.showToast(data.error || 'Failed to generate idea.', 'error');
      }
    } catch (err) {
      this.app.showToast(`AI error: ${err.message}`, 'error');
    } finally {
      this.btnTriggerAiGenerate.disabled = false;
      this.btnTriggerAiGenerate.innerHTML = '✨ Brainstorm, Categorize & Add to Mindmap';
    }
  }

  renderBrainstormPreview(idea) {
    this.diffPreviewSection.style.display = 'block';
    this.btnCommitMerge.disabled = false;

    const existingCats = (this.app.allNodes || []).map(n => n.category).filter(Boolean);
    const isNewCat = idea.category && !existingCats.includes(idea.category);
    const newCatBadge = isNewCat 
      ? '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 0.68rem; padding: 2px 6px;">✨ New Category Created by AI</span>'
      : '';

    const bomList = (idea.bom || []).map(b => `
      <div style="font-size: 0.78rem; display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <span>📦 <strong>${b.item}</strong> (x${b.qty || 1})</span>
        <span style="color: var(--text-muted); font-size: 0.72rem;">${b.notes || ''}</span>
      </div>
    `).join('') || '<div style="color: var(--text-muted); font-size: 0.76rem;">No components listed</div>';

    this.brainstormPreviewCard.innerHTML = `
      <div class="bulk-card-header">
        <div style="flex: 1;">
          <div class="bulk-card-title" style="margin-bottom: 6px;">${idea.title}</div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 0.74rem; color: #38bdf8;">
            <span>📁 Category:</span>
            <input type="text" id="previewCategoryInput" class="form-input" list="categoryDatalist" style="width: 170px; height: 26px; font-size: 0.74rem; padding: 2px 8px;" value="${idea.category || 'General'}">
            ${newCatBadge}
            <span style="color: var(--text-muted); margin-left: 6px;">Status: <strong>${idea.status}</strong></span>
          </div>
        </div>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-secondary); margin: 8px 0;">${idea.description || ''}</div>
      <div style="font-size: 0.76rem; font-weight: 700; color: #f8fafc; margin-top: 6px;">Bill of Materials (BOM):</div>
      <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
        ${bomList}
      </div>
    `;
  }

  async commitStagedIdea() {
    if (!this.stagedIdea) return;

    const catInput = document.getElementById('previewCategoryInput');
    const finalCategory = (catInput && catInput.value.trim()) || this.stagedIdea.category || 'General';

    this.btnCommitMerge.disabled = true;
    this.btnCommitMerge.textContent = 'Saving to Markdown...';

    try {
      const payload = {
        id: this.stagedIdea.id,
        title: this.stagedIdea.title,
        category: finalCategory,
        status: this.stagedIdea.status || 'concept',
        description: this.stagedIdea.description || '',
        content_markdown: this.stagedIdea.markdown_content || `# ${this.stagedIdea.title}\n\n${this.stagedIdea.description}\n`,
        tags: this.stagedIdea.tags || [],
        bom: this.stagedIdea.bom || []
      };

      const resp = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const res = await resp.json();

      if (res.success) {
        this.app.showToast(`Saved '${payload.title}' to ideas/${payload.id}.md!`, 'success');
        this.closeBrainstormModal();
        await this.app.loadGraphData();
        this.app.graph3d.focusOnNode(payload.id);
      } else {
        this.app.showToast('Failed to save idea.', 'error');
      }
    } catch (err) {
      this.app.showToast(`Save error: ${err.message}`, 'error');
    } finally {
      this.btnCommitMerge.disabled = false;
      this.btnCommitMerge.textContent = 'Accept & View in 3D Mindmap';
    }
  }

  async openBomModal(forcedScope = null) {
    this.bomModalBackdrop.classList.add('active', 'open');
    this.bomModalBackdrop.style.display = 'flex';
    this.bomModalBackdrop.style.opacity = '1';
    this.bomModalBackdrop.style.pointerEvents = 'auto';
    this.bomModalBackdrop.setAttribute('aria-hidden', 'false');

    const hasSelection = this.app && this.app.selectedNodeIds && this.app.selectedNodeIds.size > 0;
    if (forcedScope) {
      this.currentBomScope = forcedScope;
    } else if (hasSelection) {
      this.currentBomScope = 'selected';
    } else {
      this.currentBomScope = 'all';
    }

    this.updateBomScopeButtons();
    await this.loadBomSummary();
  }

  updateBomScopeButtons() {
    const hasSelection = this.app && this.app.selectedNodeIds && this.app.selectedNodeIds.size > 0;
    const selCount = hasSelection ? this.app.selectedNodeIds.size : 0;

    if (this.bomSelectedCountBadge) {
      this.bomSelectedCountBadge.textContent = selCount;
    }

    if (this.btnBomScopeSelected) {
      this.btnBomScopeSelected.style.display = hasSelection ? 'inline-flex' : 'none';
      if (this.currentBomScope === 'selected') {
        this.btnBomScopeSelected.classList.add('active-cyan');
        if (this.btnBomScopeAll) this.btnBomScopeAll.classList.remove('active-cyan');
      } else {
        this.btnBomScopeSelected.classList.remove('active-cyan');
        if (this.btnBomScopeAll) this.btnBomScopeAll.classList.add('active-cyan');
      }
    }
  }

  closeBomModal() {
    this.bomModalBackdrop.classList.remove('active', 'open');
    this.bomModalBackdrop.style.display = 'none';
    this.bomModalBackdrop.style.opacity = '0';
    this.bomModalBackdrop.style.pointerEvents = 'none';
    this.bomModalBackdrop.setAttribute('aria-hidden', 'true');
  }

  async loadBomSummary() {
    try {
      const hasSelection = this.app && this.app.selectedNodeIds && this.app.selectedNodeIds.size > 0;
      let url = '/api/bom/summary';
      const isScopedToSelection = (this.currentBomScope === 'selected' && hasSelection);

      if (isScopedToSelection) {
        const idList = Array.from(this.app.selectedNodeIds);
        url += '?idea_ids=' + encodeURIComponent(idList.join(','));

        const selectedTitles = idList.map(id => {
          const n = (this.app.allNodes || []).find(node => node.id === id);
          return n ? (n.title || n.name) : id;
        });

        if (this.bomModalTitle) {
          this.bomModalTitle.textContent = `Consolidated BOM (${idList.length} Selected Projects)`;
        }
        if (this.bomModalSubtitle) {
          this.bomModalSubtitle.textContent = `Considering only components needed in: ${selectedTitles.join(', ')}.`;
        }
      } else {
        if (this.bomModalTitle) {
          this.bomModalTitle.textContent = 'SquirrelMap Consolidated BOM (All Projects)';
        }
        if (this.bomModalSubtitle) {
          this.bomModalSubtitle.textContent = 'Aggregated hardware and components across all stashed projects for bulk purchasing.';
        }
      }

      const resp = await fetch(url);
      const data = await resp.json();

      if (this.bomSharedCount) this.bomSharedCount.textContent = `${data.shared_items_count} Parts`;
      if (this.bomTotalCount) this.bomTotalCount.textContent = `${data.total_unique_items} Items`;
      if (!isScopedToSelection && this.sharedBomBadge) this.sharedBomBadge.textContent = data.shared_items_count;

      // Render Recommendations
      if (this.bomRecommendationsContainer) {
        if (data.bulk_buy_recommendations && data.bulk_buy_recommendations.length > 0) {
          const recsHtml = data.bulk_buy_recommendations.map(r => `
            <div style="background: rgba(16, 185, 129, 0.1); border-left: 3px solid #34d399; padding: 8px 12px; border-radius: 4px; font-size: 0.78rem; margin-bottom: 6px; color: #e2e8f0;">
              ⚡ <strong>Bulk Sourcing Hint:</strong> ${r}
            </div>
          `).join('');
          this.bomRecommendationsContainer.innerHTML = recsHtml;
        } else {
          this.bomRecommendationsContainer.innerHTML = isScopedToSelection ?
            `<div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 6px;">No overlapping parts between these ${this.app.selectedNodeIds.size} projects.</div>` : '';
        }
      }

      // Render Grid
      if (this.bomGridContainer) {
        if (!data.items || data.items.length === 0) {
          this.bomGridContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 12px 0;">No BOM components found for the current selection.</div>';
          return;
        }

        const cardsHtml = data.items.map(item => {
          const isSharedClass = item.is_shared ? 'shared-opportunity' : '';
          const projectTags = (item.projects || []).map(p => `
            <span class="bulk-project-tag" title="${p.notes || ''}">
              ${p.idea_title} (x${p.qty})
            </span>
          `).join('');

          return `
            <div class="bulk-buy-card ${isSharedClass}">
              <div class="bulk-card-header">
                <div class="bulk-card-title">${item.item}</div>
                <div class="bulk-card-qty">${item.total_qty} Total</div>
              </div>
              <div style="font-size: 0.72rem; color: ${item.is_shared ? '#34d399' : 'var(--text-muted)'}; font-weight: 600;">
                ${item.is_shared ? `⚡ Needed across ${item.projects.length} projects (Bulk Buy!)` : 'Needed in 1 project'}
              </div>
              <div class="bulk-card-projects">
                ${projectTags}
              </div>
            </div>
          `;
        }).join('');

        this.bomGridContainer.innerHTML = cardsHtml;
      }
    } catch (err) {
      console.error('Failed to load BOM summary:', err);
    }
  }
}

window.IdeaModalsController = IdeaModalsController;
