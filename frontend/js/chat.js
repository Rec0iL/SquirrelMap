/** Parse a fetch response as JSON; on non-JSON/HTTP errors return a {success:false,error} object instead of throwing. */
async function safeJson(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return { success: false, error: `Server error (HTTP ${resp.status}): ${text.slice(0, 200) || resp.statusText}` };
  }
}

/**
 * chat.js - Integrated Multi-Agent Chat Interface for SquirrelMap
 * Supports switching between Antigravity (AGY), Claude, Codex, Ollama, OpenCode, and Custom Agents.
 * Supports embedded project cards inside the input field and rich context reference in chat bubbles.
 */

class McpChatManager {
  constructor(app) {
    this.app = app;
    this.drawer = document.getElementById('mcpChatDrawer');
    this.resizeHandle = document.getElementById('chatResizeHandle');
    this.btnExpand = document.getElementById('btnExpandMcpChat');
    this.btnOpen = document.getElementById('btnOpenMcpChat');
    this.btnClose = document.getElementById('btnCloseMcpChat');
    this.btnClear = document.getElementById('btnClearMcpChat');
    this.messagesContainer = document.getElementById('mcpChatMessages');
    this.input = document.getElementById('mcpChatInput');
    this.textarea = this.input; // Compatibility alias
    this.btnSend = document.getElementById('btnSendMcpChat');
    this.unifiedInputBox = document.getElementById('chatUnifiedInputBox');

    // Voice & Whisper Recording Elements
    this.btnVoiceRecord = document.getElementById('btnVoiceRecord');
    this.voiceRecordingHud = document.getElementById('voiceRecordingHud');
    this.voiceDurationCounter = document.getElementById('voiceDurationCounter');
    this.btnCancelVoice = document.getElementById('btnCancelVoice');
    this.btnStopVoice = document.getElementById('btnStopVoice');
    this.chatInputRow = document.getElementById('chatInputRow');

    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioChunks = [];
    this.voiceTimer = null;
    this.voiceSeconds = 0;
    this.isRecordingVoice = false;
    this.recordingMimeType = '';

    // @-Mention Autocomplete Popup
    this.mentionPopup = document.getElementById('chatMentionPopup');
    this.mentionList = document.getElementById('chatMentionList');

    // Agent Settings Menu Elements
    this.btnOpenSettings = document.getElementById('btnOpenChatSettings');
    this.btnCloseSettings = document.getElementById('btnCloseChatSettings');
    this.settingsPanel = document.getElementById('chatSettingsPanel');
    this.activeAgentBadge = document.getElementById('activeAgentBadge');
    this.activeAgentIcon = document.getElementById('activeAgentIcon');
    this.activeAgentLabel = document.getElementById('activeAgentLabel');
    this.agentProviderSelect = document.getElementById('agentProviderSelect');
    this.btnSaveSettings = document.getElementById('btnSaveAgentSettings');

    // Provider Config Sections
    this.sections = {
      agy: document.getElementById('settingsSectionAgy'),
      claude: document.getElementById('settingsSectionClaude'),
      codex: document.getElementById('settingsSectionCodex'),
      ollama: document.getElementById('settingsSectionOllama'),
      opencode: document.getElementById('settingsSectionOpenCode'),
      custom: document.getElementById('settingsSectionCustom')
    };

    // Form inputs
    this.inputs = {
      agyModel: document.getElementById('agyModelSelect'),
      claudeModel: document.getElementById('claudeModelSelect'),
      codexModel: document.getElementById('codexModelInput'),
      codexApiKey: document.getElementById('codexApiKeyInput'),
      codexBaseUrl: document.getElementById('codexBaseUrlInput'),
      ollamaModel: document.getElementById('ollamaModelSelect'),
      ollamaEndpoint: document.getElementById('ollamaEndpointInput'),
      openCodeModel: document.getElementById('openCodeModelInput'),
      customName: document.getElementById('customAgentNameInput'),
      customEndpoint: document.getElementById('customEndpointInput'),
      customApiKey: document.getElementById('customApiKeyInput'),
      customModel: document.getElementById('customModelInput')
    };
    this.claudeStatusBadge = document.getElementById('claudeCliStatusBadge');

    this.history = [];
    // Persistent chat history: every conversation is saved in the backend and can be reopened or deleted
    this.chatId = null;
    this.chatLog = [];        // display entries used to re-render a saved chat
    this.restoringChat = false;
    this.saveTimer = null;
    this.btnHistory = document.getElementById('btnChatHistory');
    this.historyPanel = document.getElementById('chatHistoryPanel');
    this.historyList = document.getElementById('chatHistoryList');
    this.btnCloseHistory = document.getElementById('btnCloseChatHistory');
    this.btnNewChat = document.getElementById('btnNewChat');
    this.isExpanded = false;
    this.isBusy = false;

    // Mention state & staged cards
    this.isMentioning = false;
    this.mentionQuery = '';
    this.mentionResults = [];
    this.mentionSelectedIndex = 0;
    this.stagedReferencedNodes = []; // Nodes embedded inside the chat input

    // Agent config state
    this.agentConfig = this.loadAgentConfig();

    this.init();
  }

  init() {
    if (!this.drawer) return;

    if (this.btnOpen) this.btnOpen.addEventListener('click', () => this.open());
    if (this.btnClose) this.btnClose.addEventListener('click', () => this.close());
    if (this.btnClear) this.btnClear.addEventListener('click', () => this.clearChat());
    if (this.btnHistory) this.btnHistory.addEventListener('click', () => this.toggleHistory());
    if (this.btnCloseHistory) this.btnCloseHistory.addEventListener('click', () => this.closeHistory());
    if (this.btnNewChat) this.btnNewChat.addEventListener('click', () => { this.closeHistory(); this.clearChat(); });
    if (this.btnExpand) this.btnExpand.addEventListener('click', () => this.toggleExpand());
    if (this.btnSend) this.btnSend.addEventListener('click', () => this.sendMessage());

    // Voice Recording Events
    if (this.btnVoiceRecord) {
      this.btnVoiceRecord.addEventListener('click', () => {
        if (!this.isRecordingVoice) {
          this.startVoiceRecording();
        } else {
          this.stopVoiceRecording(true);
        }
      });
    }
    if (this.btnStopVoice) {
      this.btnStopVoice.addEventListener('click', () => this.stopVoiceRecording(true));
    }
    if (this.btnCancelVoice) {
      this.btnCancelVoice.addEventListener('click', () => this.stopVoiceRecording(false));
    }

    // Settings Menu Events
    if (this.btnOpenSettings) {
      this.btnOpenSettings.addEventListener('click', () => this.toggleSettings());
    }
    if (this.activeAgentBadge) {
      this.activeAgentBadge.addEventListener('click', () => this.toggleSettings());
    }
    if (this.btnCloseSettings) {
      this.btnCloseSettings.addEventListener('click', () => this.closeSettings());
    }
    if (this.agentProviderSelect) {
      this.agentProviderSelect.addEventListener('change', () => this.switchProviderSection(this.agentProviderSelect.value));
    }
    if (this.btnSaveSettings) {
      this.btnSaveSettings.addEventListener('click', () => this.saveSettingsFromForm());
    }

    if (this.input) {
      // Auto-grow height & @-mention detection
      this.input.addEventListener('input', () => {
        this.adjustInputHeight();
        this.checkMentionTrigger();
      });

      this.input.addEventListener('keyup', (e) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete'].includes(e.key)) {
          this.checkMentionTrigger();
        }
      });

      this.input.addEventListener('click', () => {
        this.checkMentionTrigger();
      });

      // Keydown handlers for Enter, Navigation, and Mention autocomplete
      this.input.addEventListener('keydown', (e) => {
        if (this.isMentioning) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.navigateMention(1);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.navigateMention(-1);
            return;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            if (this.mentionResults[this.mentionSelectedIndex]) {
              this.selectMentionItem(this.mentionResults[this.mentionSelectedIndex]);
            }
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            this.hideMentionPopup();
            return;
          }
        }

        // Standard Enter to send (Shift+Enter for newline)
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // Paste as clean plain text
      this.input.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        this.checkMentionTrigger();
        this.adjustInputHeight();
      });

      // Close mention popup if clicked outside
      document.addEventListener('click', (e) => {
        if (this.mentionPopup && !this.mentionPopup.contains(e.target) && e.target !== this.input && !this.input.contains(e.target)) {
          this.hideMentionPopup();
        }
        if (this.settingsPanel && !this.settingsPanel.contains(e.target) && e.target !== this.btnOpenSettings && !this.btnOpenSettings.contains(e.target) && !this.activeAgentBadge.contains(e.target)) {
          this.closeSettings();
        }
      });
    }

    // Quick prompts
    const chips = this.drawer.querySelectorAll('.quick-prompt-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt && this.input) {
          this.input.textContent = prompt;
          this.adjustInputHeight();
          this.sendMessage();
        }
      });
    });

    this.setupResize();
    this.appendWelcomeMessage();
    this.adjustTextareaHeight();
    this.applyAgentConfigUI();
    this.fetchOllamaModels();
    this.fetchClaudeModels();
  }

  // ================= AGENT CONFIG & SETTINGS MENU =================
  loadAgentConfig() {
    try {
      const saved = localStorage.getItem('squirrelmap_agent_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.provider === 'claude') {
          const m = (parsed.model || '').toLowerCase();
          if (m.includes('haiku')) parsed.model = 'haiku';
          else if (m.includes('opus')) parsed.model = 'opus';
          else parsed.model = 'sonnet';
        } else if (parsed.provider === 'agy') {
          const validAgy = [
            'gemini-3.8-flash-low', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-high',
            'gemini-4-argon-low', 'gemini-4-argon-medium', 'gemini-4-argon-high',
            'claude-sonnet-5-5-medium', 'claude-opus-5-5-high', 'gpt-oss-120b-medium'
          ];
          if (!validAgy.includes(parsed.model)) {
            const m = (parsed.model || '').toLowerCase();
            if (m.includes('sonnet')) parsed.model = 'claude-sonnet-5-5-medium';
            else if (m.includes('opus')) parsed.model = 'claude-opus-5-5-high';
            else if (m.includes('high')) parsed.model = 'gemini-3.8-flash-high';
            else parsed.model = 'gemini-3.8-flash-low';
          }
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse agent config from localStorage', e);
    }
    return {
      provider: 'agy',
      model: 'gemini-3.8-flash-low',
      endpoint_url: '',
      api_key: ''
    };
  }

  saveAgentConfig(cfg) {
    this.agentConfig = { ...this.agentConfig, ...cfg };
    try {
      localStorage.setItem('squirrelmap_agent_config', JSON.stringify(this.agentConfig));
    } catch (e) {
      console.warn('Failed to save agent config', e);
    }
    this.applyAgentConfigUI();
  }

  applyAgentConfigUI() {
    const p = this.agentConfig.provider || 'agy';
    const m = this.agentConfig.model || 'default';

    const providerNames = {
      agy: 'AGY',
      claude: 'Claude Code',
      codex: 'OpenAI Codex',
      ollama: 'Local Ollama',
      opencode: 'OpenCode',
      custom: this.agentConfig.custom_name || 'Custom Agent'
    };

    const providerIcons = {
      agy: '🤖',
      claude: '🧠',
      codex: '⚡',
      ollama: '🦙',
      opencode: '💻',
      custom: '✨'
    };

    if (this.activeAgentIcon) this.activeAgentIcon.textContent = providerIcons[p] || '🤖';
    if (this.activeAgentLabel) {
      const shortModel = m.replace('gemini-', '').replace('claude-', '').replace('latest', '');
      this.activeAgentLabel.textContent = `${providerNames[p] || p}: ${shortModel}`;
    }

    // Sync form values
    if (this.agentProviderSelect) this.agentProviderSelect.value = p;
    if (this.inputs.agyModel && p === 'agy') this.inputs.agyModel.value = m;
    if (this.inputs.claudeModel && p === 'claude') this.inputs.claudeModel.value = m;
    if (this.inputs.codexModel && p === 'codex') this.inputs.codexModel.value = m;
    if (this.inputs.ollamaModel && p === 'ollama') this.inputs.ollamaModel.value = m;
    this.switchProviderSection(p);
  }

  switchProviderSection(provider) {
    Object.entries(this.sections).forEach(([key, section]) => {
      if (section) section.style.display = (key === provider) ? 'block' : 'none';
    });
  }

  toggleSettings() {
    if (!this.settingsPanel) return;
    const isVisible = this.settingsPanel.style.display === 'flex';
    if (isVisible) {
      this.closeSettings();
    } else {
      this.closeHistory();
      this.settingsPanel.style.display = 'flex';
      const p = this.agentConfig.provider || 'agy';
      if (this.agentProviderSelect) this.agentProviderSelect.value = p;
      this.switchProviderSection(p);
      this.fetchClaudeModels();
      this.fetchOllamaModels();
    }
  }

  closeSettings() {
    if (this.settingsPanel) this.settingsPanel.style.display = 'none';
  }

  async fetchClaudeModels() {
    try {
      const resp = await fetch('/api/ai/claude-models');
      const data = await resp.json();
      if (data.available) {
        if (this.claudeStatusBadge) {
          const v = data.version ? data.version.split('\n')[0] : 'Installed';
          this.claudeStatusBadge.textContent = `✓ CLI Online (${v})`;
          this.claudeStatusBadge.style.color = '#10b981';
        }
        if (data.models && data.models.length > 0 && this.inputs.claudeModel) {
          const activeModel = this.agentConfig.provider === 'claude' ? (this.agentConfig.model || 'sonnet') : (this.inputs.claudeModel.value || 'sonnet');
          this.inputs.claudeModel.innerHTML = data.models.map(m => `
            <option value="${m.id}" ${m.id === activeModel ? 'selected' : ''}>${m.name}</option>
          `).join('');
        }
      } else {
        if (this.claudeStatusBadge) {
          this.claudeStatusBadge.textContent = '⚠ CLI Not Found';
          this.claudeStatusBadge.style.color = '#ef4444';
        }
      }
    } catch (e) {
      console.warn('Could not fetch Claude models', e);
    }
  }

  async fetchOllamaModels() {
    try {
      const resp = await fetch('/api/ai/ollama-models');
      const data = await resp.json();
      if (data.available && data.models && data.models.length > 0) {
        if (this.inputs.ollamaModel) {
          this.inputs.ollamaModel.innerHTML = data.models.map(m => `
            <option value="${m}" ${m === this.agentConfig.model ? 'selected' : ''}>${m}</option>
          `).join('');
        }
      }
    } catch (e) {
      console.log('Ollama not running or unreachable', e);
    }
  }

  saveSettingsFromForm() {
    const provider = this.agentProviderSelect ? this.agentProviderSelect.value : 'agy';
    let model = 'default';
    let endpoint_url = '';
    let api_key = '';
    let custom_name = '';

    if (provider === 'agy') {
      model = this.inputs.agyModel ? this.inputs.agyModel.value : 'gemini-3.8-flash-low';
    } else if (provider === 'claude') {
      model = this.inputs.claudeModel ? this.inputs.claudeModel.value : 'sonnet';
    } else if (provider === 'codex') {
      model = this.inputs.codexModel ? this.inputs.codexModel.value : 'gpt-4o';
      api_key = this.inputs.codexApiKey ? this.inputs.codexApiKey.value : '';
      endpoint_url = this.inputs.codexBaseUrl ? this.inputs.codexBaseUrl.value : '';
    } else if (provider === 'ollama') {
      model = this.inputs.ollamaModel ? this.inputs.ollamaModel.value : 'llama3.1:8b';
      endpoint_url = this.inputs.ollamaEndpoint ? this.inputs.ollamaEndpoint.value : 'http://localhost:11434/api/chat';
    } else if (provider === 'opencode') {
      model = this.inputs.openCodeModel ? this.inputs.openCodeModel.value : 'default';
    } else if (provider === 'custom') {
      custom_name = this.inputs.customName ? this.inputs.customName.value : 'Custom Agent';
      endpoint_url = this.inputs.customEndpoint ? this.inputs.customEndpoint.value : '';
      api_key = this.inputs.customApiKey ? this.inputs.customApiKey.value : '';
      model = this.inputs.customModel ? this.inputs.customModel.value : 'custom-model';
    }

    this.saveAgentConfig({
      provider,
      model,
      endpoint_url,
      api_key,
      custom_name
    });

    this.closeSettings();
    if (this.app && this.app.showToast) {
      this.app.showToast(`Switched active AI agent to ${provider.toUpperCase()} (${model})`, 'success');
    }
  }

  // ================= INPUT AUTO-RESIZE & INLINE MENTIONS =================
  adjustInputHeight() {
    if (!this.input) return;
    const drawerHeight = this.drawer ? this.drawer.clientHeight : window.innerHeight;
    const maxHeight = Math.floor(drawerHeight * 0.40);
    this.input.style.maxHeight = `${maxHeight}px`;
  }

  adjustTextareaHeight() {
    this.adjustInputHeight();
  }

  getCategoryIcon(category) {
    if (!category) return "💡";
    const c = category.toLowerCase();
    if (c.includes("audio") || c.includes("visual")) return "🎨";
    if (c.includes("hard") || c.includes("electr")) return "🔌";
    if (c.includes("soft") || c.includes("ai")) return "💻";
    if (c.includes("work") || c.includes("tool")) return "🛠️";
    return "📌";
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  createInlineCardElement(node, canDelete = true) {
    const card = document.createElement("span");
    card.className = "inline-node-card";
    card.contentEditable = "false";
    const nodeId = node.id || "";
    const nodeLabel = node.title || node.name || node.label || nodeId;
    const nodeCategory = node.category || "";

    card.setAttribute("data-node-id", nodeId);
    card.setAttribute("data-node-label", nodeLabel);
    card.setAttribute("data-node-category", nodeCategory);

    const catIcon = this.getCategoryIcon(nodeCategory);
    const parts = node.bom || node.bom_parts || [];
    const partsBadge = parts.length > 0 ? `<span class="inline-card-badge">${parts.length} parts</span>` : "";
    const delBtn = canDelete ? `<button class="inline-card-del" title="Remove reference">×</button>` : "";

    card.innerHTML = `
      <span class="inline-card-icon">${catIcon}</span>
      <span class="inline-card-title">${this.escapeHtml(nodeLabel)}</span>
      ${partsBadge}
      ${delBtn}
    `;

    if (canDelete) {
      const btn = card.querySelector(".inline-card-del");
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          card.remove();
          this.adjustInputHeight();
          if (this.input) this.input.focus();
        });
      }
    }

    card.addEventListener("click", (e) => {
      if (e.target.closest(".inline-card-del")) return;
      if (this.app && this.app.graph3d && nodeId) {
        this.app.graph3d.focusOnNode(nodeId);
      }
    });

    return card;
  }

  checkMentionTrigger() {
    if (!this.input) return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      this.hideMentionPopup();
      return;
    }

    const range = sel.getRangeAt(0);
    if (!this.input.contains(range.startContainer)) {
      this.hideMentionPopup();
      return;
    }

    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const text = range.startContainer.textContent;
      const caret = range.startOffset;
      const textBefore = text.slice(0, caret);

      const atIdx = textBefore.lastIndexOf("@");
      if (atIdx !== -1) {
        const charBefore = atIdx > 0 ? textBefore[atIdx - 1] : " ";
        const query = textBefore.slice(atIdx + 1);

        if ((/\s/.test(charBefore) || atIdx === 0) && !/\s/.test(query)) {
          this._mentionContext = {
            textNode: range.startContainer,
            atOffset: atIdx,
            caretOffset: caret,
            query: query.toLowerCase()
          };
          this.showMentionPopup(this._mentionContext.query);
          return;
        }
      }
    }

    this.hideMentionPopup();
  }

  showMentionPopup(query) {
    if (!this.mentionPopup || !this.mentionList) return;

    const allNodes = (this.app && this.app.allNodes) ? this.app.allNodes : [];
    let matches = [];

    if (!query) {
      matches = allNodes.slice(0, 8);
    } else {
      matches = allNodes.filter(n => {
        const title = (n.title || n.name || n.label || "").toLowerCase();
        const cat = (n.category || "").toLowerCase();
        const tags = (n.tags || []).join(" ").toLowerCase();
        return title.includes(query) || cat.includes(query) || tags.includes(query);
      }).slice(0, 8);
    }

    this.mentionResults = matches;
    this.mentionSelectedIndex = 0;

    if (matches.length === 0) {
      this.mentionList.innerHTML = `<div class="mention-empty">No projects found matching "@${this.escapeHtml(query)}"</div>`;
    } else {
      this.mentionList.innerHTML = matches.map((node, idx) => {
        const partsCount = (node.bom || node.bom_parts || []).length;
        const icon = this.getCategoryIcon(node.category);
        return `
          <div class="mention-item ${idx === 0 ? "active" : ""}" data-idx="${idx}" data-id="${node.id}">
            <span class="mention-icon">${icon}</span>
            <div class="mention-info">
              <div class="mention-title">${this.escapeHtml(node.title || node.name || node.label || node.id)}</div>
              <div class="mention-meta">📁 ${this.escapeHtml(node.category || "General")} · 🛒 ${partsCount} parts</div>
            </div>
            <span class="mention-add-badge">+ Insert Card</span>
          </div>
        `;
      }).join("");

      const items = this.mentionList.querySelectorAll(".mention-item");
      items.forEach(el => {
        el.addEventListener("click", () => {
          const idx = parseInt(el.getAttribute("data-idx"), 10);
          if (this.mentionResults[idx]) {
            this.selectMentionItem(this.mentionResults[idx]);
          }
        });
      });
    }

    this.mentionPopup.style.display = "flex";
    this.isMentioning = true;
  }

  hideMentionPopup() {
    if (this.mentionPopup) {
      this.mentionPopup.style.display = "none";
    }
    this.isMentioning = false;
    this.mentionResults = [];
    this._mentionContext = null;
  }

  navigateMention(delta) {
    if (!this.mentionResults.length) return;
    this.mentionSelectedIndex = (this.mentionSelectedIndex + delta + this.mentionResults.length) % this.mentionResults.length;

    const items = this.mentionList ? this.mentionList.querySelectorAll(".mention-item") : [];
    items.forEach((item, idx) => {
      item.classList.toggle("active", idx === this.mentionSelectedIndex);
      if (idx === this.mentionSelectedIndex) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  }

  selectMentionItem(node) {
    if (!node || !this.input) return;

    const ctx = this._mentionContext;
    const sel = window.getSelection();
    let range = null;

    if (ctx && this.input.contains(ctx.textNode)) {
      range = document.createRange();
      range.setStart(ctx.textNode, ctx.atOffset);
      range.setEnd(ctx.textNode, ctx.caretOffset);
    } else if (sel && sel.rangeCount && this.input.contains(sel.getRangeAt(0).startContainer)) {
      range = sel.getRangeAt(0);
    }

    const card = this.createInlineCardElement(node, true);
    const spaceNode = document.createTextNode(" "); // &nbsp; space after card

    if (range) {
      range.deleteContents();
      range.insertNode(spaceNode);
      range.insertNode(card);

      const newRange = document.createRange();
      newRange.setStartAfter(spaceNode);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      this.input.appendChild(card);
      this.input.appendChild(spaceNode);
    }

    this._mentionContext = null;
    this.hideMentionPopup();
    this.adjustInputHeight();
    this.input.focus();
  }

  serializeInput() {
    if (!this.input) return { text: "", referencedNodes: [], bubbleHtml: "" };

    const referencedNodes = [];
    const seenIds = new Set();
    let textParts = [];
    let bubbleHtml = "";

    const allNodes = (this.app && this.app.allNodes) ? this.app.allNodes : [];

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        textParts.push(node.textContent);
        bubbleHtml += this.escapeHtml(node.textContent);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList.contains("inline-node-card")) {
          const id = node.getAttribute("data-node-id");
          const label = node.getAttribute("data-node-label");
          textParts.push(`[Project: "${label}" (id: ${id})]`);

          const fullNode = allNodes.find(n => n.id === id) || { id, title: label, name: label, label };
          if (!seenIds.has(id)) {
            seenIds.add(id);
            referencedNodes.push(fullNode);
          }

          const cardClone = this.createInlineCardElement(fullNode, false);
          bubbleHtml += cardClone.outerHTML;
        } else if (node.tagName === "BR") {
          textParts.push("\n");
          bubbleHtml += "<br>";
        } else {
          for (let child of node.childNodes) {
            walk(child);
          }
        }
      }
    };

    for (let child of this.input.childNodes) {
      walk(child);
    }

    const text = textParts.join("").trim();
    return { text, referencedNodes, bubbleHtml };
  }

  open() {
    this.drawer.classList.add('open');
    if (this.textarea) {
      this.textarea.focus();
      this.adjustTextareaHeight();
    }
  }

  close() {
    this.drawer.classList.remove('open');
    this.hideMentionPopup();
    this.closeSettings();
    this.closeHistory();
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.drawer.style.width = '680px';
    } else {
      this.drawer.style.width = '440px';
    }
  }

  setupResize() {
    if (!this.resizeHandle) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    this.resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = this.drawer.offsetWidth;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const delta = startX - e.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 360), 960);
      this.drawer.style.width = `${newWidth}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    });
  }

  appendWelcomeMessage() {
    const welcomeHtml = `
      <p>👋 <strong>Welcome to your SquirrelMap AI Agent!</strong></p>
      <p>I have direct MCP tool access to your project graph and local Markdown files:</p>
      <ul>
        <li><strong>Add & Brainstorm Ideas:</strong> Tell me an idea and I'll categorize it, list BOM parts, and save the <code>.md</code> file.</li>
        <li><strong>Analyze BOM:</strong> Ask for bulk-buy purchasing recommendations across all projects.</li>
        <li><strong>Link & Fuse:</strong> Connect related projects or combine duplicate ideas.</li>
      </ul>
      <p>💡 <em>Tip: Type <strong>@</strong> inside the chat to embed any project card directly as context! Use <strong>⚙️</strong> to switch AI providers.</em></p>
    `;
    this.appendMessage('assistant', welcomeHtml, false);
  }

  appendMessage(role, content, isRaw = false, referencedNodes = []) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-message-avatar';
    avatar.textContent = role === 'user' ? '👤' : (this.activeAgentIcon ? this.activeAgentIcon.textContent : '🤖');

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    // If there are referenced project cards, render the neat cards at the TOP of the bubble
    if (referencedNodes && referencedNodes.length > 0) {
      const cardsHtml = referencedNodes.map(node => {
        const partsCount = (node.bom && node.bom.length) ? `${node.bom.length} BOM items` : 'No BOM listed';
        return `
          <div class="chat-project-card" data-id="${node.id}">
            <div class="chat-card-top">
              <span style="font-size: 1rem;">📌</span>
              <strong class="chat-card-title">${node.title || node.name}</strong>
              <span class="chat-card-badge">${node.category || 'General'}</span>
            </div>
            <div class="chat-card-desc">${node.description || 'No description provided.'}</div>
            <div class="chat-card-footer">
              <span>🛒 ${partsCount} · Status: <strong>${node.status || 'concept'}</strong></span>
              <button class="chat-card-focus-btn" data-node-id="${node.id}" title="Focus camera on this project in 3D mindmap">
                🔍 Focus 3D
              </button>
            </div>
          </div>
        `;
      }).join('');

      const cardsContainer = document.createElement('div');
      cardsContainer.innerHTML = cardsHtml;

      // Wire Focus 3D button
      cardsContainer.querySelectorAll('.chat-card-focus-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const nodeId = btn.getAttribute('data-node-id');
          if (this.app && this.app.graph3d) {
            this.app.graph3d.focusOnNode(nodeId);
          }
          const targetNode = (this.app.allNodes || []).find(n => n.id === nodeId);
          if (targetNode && this.app.onNodeSelected) {
            this.app.onNodeSelected(targetNode);
          }
        });
      });

      bubble.appendChild(cardsContainer);
    }

    // Clean user message text: strip out any raw @[Title] strings so the card cleanly replaces them!
    let cleanContent = content;
    if (referencedNodes && referencedNodes.length > 0) {
      referencedNodes.forEach(node => {
        const title = (node.title || node.name || '').trim();
        if (title) {
          cleanContent = cleanContent.split('@' + title).join('').trim();
          cleanContent = cleanContent.split('@' + title.toLowerCase()).join('').trim();
        }
      });
    }

    if (cleanContent) {
      const textContainer = document.createElement('div');
      if (referencedNodes && referencedNodes.length > 0) {
        textContainer.style.marginTop = '6px';
      }
      if (isRaw) {
        if (window.marked && typeof marked.parse === 'function') {
          textContainer.innerHTML = marked.parse(cleanContent);
        } else {
          textContainer.textContent = cleanContent;
        }
      } else {
        textContainer.innerHTML = cleanContent;
      }
      bubble.appendChild(textContainer);
    }

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    this.messagesContainer.appendChild(msgDiv);
    this.scrollToBottom();
    if (role === 'assistant' && isRaw) this.recordEntry({ role: 'assistant', kind: 'md', text: content });
    return msgDiv;
  }

  appendLoadingIndicator(customText = null) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-message assistant chat-loading';
    const icon = this.activeAgentIcon ? this.activeAgentIcon.textContent : '🤖';
    const providerName = (this.agentConfig.provider || 'AI').toUpperCase();
    const statusText = customText || `${providerName} is thinking & analyzing context...`;

    loadingDiv.innerHTML = `
      <div class="chat-message-avatar">${icon}</div>
      <div class="chat-bubble" style="display: flex; align-items: center; gap: 8px;">
        <span class="chat-spinner"></span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${statusText}</span>
      </div>
    `;
    this.messagesContainer.appendChild(loadingDiv);
    this.scrollToBottom();
    return loadingDiv;
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  // ---- Chat history persistence ----

  recordEntry(entry) {
    if (this.restoringChat) return;
    this.chatLog.push(entry);
    this.scheduleSaveChat();
  }

  scheduleSaveChat() {
    if (this.restoringChat || this.chatLog.length === 0) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveChat(), 300);
  }

  chatTitle() {
    const first = this.chatLog.find(e => e.role === 'user');
    let t = '';
    if (first) {
      if (first.kind === 'voice') {
        t = '🎙️ ' + (first.transcript || 'Voice note');
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = first.html || '';
        t = tmp.textContent || '';
      }
    }
    t = t.replace(/\s+/g, ' ').trim();
    return (t.length > 70 ? t.slice(0, 70) + '…' : t) || 'Untitled chat';
  }

  async saveChat() {
    if (this.chatLog.length === 0) return;
    if (!this.chatId) {
      this.chatId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    try {
      await fetch('/api/chats/' + this.chatId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: this.chatTitle(),
          provider: this.agentConfig.provider || 'agy',
          model: this.agentConfig.model || null,
          messages: this.chatLog,
          history: this.history
        })
      });
    } catch (e) {
      console.warn('Could not save chat history', e);
    }
  }

  toggleHistory() {
    if (!this.historyPanel) return;
    if (this.historyPanel.style.display === 'none') {
      this.closeSettings();
      this.historyPanel.style.display = 'flex';
      this.refreshHistoryList();
    } else {
      this.closeHistory();
    }
  }

  closeHistory() {
    if (this.historyPanel) this.historyPanel.style.display = 'none';
  }

  async refreshHistoryList() {
    if (!this.historyList) return;
    this.historyList.innerHTML = '<div class="chat-history-empty">Loading…</div>';
    const resp = await fetch('/api/chats').catch(() => null);
    const chats = resp && resp.ok ? await safeJson(resp) : null;
    if (!Array.isArray(chats)) {
      this.historyList.innerHTML = '<div class="chat-history-empty">Could not load chat history.</div>';
      return;
    }
    if (chats.length === 0) {
      this.historyList.innerHTML = '<div class="chat-history-empty">No saved chats yet. Your conversations will appear here.</div>';
      return;
    }
    this.historyList.innerHTML = '';
    chats.forEach(c => {
      const row = document.createElement('div');
      row.className = 'chat-history-item' + (c.id === this.chatId ? ' active' : '');
      const when = c.updated_at ? new Date(c.updated_at).toLocaleString() : '';
      row.innerHTML = `
        <div class="chat-history-main" title="Open this chat">
          <div class="chat-history-title">${this.escapeHtml(c.title)}</div>
          <div class="chat-history-meta">${this.escapeHtml(when)} · ${c.message_count} messages${c.provider ? ' · ' + this.escapeHtml(c.provider) : ''}</div>
        </div>
        <button class="panel-icon-btn chat-history-delete" title="Delete this chat">🗑</button>
      `;
      row.querySelector('.chat-history-main').addEventListener('click', () => this.loadChat(c.id));
      row.querySelector('.chat-history-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete this chat?\n\n"${c.title}"\n\nThis also removes its voice recordings.`)) return;
        const r = await fetch('/api/chats/' + c.id, { method: 'DELETE' }).catch(() => null);
        if (r && r.ok) {
          if (c.id === this.chatId) { this.chatLog = []; this.clearChat(); } // nothing left to re-save
          this.refreshHistoryList();
        } else {
          alert('Could not delete the chat.');
        }
      });
      this.historyList.appendChild(row);
    });
  }

  async loadChat(id) {
    if (this.isBusy) return;
    const resp = await fetch('/api/chats/' + id).catch(() => null);
    const sess = resp && resp.ok ? await safeJson(resp) : null;
    if (!sess || !Array.isArray(sess.messages)) {
      alert('Could not open this chat.');
      return;
    }
    clearTimeout(this.saveTimer);
    this.chatId = sess.id;
    this.history = Array.isArray(sess.history) ? sess.history : [];
    this.chatLog = sess.messages;
    this.restoringChat = true;
    try {
      if (this.messagesContainer) this.messagesContainer.innerHTML = '';
      if (this.input) this.input.innerHTML = '';
      this.chatLog.forEach(e => {
        if (e.role === 'user' && e.kind === 'voice') {
          this.appendVoiceUserMessage({ audioUrl: e.audioUrl, transcript: e.transcript || '', durationSeconds: e.durationSeconds || 0 });
        } else if (e.role === 'user') {
          this.appendUserMessage(e.html || '');
        } else {
          this.appendMessage('assistant', e.text || '', true);
        }
      });
    } finally {
      this.restoringChat = false;
    }
    this.closeHistory();
    this.scrollToBottom();
  }

  clearChat() {
    // Starts a fresh conversation; the previous one stays available in the history.
    clearTimeout(this.saveTimer);
    if (this.chatLog.length > 0 && this.chatId) this.saveChat();
    this.chatId = null;
    this.chatLog = [];
    this.history = [];
    if (this.messagesContainer) this.messagesContainer.innerHTML = "";
    if (this.input) this.input.innerHTML = "";
    this.appendWelcomeMessage();
  }

  appendUserMessage(bubbleHtml, referencedNodes = []) {
    this.recordEntry({ role: 'user', kind: 'html', html: bubbleHtml });
    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-message user";

    const avatar = document.createElement("div");
    avatar.className = "chat-message-avatar";
    avatar.textContent = "👤";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.innerHTML = bubbleHtml;

    bubble.querySelectorAll(".inline-node-card").forEach(card => {
      const id = card.getAttribute("data-node-id");
      card.addEventListener("click", () => {
        if (this.app && this.app.graph3d && id) {
          this.app.graph3d.focusOnNode(id);
        }
      });
    });

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);

    if (this.messagesContainer) {
      this.messagesContainer.appendChild(msgDiv);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  async sendMessage() {
    const { text, referencedNodes, bubbleHtml } = this.serializeInput();

    if ((!text && referencedNodes.length === 0) || this.isBusy) return;

    // Reset input field
    this.input.innerHTML = "";
    this.adjustInputHeight();
    this.hideMentionPopup();

    this.isBusy = true;
    this.btnSend.disabled = true;

    // Append user message with clean inline cards directly inside the text flow!
    this.appendUserMessage(bubbleHtml, referencedNodes);
    this.history.push({ role: "user", content: text });

    const loadingElem = this.appendLoadingIndicator();

    try {
      const resp = await fetch("/api/mcp/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: this.history,
          provider: this.agentConfig.provider || "agy",
          model: this.agentConfig.model,
          endpoint_url: this.agentConfig.endpoint_url,
          api_key: this.agentConfig.api_key,
          referenced_ideas: referencedNodes
        })
      });

      const data = await safeJson(resp);
      loadingElem.remove();

      if (data.success && data.response) {
        let respText = data.response;
        if (data.created_idea) {
          respText += `\n\n> 🐿️ **Auto-Saved to Mindmap**: Added **${data.created_idea.title}** to \`${data.created_idea.category || "General"}\`!`;
        }
        if (data.attempts && data.attempts > 1) {
          respText += `\n\n*(⚡ AI diagnosed failure and self-corrected on attempt ${data.attempts})*`;
        }
        this.appendMessage("assistant", respText, true);
        this.history.push({ role: "assistant", content: data.response });

        // Refresh graph data in case agent created or linked ideas
        await this.app.loadGraphData();
        if (data.created_idea && this.app && this.app.graph3d) {
          this.app.graph3d.focusOnNode(data.created_idea.id);
          if (this.app.showToast) {
            this.app.showToast(`Saved "${data.created_idea.title}" to your mindmap!`, "success");
          }
        }
      } else {
        if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
          this.history.pop();
        }
        const errMsg = data.error || "Failed to receive response from agent.";
        this.appendErrorCard({
          provider: this.agentConfig.provider || "agy",
          model: data.model || this.agentConfig.model,
          errorMessage: errMsg,
          originalText: text,
          referencedNodes: referencedNodes,
          bubbleHtml: bubbleHtml
        });
      }
    } catch (err) {
      loadingElem.remove();
      if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
        this.history.pop();
      }
      this.appendErrorCard({
        provider: this.agentConfig.provider || "agy",
        model: this.agentConfig.model,
        errorMessage: err.message,
        originalText: text,
        referencedNodes: referencedNodes,
        bubbleHtml: bubbleHtml
      });
    } finally {
      this.isBusy = false;
      this.btnSend.disabled = false;
      if (this.input) this.input.focus();
    }
  }

  appendErrorCard({ provider, model, errorMessage, originalText, referencedNodes, bubbleHtml }) {
    this.scheduleSaveChat(); // history was rolled back for the failed request
    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-message assistant chat-error-container";

    const avatar = document.createElement("div");
    avatar.className = "chat-message-avatar chat-error-avatar";
    avatar.textContent = "⚠️";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-error-bubble";

    const errorId = `err_${Date.now()}`;
    const escapedMsg = this.escapeHtml(errorMessage || "Unknown error");
    const escapedModel = this.escapeHtml(model || "");

    bubble.innerHTML = `
      <div class="chat-error-header">
        <span class="chat-error-badge">Execution Error (${(provider || "AI").toUpperCase()})</span>
        <span class="chat-error-model">${escapedModel}</span>
      </div>
      <div class="chat-error-explanation">
        Processing halted because the agent encountered an error:
      </div>
      <pre class="chat-error-details">${escapedMsg}</pre>
      <div class="chat-error-actions">
        <button class="chat-error-btn btn-tell-ai" id="btnTellAi_${errorId}" title="Feeds error details back to AI so it diagnoses what went wrong and has another go">
          🔄 Tell AI what went wrong & retry
        </button>
        <button class="chat-error-btn btn-retry-direct" id="btnRetry_${errorId}" title="Re-execute the exact same request">
          🔁 Retry
        </button>
        <button class="chat-error-btn btn-edit-request" id="btnEdit_${errorId}" title="Restore prompt into the input field for editing">
          ✏️ Edit prompt
        </button>
      </div>
    `;

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    this.messagesContainer.appendChild(msgDiv);
    this.scrollToBottom();

    const btnTellAi = bubble.querySelector(`#btnTellAi_${errorId}`);
    if (btnTellAi) {
      btnTellAi.addEventListener("click", () => {
        msgDiv.remove();
        this.tellAiWhatWentWrongAndRetry({
          originalText,
          errorMessage,
          referencedNodes
        });
      });
    }

    const btnRetry = bubble.querySelector(`#btnRetry_${errorId}`);
    if (btnRetry) {
      btnRetry.addEventListener("click", () => {
        msgDiv.remove();
        this.resendRequest(originalText, referencedNodes, bubbleHtml);
      });
    }

    const btnEdit = bubble.querySelector(`#btnEdit_${errorId}`);
    if (btnEdit) {
      btnEdit.addEventListener("click", () => {
        msgDiv.remove();
        this.restoreInput(originalText, referencedNodes);
      });
    }

    return msgDiv;
  }

  async tellAiWhatWentWrongAndRetry({ originalText, errorMessage, referencedNodes }) {
    if (this.isBusy) return;

    const correctivePrompt = `My previous request encountered an execution error:\n> ${errorMessage}\n\nPlease diagnose what went wrong, correct the approach, and fulfill the original request:\n\n${originalText}`;

    const displayHtml = `
      <div class="chat-self-correct-tag">🔄 <em>Self-Correction Retry</em></div>
      <div style="font-size: 0.82rem; margin-top: 4px;"><strong>Diagnosing error:</strong> <code>${this.escapeHtml(errorMessage.substring(0, 100))}...</code></div>
      <div style="font-size: 0.85rem; margin-top: 4px; color: var(--text-secondary);">${this.escapeHtml(originalText)}</div>
    `;
    this.appendUserMessage(displayHtml, referencedNodes);
    this.history.push({ role: "user", content: correctivePrompt });

    this.isBusy = true;
    this.btnSend.disabled = true;
    const loadingElem = this.appendLoadingIndicator();

    try {
      const resp = await fetch("/api/mcp/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: correctivePrompt,
          history: this.history,
          provider: this.agentConfig.provider || "agy",
          model: this.agentConfig.model,
          endpoint_url: this.agentConfig.endpoint_url,
          api_key: this.agentConfig.api_key,
          referenced_ideas: referencedNodes
        })
      });

      const data = await safeJson(resp);
      loadingElem.remove();

      if (data.success && data.response) {
        let respText = data.response;
        if (data.attempts && data.attempts > 1) {
          respText += `\n\n*(⚡ AI self-corrected on backend attempt ${data.attempts})*`;
        }
        this.appendMessage("assistant", respText, true);
        this.history.push({ role: "assistant", content: data.response });
        await this.app.loadGraphData();
      } else {
        if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
          this.history.pop();
        }
        const errMsg = data.error || "Failed to receive response from agent.";
        this.appendErrorCard({
          provider: this.agentConfig.provider || "agy",
          model: data.model || this.agentConfig.model,
          errorMessage: errMsg,
          originalText,
          referencedNodes,
          bubbleHtml: displayHtml
        });
      }
    } catch (err) {
      loadingElem.remove();
      if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
        this.history.pop();
      }
      this.appendErrorCard({
        provider: this.agentConfig.provider || "agy",
        model: this.agentConfig.model,
        errorMessage: err.message,
        originalText,
        referencedNodes,
        bubbleHtml: displayHtml
      });
    } finally {
      this.isBusy = false;
      this.btnSend.disabled = false;
      if (this.input) this.input.focus();
    }
  }

  async resendRequest(text, referencedNodes, bubbleHtml) {
    if (this.isBusy) return;

    this.appendUserMessage(bubbleHtml, referencedNodes);
    this.history.push({ role: "user", content: text });

    this.isBusy = true;
    this.btnSend.disabled = true;
    const loadingElem = this.appendLoadingIndicator();

    try {
      const resp = await fetch("/api/mcp/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: this.history,
          provider: this.agentConfig.provider || "agy",
          model: this.agentConfig.model,
          endpoint_url: this.agentConfig.endpoint_url,
          api_key: this.agentConfig.api_key,
          referenced_ideas: referencedNodes
        })
      });

      const data = await safeJson(resp);
      loadingElem.remove();

      if (data.success && data.response) {
        let respText = data.response;
        if (data.attempts && data.attempts > 1) {
          respText += `\n\n*(⚡ AI self-corrected on attempt ${data.attempts})*`;
        }
        this.appendMessage("assistant", respText, true);
        this.history.push({ role: "assistant", content: data.response });
        await this.app.loadGraphData();
      } else {
        if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
          this.history.pop();
        }
        const errMsg = data.error || "Failed to receive response from agent.";
        this.appendErrorCard({
          provider: this.agentConfig.provider || "agy",
          model: data.model || this.agentConfig.model,
          errorMessage: errMsg,
          originalText: text,
          referencedNodes: referencedNodes,
          bubbleHtml: bubbleHtml
        });
      }
    } catch (err) {
      loadingElem.remove();
      if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
        this.history.pop();
      }
      this.appendErrorCard({
        provider: this.agentConfig.provider || "agy",
        model: this.agentConfig.model,
        errorMessage: err.message,
        originalText: text,
        referencedNodes: referencedNodes,
        bubbleHtml: bubbleHtml
      });
    } finally {
      this.isBusy = false;
      this.btnSend.disabled = false;
      if (this.input) this.input.focus();
    }
  }

  restoreInput(text, referencedNodes) {
    if (!this.input) return;
    this.input.innerHTML = "";
    if (referencedNodes && referencedNodes.length > 0) {
      referencedNodes.forEach(node => {
        const card = this.createInlineCardElement(node, true);
        this.input.appendChild(card);
        this.input.appendChild(document.createTextNode(" "));
      });
    }
    if (text) {
      this.input.appendChild(document.createTextNode(text));
    }
    this.adjustInputHeight();
    this.input.focus();
  }

  // =========================================================================
  // VOICE RECORDING & WHISPER TRANSCRIPTION PIPELINE
  // =========================================================================

  async startVoiceRecording() {
    if (this.isBusy || this.isRecordingVoice) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (this.app && this.app.showToast) {
        this.app.showToast("Audio recording is not supported in this browser/environment.", "error");
      } else {
        alert("Audio recording is not supported in this browser.");
      }
      return;
    }

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Microphone access error:", err);
      if (this.app && this.app.showToast) {
        this.app.showToast("Microphone access denied. Please enable microphone permissions.", "error");
      } else {
        alert("Microphone access denied.");
      }
      return;
    }

    // Select supported audio MIME type
    let mimeType = "audio/webm;codecs=opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else {
        mimeType = "";
      }
    }

    this.recordingMimeType = mimeType;
    this.audioChunks = [];
    this.voiceSeconds = 0;

    try {
      this.mediaRecorder = mimeType ? new MediaRecorder(this.audioStream, { mimeType }) : new MediaRecorder(this.audioStream);
    } catch (err) {
      console.warn("Falling back to default MediaRecorder options", err);
      this.mediaRecorder = new MediaRecorder(this.audioStream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(250); // Slice chunks every 250ms
    this.isRecordingVoice = true;

    // Update UI state
    if (this.voiceRecordingHud) this.voiceRecordingHud.style.display = "flex";
    if (this.btnVoiceRecord) this.btnVoiceRecord.classList.add("recording");
    if (this.voiceDurationCounter) this.voiceDurationCounter.textContent = "00:00";

    this.voiceTimer = setInterval(() => {
      this.voiceSeconds++;
      const mins = String(Math.floor(this.voiceSeconds / 60)).padStart(2, "0");
      const secs = String(this.voiceSeconds % 60).padStart(2, "0");
      if (this.voiceDurationCounter) {
        this.voiceDurationCounter.textContent = `${mins}:${secs}`;
      }
    }, 1000);
  }

  stopVoiceRecording(saveAndProcess = true) {
    if (!this.isRecordingVoice || !this.mediaRecorder) return;

    if (this.voiceTimer) {
      clearInterval(this.voiceTimer);
      this.voiceTimer = null;
    }

    this.isRecordingVoice = false;
    if (this.voiceRecordingHud) this.voiceRecordingHud.style.display = "none";
    if (this.btnVoiceRecord) this.btnVoiceRecord.classList.remove("recording");

    if (!saveAndProcess) {
      // Discard recording
      if (this.audioStream) {
        this.audioStream.getTracks().forEach(t => t.stop());
        this.audioStream = null;
      }
      this.audioChunks = [];
      return;
    }

    const duration = this.voiceSeconds;

    this.mediaRecorder.onstop = async () => {
      if (this.audioStream) {
        this.audioStream.getTracks().forEach(t => t.stop());
        this.audioStream = null;
      }

      const recordedBlob = new Blob(this.audioChunks, { type: this.recordingMimeType || "audio/webm" });
      this.audioChunks = [];
      await this.processVoiceRecording(recordedBlob, duration);
    };

    try {
      this.mediaRecorder.stop();
    } catch (e) {
      console.warn("Error stopping mediaRecorder:", e);
    }
  }

  appendVoiceUserMessage({ audioUrl, transcript, durationSeconds, referencedNodes = [] }) {
    this.recordEntry({ role: 'user', kind: 'voice', audioUrl, transcript, durationSeconds });
    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-message user chat-voice-user-message";

    const avatar = document.createElement("div");
    avatar.className = "chat-message-avatar";
    avatar.textContent = "👤";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-voice-bubble";

    const mins = Math.floor(durationSeconds / 60);
    const secs = String(durationSeconds % 60).padStart(2, "0");
    const durationFormatted = `${mins}:${secs}`;

    let referencedCardsHtml = "";
    if (referencedNodes && referencedNodes.length > 0) {
      referencedCardsHtml = referencedNodes.map(node => {
        const partsCount = (node.bom && node.bom.length) ? `${node.bom.length} BOM items` : "No BOM listed";
        return `
          <div class="chat-project-card" data-id="${node.id}" style="margin-bottom: 6px;">
            <div class="chat-card-top">
              <span>📌</span>
              <strong class="chat-card-title">${this.escapeHtml(node.title || node.name)}</strong>
              <span class="chat-card-badge">${this.escapeHtml(node.category || "General")}</span>
            </div>
            <div class="chat-card-desc">${this.escapeHtml(node.description || "No description provided.")}</div>
          </div>
        `;
      }).join("");
    }

    bubble.innerHTML = `
      <div class="chat-voice-card">
        <div class="chat-voice-header">
          <span class="chat-voice-badge">🎙️ Voice Note (${durationFormatted})</span>
          <span class="chat-voice-whisper-tag">Whisper AI</span>
        </div>

        <audio controls src="${audioUrl}" class="chat-voice-player" preload="metadata"></audio>

        ${referencedCardsHtml}

        <details class="whisper-transcript-accordion">
          <summary class="whisper-transcript-summary">
            <span>📝 Whisper Transcript</span>
            <span class="whisper-toggle-hint">Show text ▾</span>
          </summary>
          <div class="whisper-transcript-content">
            <p>${this.escapeHtml(transcript)}</p>
          </div>
        </details>
      </div>
    `;

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);

    if (this.messagesContainer) {
      this.messagesContainer.appendChild(msgDiv);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    return msgDiv;
  }

  async processVoiceRecording(audioBlob, durationSeconds) {
    if (this.isBusy) return;

    if (!audioBlob || audioBlob.size < 200) {
      if (this.app && this.app.showToast) {
        this.app.showToast("Voice recording was too short or empty.", "warn");
      }
      return;
    }

    // Capture any project nodes referenced in the input box before recording
    const { referencedNodes } = this.serializeInput();
    if (this.input) this.input.innerHTML = "";
    this.adjustInputHeight();
    this.hideMentionPopup();

    this.isBusy = true;
    this.btnSend.disabled = true;
    if (this.btnVoiceRecord) this.btnVoiceRecord.disabled = true;

    // Step 1: Upload to Whisper & transcribe
    const loadingElem = this.appendLoadingIndicator("🎙️ Transcribing voice recording with Whisper AI...");

    let transcriptData = null;
    try {
      const formData = new FormData();
      const ext = (this.recordingMimeType && this.recordingMimeType.includes("ogg")) ? "ogg" : "webm";
      formData.append("file", audioBlob, `voice_recording_${Date.now()}.${ext}`);

      const resp = await fetch("/api/whisper/transcribe", {
        method: "POST",
        body: formData
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || `Whisper error (HTTP ${resp.status})`);
      }

      transcriptData = await resp.json();
    } catch (err) {
      loadingElem.remove();
      this.isBusy = false;
      this.btnSend.disabled = false;
      if (this.btnVoiceRecord) this.btnVoiceRecord.disabled = false;

      this.appendErrorCard({
        provider: "Whisper AI",
        model: "base",
        errorMessage: `Failed to transcribe audio recording: ${err.message}`,
        originalText: "Voice Recording",
        referencedNodes: referencedNodes,
        bubbleHtml: `<div>🎙️ <em>Voice Recording (${durationSeconds}s) failed transcription.</em></div>`
      });
      return;
    }

    loadingElem.remove();

    const rawTranscript = (transcriptData.text || "").trim();
    if (!rawTranscript) {
      this.isBusy = false;
      this.btnSend.disabled = false;
      if (this.btnVoiceRecord) this.btnVoiceRecord.disabled = false;

      if (this.app && this.app.showToast) {
        this.app.showToast("No clear speech detected by Whisper. Please speak louder or closer to the mic.", "warn");
      } else {
        this.appendMessage("assistant", "⚠️ **Whisper AI**: No speech could be detected in the recording. Please try speaking closer to your microphone.", false);
      }
      return;
    }

    // Step 2: Append the user Voice Note card to chat (collapsible Whisper transcript)
    this.appendVoiceUserMessage({
      audioUrl: transcriptData.audio_url,
      transcript: rawTranscript,
      durationSeconds,
      referencedNodes
    });
    this.history.push({ role: "user", content: rawTranscript });

    // Step 3: Pipe the Whisper transcript into the selected AI Agent
    const providerName = (this.agentConfig.provider || "AI").toUpperCase();
    const aiLoadingElem = this.appendLoadingIndicator(`${providerName} is structuring project & analyzing tangents...`);

    try {
      const chatResp = await fetch("/api/mcp/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: rawTranscript,
          history: this.history,
          provider: this.agentConfig.provider || "agy",
          model: this.agentConfig.model,
          endpoint_url: this.agentConfig.endpoint_url,
          api_key: this.agentConfig.api_key,
          referenced_ideas: referencedNodes,
          is_voice: true,
          voice_metadata: {
            audio_url: transcriptData.audio_url,
            duration: durationSeconds,
            language: transcriptData.language
          }
        })
      });

      const chatData = await safeJson(chatResp);
      aiLoadingElem.remove();

      if (chatData.success && chatData.response) {
        let respText = chatData.response;
        if (chatData.created_idea) {
          respText += `\n\n> 🐿️ **Auto-Saved to Mindmap**: Added **${chatData.created_idea.title}** to \`${chatData.created_idea.category || "General"}\`!`;
        }
        if (chatData.attempts && chatData.attempts > 1) {
          respText += `\n\n*(⚡ AI diagnosed failure and self-corrected on attempt ${chatData.attempts})*`;
        }
        this.appendMessage("assistant", respText, true);
        this.history.push({ role: "assistant", content: chatData.response });

        // Refresh graph data in case agent created or linked ideas
        await this.app.loadGraphData();
        if (chatData.created_idea && this.app && this.app.graph3d) {
          this.app.graph3d.focusOnNode(chatData.created_idea.id);
          if (this.app.showToast) {
            this.app.showToast(`Saved "${chatData.created_idea.title}" to your mindmap!`, "success");
          }
        }
      } else {
        if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
          this.history.pop();
        }
        const errMsg = chatData.error || "Failed to receive response from agent.";
        this.appendErrorCard({
          provider: this.agentConfig.provider || "agy",
          model: chatData.model || this.agentConfig.model,
          errorMessage: errMsg,
          originalText: rawTranscript,
          referencedNodes: referencedNodes,
          bubbleHtml: `<div>🎙️ Voice idea: <em>${this.escapeHtml(rawTranscript.substring(0, 100))}...</em></div>`
        });
      }
    } catch (err) {
      aiLoadingElem.remove();
      if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
        this.history.pop();
      }
      this.appendErrorCard({
        provider: this.agentConfig.provider || "agy",
        model: this.agentConfig.model,
        errorMessage: err.message,
        originalText: rawTranscript,
        referencedNodes: referencedNodes,
        bubbleHtml: `<div>🎙️ Voice idea: <em>${this.escapeHtml(rawTranscript.substring(0, 100))}...</em></div>`
      });
    } finally {
      this.isBusy = false;
      this.btnSend.disabled = false;
      if (this.btnVoiceRecord) this.btnVoiceRecord.disabled = false;
      if (this.input) this.input.focus();
    }
  }

}

window.McpChatManager = McpChatManager;
