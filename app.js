/* ==========================================================================
   輕鬆寫 (Qīngsōng Xiě) — AI 小說創作工坊
   純前端 vanilla JS，資料存於瀏覽器 localStorage，可直接部署於 GitHub Pages。
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------------
     常數與儲存
     --------------------------------------------------------------------- */
  const STORE_KEY = "novelforge:v1:projects";
  const AI_KEY = "novelforge:v1:aiConfig";

  const POV_OPTIONS = [
    "第一人稱",
    "第三人稱限知（單一視角）",
    "第三人稱限知（多視角輪替）",
    "第三人稱全知",
    "第二人稱"
  ];

  const PROVIDER_INFO = {
    anthropic: {
      label: "Anthropic（Claude）",
      endpoint: "https://api.anthropic.com/v1/messages",
      modelPlaceholder: "例如：claude-sonnet-4-6",
      modelSuggestions: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-6"],
      note: "Anthropic 官方支援瀏覽器端直接呼叫（CORS），是本工具最推薦、最穩定的選項之一。API 金鑰只會存在你的瀏覽器裡，直接送往 Anthropic 官方網址。",
      keyUrl: "https://console.anthropic.com/settings/keys",
      keyLabel: "console.anthropic.com（需先儲值額度）"
    },
    google: {
      label: "Google（Gemini）",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
      modelPlaceholder: "例如：gemini-2.5-flash / gemini-2.5-pro",
      modelSuggestions: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
      note: "Google 的 Gemini API（generateContent）本身就允許瀏覽器跨網域直接呼叫，不需要額外標頭，同樣是穩定可用的選擇，通常有免費額度可先試用。",
      keyUrl: "https://aistudio.google.com/app/apikey",
      keyLabel: "aistudio.google.com（有免費額度）"
    },
    openrouter: {
      label: "OpenRouter（多模型聚合）",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      modelPlaceholder: "例如：anthropic/claude-sonnet-4.6、openai/gpt-4.1、google/gemini-2.5-pro",
      modelSuggestions: ["anthropic/claude-sonnet-4.6", "openai/gpt-4.1", "google/gemini-2.5-pro", "deepseek/deepseek-chat"],
      note: "用一組金鑰呼叫多家廠商的模型（含 OpenAI、Anthropic、Google 等），採 OpenAI 相容格式，一般允許瀏覽器直接呼叫。可用餘額制付費，模型清單與價格請查 openrouter.ai/models。",
      keyUrl: "https://openrouter.ai/keys",
      keyLabel: "openrouter.ai（依用量計費）"
    },
    openai: {
      label: "OpenAI 相容 API",
      endpoint: "https://api.openai.com/v1/chat/completions",
      modelPlaceholder: "例如：gpt-4.1 / gpt-4o",
      modelSuggestions: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
      note: "OpenAI 官方 API 通常會擋掉瀏覽器直接呼叫（CORS 限制），純靜態網站可能無法直連。建議改用支援瀏覽器呼叫的相容服務（例如 OpenRouter），或自行架設一個轉發用的伺服器端 Proxy。",
      keyUrl: "https://platform.openai.com/api-keys",
      keyLabel: "platform.openai.com（需先儲值額度）"
    },
    custom: {
      label: "自訂 OpenAI 相容端點",
      endpoint: "",
      modelPlaceholder: "依服務提供的模型名稱填寫",
      modelSuggestions: [],
      note: "適用於 Ollama（本機）、DeepSeek、月之暗面等任何相容 OpenAI Chat Completions 格式、且允許瀏覽器跨網域呼叫的服務。請填入完整的 chat/completions 端點網址。",
      keyUrl: "",
      keyLabel: ""
    }
  };

  const GENRE_PRESETS = ["都市異能", "奇幻", "武俠", "仙俠", "科幻", "歷史架空", "懸疑推理", "恐怖驚悚", "言情", "校園青春", "職場", "家庭倫理", "冒險", "輕小說", "反烏托邦"];
  const TONE_PRESETS = ["輕鬆詼諧", "溫暖治癒", "黑暗壓抑", "熱血激昂", "浪漫甜蜜", "懸疑緊張", "冷峻寫實", "荒誕幽默", "感傷憂鬱", "史詩壯闊"];
  const STYLE_PRESETS = ["短句明快", "長句細膩", "感官細節豐富", "對白為主導", "內心獨白多", "意識流", "古典雅致", "白話直敘", "電影運鏡感", "詩意抒情"];

  /* ---------------------------------------------------------------------
     工具函式
     --------------------------------------------------------------------- */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function countWords(text) {
    if (!text) return 0;
    return text.replace(/\s+/g, "").length;
  }

  function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
  }

  function confirmModal(title, body, okLabel) {
    return new Promise((resolve) => {
      const backdrop = $("#modal-backdrop");
      $("#modal-title").textContent = title;
      $("#modal-body").textContent = body;
      const actions = $("#modal-actions");
      actions.innerHTML = "";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-ghost";
      cancelBtn.textContent = "取消";
      const okBtn = document.createElement("button");
      okBtn.className = "btn btn-danger";
      okBtn.textContent = okLabel || "確定";
      actions.append(cancelBtn, okBtn);
      backdrop.classList.remove("hidden");
      function close(result) {
        backdrop.classList.add("hidden");
        resolve(result);
      }
      cancelBtn.onclick = () => close(false);
      okBtn.onclick = () => close(true);
      backdrop.onclick = (e) => { if (e.target === backdrop) close(false); };
    });
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  /* ---------------------------------------------------------------------
     資料層
     --------------------------------------------------------------------- */
  let db = { projects: {}, order: [], activeId: null };
  let aiConfig = { provider: "anthropic", endpoint: "", apiKey: "", model: "", temperature: 0.9 };

  function loadDb() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) db = JSON.parse(raw);
    } catch (e) { console.error("讀取專案資料失敗", e); }
    if (!db.projects) db.projects = {};
    if (!db.order) db.order = Object.keys(db.projects);
  }

  const persistDb = debounce(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
    catch (e) { toast("儲存失敗，瀏覽器儲存空間可能已滿"); console.error(e); }
  }, 250);

  function loadAiConfig() {
    try {
      const raw = localStorage.getItem(AI_KEY);
      if (raw) aiConfig = Object.assign(aiConfig, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }
  function persistAiConfig() {
    localStorage.setItem(AI_KEY, JSON.stringify(aiConfig));
  }

  function newProject(name) {
    const id = uid();
    const now = Date.now();
    db.projects[id] = {
      id, name: name || "未命名作品", createdAt: now, updatedAt: now,
      settings: {
        style: "", references: "", genre: "", targetWordCount: 100000,
        pov: POV_OPTIONS[1], povCharacter: "", tone: ""
      },
      characterPlan: { coreCount: 3, sideCount: 5 },
      characters: [],
      world: "",
      timeline: [],
      glossary: [],
      constraints: { mustInclude: "", mustAvoid: "", rating: "", other: "" },
      chapters: [],
      review: null,
      ebookSettings: { fontSize: 18, lineHeight: 2.0, theme: "paper", direction: "horizontal", mode: "scroll", coverStyle: "jp" }
    };
    db.order.unshift(id);
    db.activeId = id;
    persistDb();
    return id;
  }

  function activeProject() {
    return db.projects[db.activeId] || null;
  }

  function touch(p) { p.updatedAt = Date.now(); persistDb(); }

  function projectWordCount(p) {
    let sum = 0;
    (p.chapters || []).forEach((c) => (c.sections || []).forEach((s) => (sum += countWords(s.content))));
    return sum;
  }
  function projectSectionCount(p) {
    let sec = 0, done = 0;
    (p.chapters || []).forEach((c) => (c.sections || []).forEach((s) => { sec++; if (s.status === "done") done++; }));
    return { sec, done };
  }

  /* ---------------------------------------------------------------------
     頂層渲染
     --------------------------------------------------------------------- */
  let state = { tab: "settings", openChapters: {}, openSections: {}, tagPools: {}, openTimelineId: null };

  function render() {
    renderShelf();
    const p = activeProject();
    $("#mobile-title").textContent = p ? (p.name || "未命名作品") : "輕鬆寫";
    if (!p) {
      $("#empty-state").classList.remove("hidden");
      $("#project-view").classList.add("hidden");
      return;
    }
    $("#empty-state").classList.add("hidden");
    $("#project-view").classList.remove("hidden");
    renderProjectHeader(p);
    renderTabs();
    renderActivePanel(p);
  }

  function toggleShelf() {
    $("#shelf").classList.toggle("is-open");
    $("#shelf-backdrop").classList.toggle("is-open");
  }
  function closeShelf() {
    $("#shelf").classList.remove("is-open");
    $("#shelf-backdrop").classList.remove("is-open");
  }

  function renderShelf() {
    const list = $("#project-list");
    const q = ($("#project-search").value || "").trim().toLowerCase();
    const ids = db.order.filter((id) => db.projects[id]);
    if (ids.length === 0) {
      list.innerHTML = `<div class="shelf-empty">還沒有任何作品，點上方「＋ 新增作品」開始寫作。</div>`;
      return;
    }
    let html = "";
    let shown = 0;
    ids.forEach((id) => {
      const p = db.projects[id];
      if (q && !p.name.toLowerCase().includes(q)) return;
      shown++;
      const wc = projectWordCount(p);
      const active = id === db.activeId ? "is-active" : "";
      html += `
        <div class="project-card ${active}" data-act="select-project" data-id="${id}">
          <h3>${escapeHtml(p.name || "未命名作品")}</h3>
          <div class="meta"><span>${wc.toLocaleString()} 字</span><span>${formatDate(p.updatedAt)}</span></div>
          <div class="card-actions">
            <button class="icon-btn" data-act="duplicate-project" data-id="${id}">複製</button>
            <button class="icon-btn" data-act="delete-project" data-id="${id}">刪除</button>
          </div>
        </div>`;
    });
    if (shown === 0) html = `<div class="shelf-empty">找不到符合「${escapeHtml(q)}」的作品。</div>`;
    list.innerHTML = html;
  }

  function renderProjectHeader(p) {
    const nameInput = $("#project-name");
    if (document.activeElement !== nameInput) nameInput.value = p.name;
    const wc = projectWordCount(p);
    const { sec, done } = projectSectionCount(p);
    const target = p.settings.targetWordCount || 0;
    $("#project-stats").innerHTML = `
      <span><b>${wc.toLocaleString()}</b> / ${target.toLocaleString()} 字</span>
      <span><b>${p.chapters.length}</b> 章</span>
      <span><b>${done}</b> / ${sec} 節已完成</span>
    `;
  }

  function renderTabs() {
    $$(".tab-btn").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === state.tab));
    $$(".panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== state.tab));
  }

  function renderActivePanel(p) {
    const renderers = {
      settings: renderSettingsPanel, world: renderWorldPanel, timeline: renderTimelinePanel,
      characters: renderCharactersPanel, glossary: renderGlossaryPanel, constraints: renderConstraintsPanel,
      structure: renderStructurePanel, review: renderReviewPanel, ebook: renderEbookPanel,
      ai: renderAiPanel, export: renderExportPanel
    };
    const fn = renderers[state.tab];
    if (fn) fn(p);
  }

  /* ---------------------------------------------------------------------
     標籤（tag picker）選項小工具：已選標籤以膠囊顯示，未選項目以小批
     隨機選項輪替顯示，選了就消失、自動補上新的一個，避免整批塞滿畫面。
     共用於基本設定的類型／基調／風格。
     --------------------------------------------------------------------- */
  const POOL_SIZE = 6;
  function parseTags(value) {
    return (value || "").split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
  }
  function toggleTag(value, tag) {
    const parts = parseTags(value);
    const idx = parts.indexOf(tag);
    if (idx >= 0) parts.splice(idx, 1); else parts.push(tag);
    return parts.join("、");
  }
  function shuffleSample(arr, n) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }
  function getTagPool(poolKey, presets, selected) {
    const available = presets.filter((t) => !selected.includes(t));
    let pool = state.tagPools[poolKey];
    if (pool) pool = pool.filter((t) => available.includes(t));
    if (!pool || pool.length < Math.min(POOL_SIZE, available.length)) {
      pool = shuffleSample(available, Math.min(POOL_SIZE, available.length));
    }
    state.tagPools[poolKey] = pool;
    return pool;
  }
  function renderTagPicker(p, scope, key, presets, currentValue) {
    const selected = parseTags(currentValue);
    const poolKey = `${p.id}:${scope}:${key}`;
    const pool = getTagPool(poolKey, presets, selected);
    return `
      <div class="tagpicker">
        <div class="tagpicker-selected">${selected.map((tag) => `
          <button type="button" class="tag-pill" data-act="toggle-tag" data-scope="${scope}" data-key="${key}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} <span class="x">✕</span></button>
        `).join("")}</div>
        <div class="tagpicker-pool">
          ${pool.map((tag) => `<button type="button" class="chip" data-act="toggle-tag" data-scope="${scope}" data-key="${key}" data-tag="${escapeHtml(tag)}">＋ ${escapeHtml(tag)}</button>`).join("")}
          ${presets.length > selected.length ? `<button type="button" class="chip-shuffle" data-act="shuffle-tags" data-scope="${scope}" data-key="${key}">⟲ 換一批</button>` : ""}
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------------
     面板：基本設定
     --------------------------------------------------------------------- */
  function renderSettingsPanel(p) {
    const s = p.settings;
    $("#panel-settings").innerHTML = `
      <h2 class="section-title">基本設定</h2>
      <p class="panel-intro">這些設定會在每次 AI 生成內容時自動附上，作為全書一致的創作依據。</p>

      <div class="row row-2">
        <div class="field">
          <label>小說性質／類型</label>
          <input type="text" data-scope="settings" data-key="genre" value="${escapeHtml(s.genre)}" placeholder="例如：都市異能、架空歷史、輕科幻、言情">
          ${renderTagPicker(p, "settings", "genre", GENRE_PRESETS, s.genre)}
        </div>
        <div class="field">
          <label>基調</label>
          <input type="text" data-scope="settings" data-key="tone" value="${escapeHtml(s.tone)}" placeholder="例如：輕鬆詼諧、黑暗壓抑、溫暖治癒">
          ${renderTagPicker(p, "settings", "tone", TONE_PRESETS, s.tone)}
        </div>
      </div>

      <div class="field">
        <label>寫作風格</label>
        <textarea data-scope="settings" data-key="style" placeholder="描述文字節奏、句式長短、用詞偏好、對白比例、節奏快慢等。例如：短句為主、多用感官細節、對白精簡有潛台詞。">${escapeHtml(s.style)}</textarea>
        ${renderTagPicker(p, "settings", "style", STYLE_PRESETS, s.style)}
        <p class="hint">點選標籤可直接加入／移除，未選中的標籤會輪流顯示幾個給你參考，也可以在上面欄位自行補充更細緻的描述。</p>
      </div>

      <div class="field">
        <label>參考作品</label>
        <textarea data-scope="settings" data-key="references" placeholder="列出希望 AI 參考文筆或氛圍的作品（一行一部），AI 會理解其風格特徵但不會照抄內容。">${escapeHtml(s.references)}</textarea>
      </div>

      <div class="row row-2">
        <div class="field">
          <label>人稱／限知視角</label>
          <select data-scope="settings" data-key="pov">
            ${POV_OPTIONS.map((o) => `<option value="${escapeHtml(o)}" ${s.pov === o ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>視角人物（若為限知視角）</label>
          <input type="text" data-scope="settings" data-key="povCharacter" value="${escapeHtml(s.povCharacter)}" placeholder="留空表示依章節不同而變動">
        </div>
      </div>

      <div class="field" style="max-width:260px;">
        <label>目標總字數</label>
        <input type="number" min="0" step="1000" data-scope="settings" data-key="targetWordCount" value="${s.targetWordCount || 0}">
        <p class="hint">用於統計進度，也會提示 AI 掌握全書篇幅比例。</p>
      </div>

      <h2 class="section-title" style="margin-top:30px;">人物規模</h2>
      <p class="panel-intro">先抓一個大致的人數規模，稍後到「人物」分頁再逐一建立實際角色。</p>
      <div class="row row-2">
        <div class="field">
          <label>核心人物人數</label>
          <input type="number" min="0" data-scope="characterPlan" data-key="coreCount" value="${p.characterPlan.coreCount}">
        </div>
        <div class="field">
          <label>配角人數</label>
          <input type="number" min="0" data-scope="characterPlan" data-key="sideCount" value="${p.characterPlan.sideCount}">
        </div>
      </div>
    `;
  }

  /* ---------------------------------------------------------------------
     面板：世界觀
     --------------------------------------------------------------------- */
  function renderWorldPanel(p) {
    $("#panel-world").innerHTML = `
      <h2 class="section-title">世界觀設定</h2>
      <p class="panel-intro">描述故事發生的世界：地理、勢力／組織、規則體系（如魔法、科技、社會制度）、歷史背景等。內容會完整提供給 AI 作為生成依據。</p>
      <div class="field">
        <textarea data-scope="world" data-key="world" style="min-height:420px;" placeholder="例如：
【時空背景】…
【地理與勢力】…
【力量／科技體系與規則】…
【社會制度與風俗】…
【與主線相關的歷史事件】…">${escapeHtml(p.world)}</textarea>
      </div>
    `;
  }

  /* ---------------------------------------------------------------------
     面板：時間線
     --------------------------------------------------------------------- */
  function renderTimelinePanel(p) {
    const nodesHtml = p.timeline.map((t, i) => `
      <div class="timeline-node-wrap ${state.openTimelineId === t.id ? "is-open" : ""}" data-act="toggle-timeline" data-id="${t.id}">
        <div class="timeline-node"></div>
        <div class="timeline-node-time">${escapeHtml(t.time || `事件 ${i + 1}`)}</div>
        <div class="timeline-node-snippet">${escapeHtml((t.event || "").slice(0, 14))}</div>
      </div>
    `).join("");

    const editing = p.timeline.find((t) => t.id === state.openTimelineId);
    const idx = editing ? p.timeline.findIndex((t) => t.id === editing.id) : -1;
    const editorHtml = editing ? `
      <div class="timeline-editor">
        <div class="timeline-editor-head">
          <div class="order-btns">
            <button class="icon-btn" data-act="move-timeline" data-id="${editing.id}" data-dir="-1" ${idx <= 0 ? "disabled" : ""}>← 提前</button>
            <button class="icon-btn" data-act="move-timeline" data-id="${editing.id}" data-dir="1" ${idx >= p.timeline.length - 1 ? "disabled" : ""}>延後 →</button>
          </div>
          <button class="icon-btn" data-act="delete-timeline" data-id="${editing.id}">刪除此事件</button>
        </div>
        <div class="field">
          <label>時間點</label>
          <input type="text" data-scope="timeline" data-id="${editing.id}" data-key="time" value="${escapeHtml(editing.time)}" placeholder="例如：故事開始前十年 / 第三章當下">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>事件內容</label>
          <textarea data-scope="timeline" data-id="${editing.id}" data-key="event" placeholder="發生了什麼事、影響是什麼">${escapeHtml(editing.event)}</textarea>
        </div>
      </div>
    ` : "";

    $("#panel-timeline").innerHTML = `
      <h2 class="section-title">時間線 <span>依故事內時序排列，點圖表上的節點即可編輯</span></h2>
      ${p.timeline.length ? `
        <div class="timeline-chart">
          <div class="timeline-rail"></div>
          ${nodesHtml}
          <div class="timeline-add-node"><button data-act="add-timeline">＋</button></div>
        </div>
      ` : `<div class="timeline-empty">尚未新增任何時間線事件，點下方按鈕開始建立。</div>`}
      ${editorHtml}
      ${!p.timeline.length ? `<button class="btn btn-jade add-row" data-act="add-timeline">＋ 新增事件</button>` : ""}
    `;
  }

  /* ---------------------------------------------------------------------
     面板：人物
     --------------------------------------------------------------------- */
  function renderCharactersPanel(p) {
    const core = p.characters.filter((c) => c.role === "核心");
    const side = p.characters.filter((c) => c.role === "配角");
    function card(c) {
      return `
        <div class="item-card" data-id="${c.id}">
          <div class="item-card-head">
            <span class="tag ${c.role === "核心" ? "tag-core" : "tag-side"}">${c.role}</span>
            <div style="display:flex; gap:8px; align-items:center;">
              <select data-scope="character" data-id="${c.id}" data-key="role" class="icon-btn">
                <option value="核心" ${c.role === "核心" ? "selected" : ""}>核心人物</option>
                <option value="配角" ${c.role === "配角" ? "selected" : ""}>配角</option>
              </select>
              <button class="icon-btn" data-act="delete-character" data-id="${c.id}">刪除</button>
            </div>
          </div>
          <div class="row row-2">
            <div class="field">
              <label>姓名</label>
              <input type="text" data-scope="character" data-id="${c.id}" data-key="name" value="${escapeHtml(c.name)}" placeholder="角色姓名／稱呼">
            </div>
            <div class="field">
              <label>身分定位</label>
              <input type="text" data-scope="character" data-id="${c.id}" data-key="identity" value="${escapeHtml(c.identity)}" placeholder="例如：女主角 / 反派首腦 / 主角摯友">
            </div>
          </div>
          <div class="field">
            <label>個性與說話方式</label>
            <textarea data-scope="character" data-id="${c.id}" data-key="personality" placeholder="性格特質、價值觀、口頭禪、說話習慣">${escapeHtml(c.personality)}</textarea>
          </div>
          <div class="field">
            <label>背景與人物弧線</label>
            <textarea data-scope="character" data-id="${c.id}" data-key="background" placeholder="出身、關鍵經歷、在故事中會如何轉變">${escapeHtml(c.background)}</textarea>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>人物關係</label>
            <input type="text" data-scope="character" data-id="${c.id}" data-key="relationships" value="${escapeHtml(c.relationships)}" placeholder="與其他角色的關係，例如：與林曉是青梅竹馬">
          </div>
        </div>`;
    }
    $("#panel-characters").innerHTML = `
      <h2 class="section-title">核心人物 <span>${core.length} / ${p.characterPlan.coreCount} 人</span></h2>
      ${core.length ? core.map(card).join("") : `<div class="list-empty">尚未新增核心人物。</div>`}
      <button class="btn btn-jade add-row" data-act="add-character" data-role="核心">＋ 新增核心人物</button>

      <h2 class="section-title" style="margin-top:34px;">配角 <span>${side.length} / ${p.characterPlan.sideCount} 人</span></h2>
      ${side.length ? side.map(card).join("") : `<div class="list-empty">尚未新增配角。</div>`}
      <button class="btn btn-jade add-row" data-act="add-character" data-role="配角">＋ 新增配角</button>
    `;
  }

  /* ---------------------------------------------------------------------
     面板：特殊名詞
     --------------------------------------------------------------------- */
  function renderGlossaryPanel(p) {
    const rows = p.glossary.map((g) => `
      <div class="item-card" data-id="${g.id}">
        <div class="row row-2">
          <div class="field" style="margin-bottom:0;">
            <label>名詞</label>
            <input type="text" data-scope="glossary" data-id="${g.id}" data-key="term" value="${escapeHtml(g.term)}" placeholder="專有名詞、地名、招式名、組織名…">
          </div>
          <div class="field" style="margin-bottom:0; display:flex; align-items:flex-end; justify-content:flex-end;">
            <button class="icon-btn" data-act="delete-glossary" data-id="${g.id}">刪除</button>
          </div>
        </div>
        <div class="field" style="margin-top:12px; margin-bottom:0;">
          <label>說明</label>
          <textarea data-scope="glossary" data-id="${g.id}" data-key="definition" placeholder="定義、使用時機、正確寫法（避免 AI 生成時前後不一致）">${escapeHtml(g.definition)}</textarea>
        </div>
      </div>
    `).join("");
    $("#panel-glossary").innerHTML = `
      <h2 class="section-title">特殊名詞表 <span>維持全書用語一致</span></h2>
      ${p.glossary.length ? rows : `<div class="list-empty">尚未新增任何名詞。</div>`}
      <button class="btn btn-jade add-row" data-act="add-glossary">＋ 新增名詞</button>
    `;
  }

  /* ---------------------------------------------------------------------
     面板：故事限制
     --------------------------------------------------------------------- */
  function renderConstraintsPanel(p) {
    const c = p.constraints;
    $("#panel-constraints").innerHTML = `
      <h2 class="section-title">故事限制</h2>
      <p class="panel-intro">告訴 AI 有哪些一定要遵守的規則，避免生成內容偏離設定。</p>
      <div class="field">
        <label>必須包含 / 遵守的設定</label>
        <textarea data-scope="constraints" data-key="mustInclude" placeholder="例如：主角絕不能死、每章結尾要留懸念、時間軸須與時間線一致">${escapeHtml(c.mustInclude)}</textarea>
      </div>
      <div class="field">
        <label>禁止出現的內容</label>
        <textarea data-scope="constraints" data-key="mustAvoid" placeholder="例如：不可出現的劇情、詞彙、角色死亡、特定橋段">${escapeHtml(c.mustAvoid)}</textarea>
      </div>
      <div class="row row-2">
        <div class="field">
          <label>內容分級</label>
          <input type="text" data-scope="constraints" data-key="rating" value="${escapeHtml(c.rating)}" placeholder="例如：闔家 / 普遍級 / 限制暴力與情慾描寫尺度">
        </div>
        <div class="field">
          <label>其他限制</label>
          <input type="text" data-scope="constraints" data-key="other" value="${escapeHtml(c.other)}" placeholder="其他任何補充規則">
        </div>
      </div>
    `;
  }

  /* ---------------------------------------------------------------------
     面板：章節與生成
     --------------------------------------------------------------------- */
  function renderStructurePanel(p) {
    const chaptersHtml = p.chapters.map((c, ci) => renderChapterBlock(p, c, ci)).join("");
    $("#panel-structure").innerHTML = `
      <h2 class="section-title">章節與生成</h2>
      <div class="structure-toolbar">
        <div class="field">
          <label>章數</label>
          <input type="number" min="1" id="gen-chapter-count" value="6">
        </div>
        <div class="field">
          <label>每章節數</label>
          <input type="number" min="1" id="gen-section-count" value="3">
        </div>
        <div class="field">
          <label>每節目標字數</label>
          <input type="number" min="200" step="100" id="gen-section-words" value="2500">
        </div>
        <button class="btn btn-seal" data-act="build-structure">建立章節架構</button>
        <span class="hint" style="flex-basis:100%;">會在現有章節之後，依上方數字建立空白章節與節次；之後可自行增刪與調整標題大綱。</span>
      </div>

      ${p.chapters.length ? chaptersHtml : `<div class="empty-structure">尚未建立任何章節，先在上方設定章數與節數並點「建立章節架構」。</div>`}

      <button class="btn btn-jade add-row" data-act="add-chapter">＋ 新增單一章節</button>
    `;
  }

  function renderChapterBlock(p, c, ci) {
    const isOpen = !!state.openChapters[c.id];
    const wc = (c.sections || []).reduce((s, x) => s + countWords(x.content), 0);
    const sectionsHtml = (c.sections || []).map((s, si) => renderSectionRow(p, c, s, si)).join("");
    return `
      <div class="chapter-block" data-id="${c.id}">
        <div class="chapter-head" data-act="toggle-chapter" data-id="${c.id}">
          <span class="chapter-num">第 ${ci + 1} 章</span>
          <input type="text" data-scope="chapter" data-id="${c.id}" data-key="title" value="${escapeHtml(c.title)}" placeholder="章名" data-act-stop="1">
          <span class="chapter-meta">${(c.sections || []).length} 節・${wc.toLocaleString()} 字</span>
          <button class="icon-btn" data-act="delete-chapter" data-id="${c.id}" data-act-stop="1">刪除章節</button>
        </div>
        <div class="chapter-body ${isOpen ? "" : "hidden"}">
          <div class="field">
            <label>本章大綱</label>
            <textarea class="chapter-outline" data-scope="chapter" data-id="${c.id}" data-key="outline" placeholder="本章要推進的劇情重點">${escapeHtml(c.outline)}</textarea>
          </div>
          ${sectionsHtml}
          <button class="icon-btn" data-act="add-section" data-id="${c.id}">＋ 新增小節</button>
        </div>
      </div>`;
  }

  function renderSectionRow(p, c, s, si) {
    const isOpen = !!state.openSections[s.id];
    const wc = countWords(s.content);
    const statusLabel = { empty: "未撰寫", draft: "草稿", done: "已完成" }[s.status] || "未撰寫";
    return `
      <div class="section-row" data-id="${s.id}">
        <div class="section-row-head" data-act="toggle-section" data-id="${s.id}">
          <span class="sec-num">第 ${si + 1} 節</span>
          <input type="text" class="sec-title" data-scope="section" data-id="${s.id}" data-key="title" value="${escapeHtml(s.title)}" placeholder="小節標題（選填）" data-act-stop="1">
          <span class="status-pill status-${s.status}">${statusLabel}</span>
        </div>
        <div class="section-row-body ${isOpen ? "" : "hidden"}">
          <div class="sec-meta-row">
            <div class="field">
              <label>目標字數</label>
              <input type="number" min="0" step="100" data-scope="section" data-id="${s.id}" data-key="targetWords" value="${s.targetWords || 0}">
            </div>
            <button class="icon-btn" data-act="delete-section" data-id="${s.id}" style="align-self:flex-end;">刪除小節</button>
          </div>
          <div class="field">
            <label>本節大綱</label>
            <textarea class="sec-outline" data-scope="section" data-id="${s.id}" data-key="outline" placeholder="這一節要發生什麼事、以誰的視角、情緒節奏">${escapeHtml(s.outline)}</textarea>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>內容</label>
            <textarea class="sec-content" data-scope="section" data-id="${s.id}" data-key="content" placeholder="AI 生成的內容會顯示在這裡，也可以直接手動撰寫或修改。">${escapeHtml(s.content)}</textarea>
          </div>
          <div class="sec-actions">
            <button class="btn btn-seal btn-sm" data-act="generate-section" data-id="${s.id}">✦ AI 生成本節</button>
            <button class="btn btn-ghost btn-sm" data-act="clear-section" data-id="${s.id}">清空內容</button>
            <span class="sec-wordcount">${wc.toLocaleString()} 字</span>
          </div>
          <div class="revise-box">
            <label>給 AI 的修改建議（內容微調）</label>
            <textarea data-scope="section" data-id="${s.id}" data-key="feedback" placeholder="例如：這段對話太生硬、加強場景氣氛描寫、第二段步調太快、把結尾改得更懸疑一點…">${escapeHtml(s.feedback || "")}</textarea>
            <button class="btn btn-jade btn-sm" data-act="revise-section" data-id="${s.id}">依建議微調本節</button>
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------------
     面板：AI 設定
     --------------------------------------------------------------------- */
  function renderAiPanel() {
    const info = PROVIDER_INFO[aiConfig.provider];
    $("#panel-ai").innerHTML = `
      <h2 class="section-title">AI 設定</h2>
      <p class="panel-intro">這裡的設定適用於所有作品，只會存在這個瀏覽器裡；匯出備份時不會包含金鑰。</p>

      <div class="field">
        <label>服務提供者</label>
        <select id="ai-provider">
          ${Object.keys(PROVIDER_INFO).map((k) => `<option value="${k}" ${aiConfig.provider === k ? "selected" : ""}>${PROVIDER_INFO[k].label}</option>`).join("")}
        </select>
      </div>
      <div class="provider-note" id="provider-note">${info.note}</div>
      ${info.keyUrl ? `<div class="provider-key-link">申請金鑰：<a href="${escapeHtml(info.keyUrl)}" target="_blank" rel="noopener">${escapeHtml(info.keyLabel)}</a></div>` : ""}

      <div class="row row-2">
        <div class="field">
          <label>API 端點網址</label>
          <input type="text" id="ai-endpoint" value="${escapeHtml(aiConfig.endpoint || info.endpoint)}" placeholder="${escapeHtml(info.endpoint)}">
          <p class="field-hint">AI 服務商公告的 API 呼叫網址，通常寫在該服務官方文件的「Quickstart／API Reference」頁面，<b>不是</b>登入頁或金鑰申請頁的網址。切換上方服務提供者會自動帶入常見預設值。</p>
        </div>
        <div class="field">
          <label>模型名稱</label>
          <input type="text" id="ai-model" list="ai-model-list" value="${escapeHtml(aiConfig.model)}" placeholder="${escapeHtml(info.modelPlaceholder)}">
          <datalist id="ai-model-list">${(info.modelSuggestions || []).map((m) => `<option value="${escapeHtml(m)}">`).join("")}</datalist>
          <p class="field-hint">可從下拉建議選擇，或直接輸入該服務目前提供的模型代號；模型名稱會隨時間更新，請以該服務官方文件為準。</p>
        </div>
      </div>

      <div class="row row-2">
        <div class="field">
          <label>API 金鑰</label>
          <input type="password" id="ai-key" value="${escapeHtml(aiConfig.apiKey)}" placeholder="貼上你的 API 金鑰" autocomplete="off">
          <p class="field-hint">金鑰只會存在這個瀏覽器的 localStorage，直接送往你上面填寫的端點網址，不會經過本網站以外的任何伺服器。</p>
        </div>
        <div class="field">
          <label>創意程度（temperature）</label>
          <input type="number" id="ai-temp" min="0" max="2" step="0.1" value="${aiConfig.temperature}">
          <p class="field-hint">數值愈高，生成內容愈天馬行空、變化愈大；數值愈低，內容愈穩定保守。建議範圍 0～1.5，多數情境用 0.8～1 即可。</p>
        </div>
      </div>

      <div style="display:flex; gap:10px;">
        <button class="btn btn-seal" id="ai-save">儲存 AI 設定</button>
        <button class="btn btn-ghost" id="ai-test">測試連線</button>
      </div>

      <div class="key-warning">⚠️ 金鑰會以明碼存在瀏覽器的 localStorage 中，任何能使用這台電腦、這個瀏覽器設定檔的人都看得到。請只在自己信任的裝置上使用，不要把金鑰交給別人或貼到公開的地方。</div>

      <details class="help-accordion">
        <summary>操作說明與常見問題</summary>
        <div class="help-body">
          <dl>
            <dt>這裡的設定跟哪些作品有關？</dt>
            <dd>AI 設定是整個瀏覽器共用的，不屬於任一部作品；所有作品生成內容時都會用這裡設定的服務與金鑰。</dd>
            <dt>「連線失敗」大概是什麼原因？</dt>
            <dd>最常見兩種：① 瀏覽器被服務商擋掉跨網域呼叫（訊息常出現 CORS 或 Failed to fetch 字樣）——這時通常要換一家官方支援瀏覽器直連的服務；② 金鑰、端點或模型名稱打錯，或帳號額度不足——錯誤訊息通常會直接寫出 401／404／429 等狀態碼與原因。</dd>
            <dt>「AI 生成本節」跟「依建議微調本節」有什麼差別？</dt>
            <dd>「生成本節」是從無到有依大綱寫出這一節；「依建議微調本節」則是把這一節目前已有的內容連同你填的修改意見一起交給 AI，請它重寫成調整後的版本，會整段取代原本內容。</dd>
            <dt>「AI 審核」在做什麼？</dt>
            <dd>把所有已撰寫章節整合起來，連同你設定的世界觀、人物、時間線、風格與限制，一起請 AI 檢查前後是否連貫、有沒有違反你自己訂的規則，並給出評分與建議，不會自動修改任何內容。</dd>
            <dt>模型名稱要打什麼？</dt>
            <dd>每家服務的可用模型清單與確切名稱請以該服務官方文件或後台為準，這裡的建議清單僅供參考，可能會過期。</dd>
          </dl>
        </div>
      </details>
    `;

    $("#ai-provider").addEventListener("change", (e) => {
      aiConfig.provider = e.target.value;
      renderAiPanel();
    });
    $("#ai-save").addEventListener("click", () => {
      aiConfig.endpoint = $("#ai-endpoint").value.trim();
      aiConfig.model = $("#ai-model").value.trim();
      aiConfig.apiKey = $("#ai-key").value.trim();
      aiConfig.temperature = parseFloat($("#ai-temp").value) || 0.9;
      persistAiConfig();
      toast("已儲存 AI 設定");
    });
    $("#ai-test").addEventListener("click", async () => {
      aiConfig.endpoint = $("#ai-endpoint").value.trim();
      aiConfig.model = $("#ai-model").value.trim();
      aiConfig.apiKey = $("#ai-key").value.trim();
      aiConfig.temperature = parseFloat($("#ai-temp").value) || 0.9;
      const btn = $("#ai-test");
      btn.disabled = true; btn.textContent = "測試中…";
      try {
        const reply = await callAI({ system: "你是一個連線測試助手。", user: "請只回覆「連線成功」四個字。" });
        toast("連線成功：" + reply.slice(0, 30));
      } catch (err) {
        toast("連線失敗：" + err.message);
      } finally {
        btn.disabled = false; btn.textContent = "測試連線";
      }
    });
  }

  /* ---------------------------------------------------------------------
     面板：匯出／備份
     --------------------------------------------------------------------- */
  function renderExportPanel(p) {
    $("#panel-export").innerHTML = `
      <h2 class="section-title">匯出／備份</h2>
      <div class="export-grid">
        <div class="export-card">
          <h4>匯出整部小說（文字檔）</h4>
          <p>依章節順序，將所有已撰寫的內容合併匯出成單一 .txt 檔，方便閱讀或貼到其他編輯器。</p>
          <button class="btn btn-seal" data-act="export-novel-txt">下載 .txt</button>
        </div>
        <div class="export-card">
          <h4>匯出這部作品的完整備份</h4>
          <p>包含所有設定、人物、章節與內容的 JSON 檔（不含 AI 金鑰），可用於備份或匯入到其他瀏覽器。</p>
          <button class="btn btn-jade" data-act="export-project-json">下載 .json 備份</button>
        </div>
      </div>
      <p class="hint" style="margin-top:18px;">所有作品資料都只存在這個瀏覽器的本機儲存空間（localStorage）裡。清除瀏覽器資料、換裝置或換瀏覽器前，請記得先匯出備份。</p>
    `;
  }

  /* ---------------------------------------------------------------------
     動作處理（事件委派）
     --------------------------------------------------------------------- */
  function handleAction(act, ds, ev) {
    const p = activeProject();
    switch (act) {
      case "select-project":
        db.activeId = ds.id; persistDb(); state.tab = "settings"; render();
        if (window.innerWidth <= 900) closeShelf();
        break;
      case "duplicate-project": {
        const src = db.projects[ds.id];
        if (!src) return;
        const clone = JSON.parse(JSON.stringify(src));
        clone.id = uid(); clone.name = src.name + "（複本）"; clone.createdAt = Date.now(); clone.updatedAt = Date.now();
        reassignIds(clone);
        db.projects[clone.id] = clone; db.order.unshift(clone.id); db.activeId = clone.id;
        persistDb(); render(); toast("已複製作品");
        break;
      }
      case "delete-project":
        confirmModal("刪除作品", `確定要刪除「${db.projects[ds.id]?.name}」嗎？此動作無法復原，建議先匯出備份。`, "刪除").then((ok) => {
          if (!ok) return;
          delete db.projects[ds.id];
          db.order = db.order.filter((id) => id !== ds.id);
          if (db.activeId === ds.id) db.activeId = db.order[0] || null;
          persistDb(); render(); toast("已刪除作品");
        });
        break;

      case "toggle-tag": {
        const scope = ds.scope, key = ds.key, tag = ds.tag;
        if (scope === "settings") {
          p.settings[key] = toggleTag(p.settings[key], tag);
          touch(p); renderSettingsPanel(p);
        }
        break;
      }
      case "shuffle-tags": {
        const poolKey = `${p.id}:${ds.scope}:${ds.key}`;
        delete state.tagPools[poolKey];
        renderSettingsPanel(p);
        break;
      }

      case "add-timeline": {
        const nt = { id: uid(), time: "", event: "" };
        p.timeline.push(nt); state.openTimelineId = nt.id; touch(p); renderTimelinePanel(p); break;
      }
      case "delete-timeline":
        p.timeline = p.timeline.filter((t) => t.id !== ds.id);
        if (state.openTimelineId === ds.id) state.openTimelineId = null;
        touch(p); renderTimelinePanel(p); break;
      case "toggle-timeline":
        state.openTimelineId = state.openTimelineId === ds.id ? null : ds.id;
        renderTimelinePanel(p); break;
      case "move-timeline": {
        const dir = parseInt(ds.dir, 10);
        const i = p.timeline.findIndex((t) => t.id === ds.id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= p.timeline.length) break;
        [p.timeline[i], p.timeline[j]] = [p.timeline[j], p.timeline[i]];
        touch(p); renderTimelinePanel(p); break;
      }

      case "add-character":
        p.characters.push({ id: uid(), role: ds.role, name: "", identity: "", personality: "", background: "", relationships: "" });
        touch(p); renderCharactersPanel(p); break;
      case "delete-character":
        p.characters = p.characters.filter((c) => c.id !== ds.id); touch(p); renderCharactersPanel(p); break;

      case "add-glossary":
        p.glossary.push({ id: uid(), term: "", definition: "" }); touch(p); renderGlossaryPanel(p); break;
      case "delete-glossary":
        p.glossary = p.glossary.filter((g) => g.id !== ds.id); touch(p); renderGlossaryPanel(p); break;

      case "build-structure": {
        const chCount = parseInt($("#gen-chapter-count").value, 10) || 1;
        const secCount = parseInt($("#gen-section-count").value, 10) || 1;
        const secWords = parseInt($("#gen-section-words").value, 10) || 2000;
        const startNo = p.chapters.length;
        for (let i = 0; i < chCount; i++) {
          const chapter = { id: uid(), title: `第 ${startNo + i + 1} 章`, outline: "", sections: [] };
          for (let j = 0; j < secCount; j++) {
            chapter.sections.push({ id: uid(), title: "", outline: "", targetWords: secWords, content: "", status: "empty", feedback: "" });
          }
          p.chapters.push(chapter);
        }
        touch(p); renderStructurePanel(p); renderProjectHeader(p); toast(`已建立 ${chCount} 章、共 ${chCount * secCount} 節`);
        break;
      }
      case "add-chapter":
        p.chapters.push({ id: uid(), title: `第 ${p.chapters.length + 1} 章`, outline: "", sections: [] });
        touch(p); renderStructurePanel(p); renderProjectHeader(p); break;
      case "delete-chapter":
        confirmModal("刪除章節", "確定要刪除這一章及其所有小節內容嗎？此動作無法復原。", "刪除").then((ok) => {
          if (!ok) return;
          p.chapters = p.chapters.filter((c) => c.id !== ds.id);
          touch(p); renderStructurePanel(p); renderProjectHeader(p);
        });
        break;
      case "toggle-chapter":
        if (ev.target.closest("[data-act-stop]")) return;
        state.openChapters[ds.id] = !state.openChapters[ds.id]; renderStructurePanel(p); break;
      case "add-section": {
        const chapter = p.chapters.find((c) => c.id === ds.id);
        chapter.sections.push({ id: uid(), title: "", outline: "", targetWords: 2000, content: "", status: "empty", feedback: "" });
        touch(p); renderStructurePanel(p); renderProjectHeader(p); break;
      }
      case "delete-section":
        confirmModal("刪除小節", "確定要刪除這一小節及其內容嗎？此動作無法復原。", "刪除").then((ok) => {
          if (!ok) return;
          p.chapters.forEach((c) => { c.sections = c.sections.filter((s) => s.id !== ds.id); });
          touch(p); renderStructurePanel(p); renderProjectHeader(p);
        });
        break;
      case "toggle-section":
        if (ev.target.closest("[data-act-stop]")) return;
        state.openSections[ds.id] = !state.openSections[ds.id]; renderStructurePanel(p); break;
      case "clear-section": {
        const sec = findSection(p, ds.id);
        if (sec) { sec.content = ""; sec.status = "empty"; touch(p); renderStructurePanel(p); renderProjectHeader(p); }
        break;
      }
      case "generate-section":
        generateSection(p, ds.id, ev.target);
        break;
      case "revise-section":
        reviseSection(p, ds.id, ev.target);
        break;

      case "run-review":
        runReview(p, ev.target);
        break;
      case "apply-review-item": {
        const kind = ds.kind, idx = parseInt(ds.idx, 10);
        const arr = p.review && p.review.data && (kind === "issue" ? p.review.data.issues : p.review.data.suggestions);
        const text = arr && arr[idx];
        const sel = document.getElementById(ds.select);
        const sectionId = sel && sel.value;
        if (!text || !sectionId) { toast("找不到對應內容"); break; }
        applyReviewSuggestion(sectionId, text, ev.target);
        break;
      }

      case "set-ebook-opt": {
        p.ebookSettings = Object.assign(
          { fontSize: 18, lineHeight: 2.0, theme: "paper", direction: "horizontal", mode: "scroll", coverStyle: "jp" },
          p.ebookSettings, { [ds.key]: ds.value }
        );
        touch(p); renderEbookPanel(p);
        break;
      }

      case "export-novel-txt": exportNovelTxt(p); break;
      case "export-project-json": exportProjectJson(p); break;
      case "download-ebook": downloadEbook(p); break;
      case "generate-cover-art": generateCoverArt(p, ev.target); break;
      case "remove-cover-art": removeCoverArt(p); break;
    }
  }

  function findSection(p, sectionId) {
    for (const c of p.chapters) {
      const s = c.sections.find((x) => x.id === sectionId);
      if (s) return s;
    }
    return null;
  }
  function findChapterOfSection(p, sectionId) {
    return p.chapters.find((c) => c.sections.some((s) => s.id === sectionId)) || null;
  }

  function reassignIds(project) {
    project.characters.forEach((c) => (c.id = uid()));
    project.timeline.forEach((t) => (t.id = uid()));
    project.glossary.forEach((g) => (g.id = uid()));
    project.chapters.forEach((c) => {
      c.id = uid();
      c.sections.forEach((s) => (s.id = uid()));
    });
  }

  /* ---------------------------------------------------------------------
     資料綁定（輸入框變更寫回 state）
     --------------------------------------------------------------------- */
  function handleFieldChange(el) {
    const p = activeProject();
    if (!p) return;
    const { scope, id, key } = el.dataset;
    let value = el.type === "number" ? (el.value === "" ? 0 : Number(el.value)) : el.value;

    if (scope === "settings") { p.settings[key] = value; if (key === "targetWordCount") renderProjectHeader(p); }
    else if (scope === "characterPlan") { p.characterPlan[key] = value; renderCharactersPanel(p); }
    else if (scope === "world") { p.world = value; }
    else if (scope === "constraints") { p.constraints[key] = value; }
    else if (scope === "timeline") { const t = p.timeline.find((x) => x.id === id); if (t) t[key] = value; }
    else if (scope === "character") { const c = p.characters.find((x) => x.id === id); if (c) c[key] = value; if (key === "role") renderCharactersPanel(p); }
    else if (scope === "glossary") { const g = p.glossary.find((x) => x.id === id); if (g) g[key] = value; }
    else if (scope === "chapter") { const c = p.chapters.find((x) => x.id === id); if (c) c[key] = value; if (key === "title") renderProjectHeaderLite(); }
    else if (scope === "section") {
      const s = findSection(p, id);
      if (s) {
        s[key] = value;
        if (key === "content") {
          s.status = value.trim() ? (s.status === "done" ? "done" : "draft") : "empty";
          updateSectionWordCountUI(s);
          renderProjectHeader(p);
        }
      }
    }
    touch(p);
  }

  function renderProjectHeaderLite() {
    const p = activeProject();
    if (p) renderProjectHeader(p);
  }

  function updateSectionWordCountUI(s) {
    const row = document.querySelector(`.section-row[data-id="${s.id}"]`);
    if (!row) return;
    const wc = countWords(s.content);
    const wcEl = row.querySelector(".sec-wordcount");
    if (wcEl) wcEl.textContent = `${wc.toLocaleString()} 字`;
    const pill = row.querySelector(".status-pill");
    if (pill) {
      pill.className = `status-pill status-${s.status}`;
      pill.textContent = { empty: "未撰寫", draft: "草稿", done: "已完成" }[s.status] || "未撰寫";
    }
  }

  /* ---------------------------------------------------------------------
     AI 呼叫
     --------------------------------------------------------------------- */
  async function callAI({ system, user }) {
    if (!aiConfig.apiKey) throw new Error("尚未設定 API 金鑰，請先到「AI 設定」分頁填寫");
    const provider = aiConfig.provider;
    const endpoint = aiConfig.endpoint || PROVIDER_INFO[provider].endpoint;
    if (!endpoint) throw new Error("尚未設定 API 端點網址");
    const model = aiConfig.model || "";

    if (provider === "anthropic") {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": aiConfig.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-4-6",
          max_tokens: 4096,
          temperature: aiConfig.temperature,
          system,
          messages: [{ role: "user", content: user }]
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
      const textBlock = (data.content || []).find((b) => b.type === "text");
      return textBlock ? textBlock.text : "";
    }

    if (provider === "google") {
      const base = endpoint.replace(/\/+$/, "");
      const modelName = model || "gemini-2.5-flash";
      const url = base.includes(":generateContent")
        ? base
        : `${base}/${modelName}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": aiConfig.apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: aiConfig.temperature }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
      const cand = data.candidates && data.candidates[0];
      const parts = cand && cand.content && cand.content.parts;
      return parts ? parts.map((pt) => pt.text || "").join("") : "";
    }

    // OpenAI 相容格式（openai / custom）
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: model || "gpt-4.1",
        temperature: aiConfig.temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  }

  function buildSettingsContext(p) {
    const s = p.settings;
    const core = p.characters.filter((c) => c.role === "核心");
    const side = p.characters.filter((c) => c.role === "配角");
    const charBlock = (list) => list.map((c) =>
      `・${c.name || "（未命名）"}（${c.identity || "未標明身分"}）：個性－${c.personality || "未填寫"}；背景－${c.background || "未填寫"}；關係－${c.relationships || "未填寫"}`
    ).join("\n");

    const lines = [
      s.genre ? `【小說性質】${s.genre}` : "",
      s.tone ? `【基調】${s.tone}` : "",
      s.style ? `【寫作風格】${s.style}` : "",
      s.references ? `【文筆參考方向（僅參考風格特徵，勿抄襲情節或原文字句）】\n${s.references}` : "",
      s.pov ? `【敘事視角】${s.pov}${s.povCharacter ? "，主要視角人物：" + s.povCharacter : ""}` : "",
      p.world ? `【世界觀設定】\n${p.world}` : "",
      p.timeline.length ? `【時間線】\n${p.timeline.map((t) => `・${t.time}：${t.event}`).join("\n")}` : "",
      core.length ? `【核心人物】\n${charBlock(core)}` : "",
      side.length ? `【配角】\n${charBlock(side)}` : "",
      p.glossary.length ? `【特殊名詞，請保持用字前後一致】\n${p.glossary.map((g) => `・${g.term}：${g.definition}`).join("\n")}` : "",
      p.constraints.mustInclude ? `【必須遵守】${p.constraints.mustInclude}` : "",
      p.constraints.mustAvoid ? `【禁止出現】${p.constraints.mustAvoid}` : "",
      p.constraints.rating ? `【內容分級】${p.constraints.rating}` : "",
      p.constraints.other ? `【其他限制】${p.constraints.other}` : ""
    ].filter(Boolean);
    return lines.join("\n\n");
  }

  function buildSystemPrompt(p) {
    const instruction = "你是一位專業的小說寫手，請完全依照以下設定創作繁體中文小說內容，只輸出正文本身，不要輸出任何說明、前言、標題或註解。";
    const context = buildSettingsContext(p);
    return context ? `${instruction}\n\n${context}` : instruction;
  }

  function previousContext(p, chapter, section) {
    // 找出「上一節」的內容結尾，作為銜接依據
    const flat = [];
    p.chapters.forEach((c) => c.sections.forEach((s) => flat.push({ c, s })));
    const idx = flat.findIndex((x) => x.s.id === section.id);
    if (idx <= 0) return "";
    for (let i = idx - 1; i >= 0; i--) {
      const prevContent = flat[i].s.content;
      if (prevContent && prevContent.trim()) {
        const tail = prevContent.trim().slice(-400);
        return `【前情銜接（上一節結尾片段）】\n……${tail}`;
      }
    }
    return "";
  }

  async function performRevision(p, section, chapter, feedbackText, btnEl) {
    if (!feedbackText || !feedbackText.trim()) { toast("修改建議內容是空的"); return false; }
    const system = buildSystemPrompt(p) + "\n\n你現在的任務是依照使用者的修改建議，重寫並微調下面這一節內容，維持與前後文的連貫，並同樣只輸出這一節微調後的完整正文，不要輸出任何說明或前言。";
    const user = [
      `【目前所在章節】${chapter.title || "（未命名章節）"}`,
      `【這一節目前的完整內容】\n${section.content && section.content.trim() ? section.content : "（目前是空的，請依建議與大綱直接寫出完整內容）"}`,
      `【修改建議】\n${feedbackText}`,
      "請輸出微調後的完整本節內容（整節正文，不要只給片段或摘要）。"
    ].join("\n\n");
    const originalLabel = btnEl.textContent;
    btnEl.disabled = true; btnEl.textContent = "處理中…";
    try {
      const text = await callAI({ system, user });
      section.content = text.trim();
      section.status = "draft";
      touch(p);
      return true;
    } catch (err) {
      toast("失敗：" + err.message);
      return false;
    } finally {
      btnEl.disabled = false; btnEl.textContent = originalLabel;
    }
  }

  async function generateSection(p, sectionId, btnEl) {
    const section = findSection(p, sectionId);
    const chapter = findChapterOfSection(p, sectionId);
    if (!section || !chapter) return;

    const system = buildSystemPrompt(p);
    const context = previousContext(p, chapter, section);
    const userParts = [
      `【目前所在章節】${chapter.title || "（未命名章節）"}`,
      chapter.outline ? `【本章大綱】${chapter.outline}` : "",
      context,
      `【本節大綱】${section.outline || "（未提供，請依整體設定與前情自然發展）"}`,
      `【本節目標字數】約 ${section.targetWords || 2000} 字`,
      "請直接輸出這一節的小說正文。"
    ].filter(Boolean);
    const user = userParts.join("\n\n");

    const originalLabel = btnEl.textContent;
    btnEl.disabled = true; btnEl.textContent = "生成中…";
    try {
      const text = await callAI({ system, user });
      section.content = (section.content ? section.content.trim() + "\n\n" : "") + text.trim();
      section.status = "draft";
      touch(p);
      renderStructurePanel(p);
      renderProjectHeader(p);
      toast("已生成本節內容，記得檢查並視需要修改");
    } catch (err) {
      toast("生成失敗：" + err.message);
    } finally {
      btnEl.disabled = false; btnEl.textContent = originalLabel;
    }
  }

  async function reviseSection(p, sectionId, btnEl) {
    const section = findSection(p, sectionId);
    const chapter = findChapterOfSection(p, sectionId);
    if (!section || !chapter) return;
    if (!section.content || !section.content.trim()) { toast("這一節還沒有內容，請先生成或手動撰寫後再微調"); return; }
    if (!section.feedback || !section.feedback.trim()) { toast("請先在「給 AI 的修改建議」欄位填寫想調整的地方"); return; }
    const ok = await performRevision(p, section, chapter, section.feedback, btnEl);
    if (ok) {
      renderStructurePanel(p);
      renderProjectHeader(p);
      toast("已依建議微調本節內容，記得再檢查一次");
    }
  }

  function allSectionsWithLabel(p) {
    const list = [];
    p.chapters.forEach((c, ci) => c.sections.forEach((s, si) => {
      list.push({ id: s.id, label: `第${ci + 1}章-第${si + 1}節${s.title ? "：" + s.title : ""}` });
    }));
    return list;
  }

  async function applyReviewSuggestion(sectionId, text, btnEl) {
    const p = activeProject();
    if (!p) return;
    const section = findSection(p, sectionId);
    const chapter = findChapterOfSection(p, sectionId);
    if (!section || !chapter) { toast("找不到指定的小節"); return; }
    section.feedback = text;
    const ok = await performRevision(p, section, chapter, text, btnEl);
    if (ok) toast("已套用建議，可到「章節與生成」分頁查看調整後的內容");
  }

  /* ---------------------------------------------------------------------
     AI 審核：檢查連貫性與是否符合設定，給評級與建議
     --------------------------------------------------------------------- */
  function gatherManuscript(p) {
    let out = "";
    p.chapters.forEach((c, ci) => {
      const written = c.sections.filter((s) => s.content && s.content.trim());
      if (!written.length) return;
      out += `\n\n===== 第 ${ci + 1} 章　${c.title || ""} =====\n`;
      written.forEach((s, si) => { out += `\n【第 ${si + 1} 節】${s.title ? s.title + "\n" : ""}${s.content}\n`; });
    });
    return out.trim();
  }

  function stripJsonFence(text) {
    return text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  }

  async function runReview(p, btnEl) {
    const manuscript = gatherManuscript(p);
    if (!manuscript) { toast("目前還沒有任何已撰寫的章節內容可供審核"); return; }

    const system = [
      "你是一位經驗豐富的小說編輯與審稿人。你的任務不是創作，而是審核使用者提供的小說設定與已完成的內文草稿。",
      "請檢查兩件事：一、劇情前後的連貫性（角色設定、時間線、用語是否前後一致，有無矛盾或斷裂）；二、內文是否確實符合下方提供的寫作風格、人稱視角、世界觀、故事限制與特殊名詞設定。",
      "請只輸出一個 JSON 物件，不要輸出任何 JSON 以外的文字、不要使用 Markdown code fence，格式如下：",
      `{"overall_score": 1-10的整數, "consistency_score": 1-10的整數, "compliance_score": 1-10的整數, "summary": "一段整體評語", "chapter_notes": [{"chapter": "章節名稱", "note": "這一章的具體評語"}], "issues": ["發現的具體問題，盡量指出在哪一章哪一節"], "suggestions": ["具體可執行的修改建議"]}`
    ].join("\n");

    const settingsBlock = buildSettingsContext(p);
    const user = `【全書設定】\n${settingsBlock || "（使用者尚未填寫詳細設定）"}\n\n【目前已完成的內文】\n${manuscript}`;

    const originalLabel = btnEl.textContent;
    btnEl.disabled = true; btnEl.textContent = "審核中…";
    try {
      const raw = await callAI({ system, user });
      let parsed = null;
      try { parsed = JSON.parse(stripJsonFence(raw)); } catch (e) { parsed = null; }
      p.review = { updatedAt: Date.now(), data: parsed, raw: raw };
      touch(p);
      renderReviewPanel(p);
      toast(parsed ? "審核完成" : "審核完成，但回覆格式無法完整解析，已顯示原始內容");
    } catch (err) {
      toast("審核失敗：" + err.message);
    } finally {
      btnEl.disabled = false; btnEl.textContent = originalLabel;
    }
  }

  function scoreClass(n) {
    if (n >= 8) return "score-good";
    if (n >= 5) return "score-mid";
    return "score-bad";
  }

  function renderReviewItem(p, kind, idx, text) {
    const sections = allSectionsWithLabel(p);
    const selId = `apply-sel-${kind}-${idx}`;
    return `
      <div class="review-item">
        <div>${escapeHtml(text)}</div>
        ${sections.length ? `
          <div class="apply-row">
            <select id="${selId}">${sections.map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select>
            <button class="btn btn-jade btn-sm" data-act="apply-review-item" data-kind="${kind}" data-idx="${idx}" data-select="${selId}">✓ 認同，套用到此小節</button>
          </div>
        ` : ""}
      </div>`;
  }

  function renderReviewPanel(p) {
    const manuscriptExists = !!gatherManuscript(p);
    const r = p.review;
    let body = "";
    if (!r) {
      body = `<div class="review-empty">${manuscriptExists ? "尚未進行過審核，點上方按鈕讓 AI 檢查目前已完成的內容。" : "目前還沒有任何已撰寫的章節內容，先到「章節與生成」分頁生成或撰寫一些內容後，再回來審核。"}</div>`;
    } else if (r.data) {
      const d = r.data;
      body = `
        <div class="score-grid">
          <div class="score-card ${scoreClass(d.overall_score || 0)}"><div class="score-num">${d.overall_score ?? "－"}</div><div class="score-label">整體評分</div></div>
          <div class="score-card ${scoreClass(d.consistency_score || 0)}"><div class="score-num">${d.consistency_score ?? "－"}</div><div class="score-label">連貫性評分</div></div>
          <div class="score-card ${scoreClass(d.compliance_score || 0)}"><div class="score-num">${d.compliance_score ?? "－"}</div><div class="score-label">符合設定評分</div></div>
        </div>
        ${d.summary ? `<div class="review-summary">${escapeHtml(d.summary)}</div>` : ""}
        ${(d.chapter_notes || []).length ? `
          <div class="review-list-title">各章評語</div>
          ${d.chapter_notes.map((c) => `<div class="review-chapter-note"><b>${escapeHtml(c.chapter || "")}</b>${escapeHtml(c.note || "")}</div>`).join("")}
        ` : ""}
        ${(d.issues || []).length ? `<div class="review-list-title">發現的問題</div>${d.issues.map((text, idx) => renderReviewItem(p, "issue", idx, text)).join("")}` : ""}
        ${(d.suggestions || []).length ? `<div class="review-list-title">修改建議</div>${d.suggestions.map((text, idx) => renderReviewItem(p, "suggestion", idx, text)).join("")}` : ""}
      `;
    } else {
      body = `<div class="review-list-title">AI 回覆（原始內容，格式無法自動解析）</div><div class="review-raw">${escapeHtml(r.raw)}</div>`;
    }

    $("#panel-review").innerHTML = `
      <h2 class="section-title">AI 審核 <span>檢查劇情連貫性與是否符合前述設定，給予評級與建議</span></h2>
      <p class="panel-intro">AI 會讀取目前所有已撰寫的章節內容，比對角色設定、時間線、世界觀、寫作風格、人稱視角與故事限制，找出前後矛盾或偏離設定之處，並給出評分與具體建議。</p>
      <div class="review-toolbar">
        <button class="btn btn-seal" data-act="run-review">${r ? "🔍 重新審核" : "🔍 開始審核"}</button>
        ${r ? `<span class="review-timestamp">上次審核：${formatDate(r.updatedAt)}</span>` : ""}
      </div>
      ${body}
      <p class="review-disclaimer">＊ AI 審核僅供參考，判斷可能有誤或不完整，請以自己的創作判斷為準；審核不會自動修改任何內容，如需調整請至各小節使用「依建議微調本節」，或直接手動編輯。</p>
    `;
  }

  /* ---------------------------------------------------------------------
     電子書預覽：仿日系／台灣出版排版
     --------------------------------------------------------------------- */
  const EBOOK_THEMES = {
    paper: { bg: "#F5F0E6", fg: "#211E19", accent: "#A13D2B", sub: "#948C79" },
    sepia: { bg: "#EFE3CC", fg: "#3B2E1E", accent: "#8A5A2B", sub: "#9C8863" },
    night: { bg: "#1B1B1E", fg: "#E4E0D6", accent: "#D98C6A", sub: "#8A8578" }
  };

  function paragraphsHtml(content) {
    return content.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((s) => `<p>${escapeHtml(s)}</p>`).join("\n");
  }

  function seededRandom(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function hashStr(str) {
    let h = 0; for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
    return Math.abs(h) || 1;
  }
  function starsSvg(seed, count, color) {
    const rnd = seededRandom(hashStr(seed));
    let out = "";
    for (let i = 0; i < count; i++) {
      const x = (rnd() * 100).toFixed(1), y = (rnd() * 100).toFixed(1);
      const s = (rnd() * 1.3 + 0.5).toFixed(2);
      out += `<g transform="translate(${x},${y}) scale(${s})" opacity="${(rnd() * .5 + .5).toFixed(2)}"><path d="M0-3 L0.8-0.8 L3 0 L0.8 0.8 L0 3 L-0.8 0.8 L-3 0 L-0.8-0.8 Z" fill="${color}"/></g>`;
    }
    return `<svg class="cover-stars" viewBox="0 0 100 100" preserveAspectRatio="none">${out}</svg>`;
  }

  function generateEbookHtml(p, opts) {
    const theme = EBOOK_THEMES[opts.theme] || EBOOK_THEMES.paper;
    const vertical = opts.direction === "vertical";
    const paginate = opts.mode === "paginate";

    const chapterEntries = p.chapters.map((c, ci) => {
      const sections = c.sections.filter((s) => s.content && s.content.trim());
      if (!sections.length) return null;
      const secHtml = sections.map((s, si) => `
        ${si > 0 ? `<div class="scene-break">※</div>` : ""}
        ${s.title ? `<h3 class="sec-title">${escapeHtml(s.title)}</h3>` : ""}
        ${paragraphsHtml(s.content)}
      `).join("\n");
      return { title: `第 ${ci + 1} 章　${c.title || ""}`, html: `<h2>第 ${ci + 1} 章　${escapeHtml(c.title || "")}</h2>${secHtml}` };
    }).filter(Boolean);

    const chaptersHtml = chapterEntries.map((c) => `<section class="chapter">${c.html}</section>`).join("\n");

    const tocHtml = chapterEntries.map((c) => `<li>${escapeHtml(c.title)}</li>`).join("\n");

    const genre = escapeHtml(p.settings.genre || "");
    const tone = escapeHtml(p.settings.tone || "");
    const title = escapeHtml(p.name || "未命名作品");
    const tagsHtml = parseTags(p.settings.genre).concat(parseTags(p.settings.tone)).slice(0, 4)
      .map((t) => `<span class="cover-tag">${escapeHtml(t)}</span>`).join("");
    const coverImg = opts.coverImageData;

    const coverHtml = coverImg ? `
      <div class="cover cover-img" style="background-image:url('${coverImg}')">
        <div class="cover-img-scrim"></div>
        <div class="cover-img-tagrow">${tagsHtml}</div>
        <h1>${title}</h1>
        <div class="jp-sub">${genre}${genre && tone ? "　" : ""}${tone}</div>
      </div>
    ` : opts.coverStyle === "us" ? `
      <div class="cover cover-us">
        <div class="us-frame">
          <div class="us-rule"></div>
          <div class="us-genre">${genre}${genre && tone ? " · " : ""}${tone}</div>
          <h1>${title}</h1>
          <div class="us-rule"></div>
          <div class="us-byline">一部由作者親自構思、AI 協作完成的作品</div>
        </div>
      </div>
    ` : `
      <div class="cover cover-jp">
        ${starsSvg(title + "a", 26, "#ffffff")}
        <div class="jp-blob jp-blob-a"></div>
        <div class="jp-blob jp-blob-b"></div>
        <div class="jp-card">
          <div class="jp-tagrow">${tagsHtml}</div>
          <h1>${title}</h1>
          <div class="jp-sub">${genre}${genre && tone ? "　" : ""}${tone}</div>
        </div>
      </div>
    `;

    const writingModeCss = vertical ? `writing-mode: vertical-rl; text-orientation: mixed;` : ``;
    const bookLayoutCss = paginate
      ? `height: calc(100vh - 96px); column-width: 100%; column-gap: 0; overflow: hidden; margin-top:52px;`
      : (vertical ? `height: 96vh; column-width: 34em; column-gap: 3em; overflow-x: auto; overflow-y: hidden;` : `max-width: 34em; margin: 0 auto;`);

    const chromeHtml = paginate ? `
      <div class="pg-topbar">
        <span id="pg-percent">0%</span>
        <span id="pg-running"></span>
        <button id="pg-bookmark" aria-label="加入書籤">🔖</button>
      </div>
      <button id="pg-prev" class="edge-nav edge-nav-l" aria-label="上一頁">‹</button>
      <button id="pg-next" class="edge-nav edge-nav-r" aria-label="下一頁">›</button>
      <div class="pg-bottom"><span id="pg-indicator">本章第 1 頁／共 1 頁</span></div>
    ` : "";

    const chaptersJson = JSON.stringify(chapterEntries).replace(/</g, "\\u003c");
    const bookId = "bk_" + hashStr(title + p.id);

    const pagScript = paginate ? `
      <script>
      (function(){
        var CHAPTERS = ${chaptersJson};
        var book = document.querySelector('.book');
        var prevBtn = document.getElementById('pg-prev');
        var nextBtn = document.getElementById('pg-next');
        var indicator = document.getElementById('pg-indicator');
        var percentEl = document.getElementById('pg-percent');
        var runningEl = document.getElementById('pg-running');
        var bookmarkBtn = document.getElementById('pg-bookmark');
        var BM_KEY = 'novelforge-bookmark-${bookId}';

        var measure = document.createElement('div');
        measure.className = 'book';
        measure.style.cssText = 'position:fixed; visibility:hidden; left:-9999px; top:0; pointer-events:none;';
        document.body.appendChild(measure);

        var pageCounts = [];
        var totalPages = 0;
        function measureAll(){
          pageCounts = []; totalPages = 0;
          var rect = book.getBoundingClientRect();
          measure.style.width = rect.width + 'px';
          measure.style.height = rect.height + 'px';
          for (var i = 0; i < CHAPTERS.length; i++) {
            measure.innerHTML = CHAPTERS[i].html;
            var n = Math.max(1, Math.round(measure.scrollWidth / rect.width));
            pageCounts.push(n); totalPages += n;
          }
        }

        var chapterIdx = 0, pageIdx = 0;
        try {
          var saved = JSON.parse(localStorage.getItem(BM_KEY) || 'null');
          if (saved && typeof saved.c === 'number') { chapterIdx = saved.c; pageIdx = saved.p || 0; bookmarkBtn.classList.add('is-set'); }
        } catch(e){}

        function pagesBefore(ci){ var s=0; for(var i=0;i<ci;i++) s+=pageCounts[i]||1; return s; }

        function render(animate){
          if (!CHAPTERS.length) return;
          if (chapterIdx < 0) chapterIdx = 0;
          if (chapterIdx > CHAPTERS.length - 1) chapterIdx = CHAPTERS.length - 1;
          book.innerHTML = CHAPTERS[chapterIdx].html;
          var rect = book.getBoundingClientRect();
          var tp = pageCounts[chapterIdx] || 1;
          if (pageIdx < 0) pageIdx = 0;
          if (pageIdx > tp - 1) pageIdx = tp - 1;
          book.scrollLeft = pageIdx * rect.width;
          indicator.textContent = '本章第 ' + (pageIdx + 1) + ' 頁／共 ' + tp + ' 頁';
          runningEl.textContent = CHAPTERS[chapterIdx].title;
          var overall = totalPages ? Math.round((pagesBefore(chapterIdx) + pageIdx + 1) / totalPages * 100) : 0;
          percentEl.textContent = overall + '%';
          prevBtn.disabled = (chapterIdx === 0 && pageIdx === 0);
          nextBtn.disabled = (chapterIdx === CHAPTERS.length - 1 && pageIdx === tp - 1);
          if (animate !== false) { book.classList.remove('flip'); void book.offsetWidth; book.classList.add('flip'); }
        }

        function next(){
          var tp = pageCounts[chapterIdx] || 1;
          if (pageIdx < tp - 1) { pageIdx++; }
          else if (chapterIdx < CHAPTERS.length - 1) { chapterIdx++; pageIdx = 0; }
          else return;
          render();
        }
        function prev(){
          if (pageIdx > 0) { pageIdx--; }
          else if (chapterIdx > 0) { chapterIdx--; pageIdx = (pageCounts[chapterIdx] || 1) - 1; }
          else return;
          render();
        }
        nextBtn.addEventListener('click', next);
        prevBtn.addEventListener('click', prev);
        document.addEventListener('keydown', function(e){
          if (e.key === 'ArrowRight') next();
          if (e.key === 'ArrowLeft') prev();
        });
        var startX = null;
        book.addEventListener('touchstart', function(e){ startX = e.touches[0].clientX; });
        book.addEventListener('touchend', function(e){
          if (startX === null) return;
          var dx = e.changedTouches[0].clientX - startX;
          if (Math.abs(dx) > 40) { if (dx < 0) next(); else prev(); }
          startX = null;
        });
        bookmarkBtn.addEventListener('click', function(){
          try {
            if (bookmarkBtn.classList.contains('is-set')) {
              localStorage.removeItem(BM_KEY); bookmarkBtn.classList.remove('is-set');
            } else {
              localStorage.setItem(BM_KEY, JSON.stringify({ c: chapterIdx, p: pageIdx })); bookmarkBtn.classList.add('is-set');
            }
          } catch(e){}
        });
        window.addEventListener('resize', function(){ measureAll(); render(false); });
        setTimeout(function(){ measureAll(); render(false); }, 60);
      })();
      </script>
    ` : "";

    return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;700;900&family=Noto+Sans+TC:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  :root{ --bg:${theme.bg}; --fg:${theme.fg}; --accent:${theme.accent}; --sub:${theme.sub}; }
  *{ box-sizing:border-box; }
  html,body{ margin:0; height:100%; }
  body{ background:var(--bg); color:var(--fg); font-family:'Noto Serif TC', serif; position:relative; }
  .cover{ min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:8vh 8vw; position:relative; overflow:hidden; }
  .cover h1{ font-size:2.2em; font-weight:900; letter-spacing:.05em; margin: .3em 0; line-height:1.3; }
  .cover-us{ background:var(--bg); }
  .us-frame{ max-width:22em; z-index:1; }
  .us-rule{ width:100%; height:1px; background:var(--sub); margin:1.1em 0; opacity:.6; }
  .us-genre{ font-family:'Noto Sans TC',sans-serif; letter-spacing:.25em; font-size:.72em; color:var(--sub); }
  .us-byline{ font-family:'Noto Sans TC',sans-serif; font-size:.72em; color:var(--sub); margin-top:1.4em; }
  .cover-jp{ background: radial-gradient(ellipse at 30% 20%, ${theme.accent}dd 0%, #0c0c12 70%); color:#fff; }
  .cover-stars{ position:absolute; inset:0; width:100%; height:100%; }
  .jp-blob{ position:absolute; border-radius:50%; filter: blur(30px); opacity:.4; }
  .jp-blob-a{ width:40vw; height:40vw; background:${theme.accent}; top:-16vw; right:-10vw; }
  .jp-blob-b{ width:26vw; height:26vw; background:#fff; bottom:-8vw; left:-6vw; opacity:.15; }
  .jp-card{ z-index:1; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.25); border-radius:18px; padding:2.4em 1.6em; backdrop-filter: blur(3px); }
  .jp-tagrow{ margin-bottom:1.2em; display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
  .cover-tag{ font-family:'Noto Sans TC',sans-serif; font-size:.68em; background:rgba(255,255,255,.22); padding:.35em .9em; border-radius:20px; letter-spacing:.05em; }
  .cover-jp h1{ text-shadow: 0 3px 18px rgba(0,0,0,.45); }
  .jp-sub{ z-index:1; font-family:'Noto Sans TC',sans-serif; font-size:.8em; opacity:.9; margin-top:.6em; letter-spacing:.1em; }
  .cover-img{ background-size:cover; background-position:center; color:#fff; }
  .cover-img-scrim{ position:absolute; inset:0; background: linear-gradient(180deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.65) 100%); }
  .cover-img-tagrow{ z-index:1; margin-bottom:1.2em; display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
  .cover-img h1, .cover-img .jp-sub, .cover-img-tagrow{ position:relative; z-index:1; }
  .cover-img h1{ text-shadow: 0 3px 18px rgba(0,0,0,.6); }
  .toc{ max-width:34em; margin:0 auto; padding: 10vh 6vw; }
  .toc h2{ font-size:1.3em; border-bottom:1px solid var(--sub); padding-bottom:.5em; margin-bottom:1em; }
  .toc ul{ list-style:none; padding:0; line-height:2.4; }
  .book{ ${writingModeCss} ${bookLayoutCss} font-size:${opts.fontSize}px; line-height:${opts.lineHeight}; padding: 2vh 7vw; scrollbar-width:none; }
  .book::-webkit-scrollbar{ display:none; }
  .book.flip{ animation: pageflip .3s ease; }
  @keyframes pageflip{ from{ opacity:.35; transform: scale(.99) rotateY(2deg); } to{ opacity:1; transform:none; } }
  .chapter{ margin-bottom: 4em; break-inside: avoid-column; }
  .chapter h2{ font-size:1.35em; text-align:center; margin: 0 0 1.6em; letter-spacing:.08em; }
  .chapter h2::after{ content:""; display:block; width:36px; height:2px; background:var(--accent); margin: .6em auto 0; }
  .sec-title{ font-size:1.05em; color:var(--accent); margin: 1.6em 0 .8em; }
  .chapter p{ text-indent:2em; margin: 0 0 .9em; text-align:justify; word-break: break-word; }
  .scene-break{ text-align:center; color:var(--sub); margin: 2em 0; letter-spacing:.5em; }
  .pg-topbar{ position:fixed; top:0; left:0; right:0; height:52px; display:flex; align-items:center; justify-content:space-between; padding:0 18px; font-family:'Noto Sans TC',sans-serif; font-size:12px; color:var(--sub); z-index:6; }
  .pg-topbar #pg-running{ flex:1; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 10px; }
  .pg-topbar button{ border:none; background:none; font-size:16px; cursor:pointer; opacity:.55; }
  .pg-topbar button.is-set{ opacity:1; }
  .pg-bottom{ position:fixed; left:0; right:0; bottom:14px; text-align:center; font-family:'Noto Sans TC',sans-serif; font-size:11.5px; color:var(--sub); z-index:6; }
  .edge-nav{
    position:fixed; top:50%; transform:translateY(-50%); width:42px; height:42px; border-radius:50%;
    border:1px solid rgba(128,128,128,.3); background:rgba(128,128,128,.12); color:var(--fg);
    font-size:20px; line-height:1; cursor:pointer; z-index:6; backdrop-filter: blur(2px);
  }
  .edge-nav:disabled{ opacity:.2; cursor:default; }
  .edge-nav-l{ left:10px; } .edge-nav-r{ right:10px; }
</style></head>
<body>
  ${coverHtml}
  ${tocHtml ? `<div class="toc"><h2>目錄</h2><ul>${tocHtml}</ul></div>` : ""}
  <div class="book" data-mode="${opts.mode}">${paginate ? "" : (chaptersHtml || "<p style='text-align:center;color:var(--sub);'>目前還沒有已完成的章節內容。</p>")}</div>
  ${chromeHtml}
  ${pagScript}
</body></html>`;
  }

  function ebookOptsFromUI() {
    const p = activeProject();
    const fs = parseInt($("#ebook-fontsize").value, 10) || 18;
    const lh = parseFloat($("#ebook-lineheight").value) || 2.0;
    const theme = $("#ebook-theme").value;
    p.ebookSettings = Object.assign({}, p.ebookSettings, { fontSize: fs, lineHeight: lh, theme });
    touch(p);
    return p.ebookSettings;
  }

  function updateEbookPreview() {
    const p = activeProject();
    const iframe = $("#ebook-iframe");
    if (!p || !iframe) return;
    const opts = ebookOptsFromUI();
    iframe.srcdoc = generateEbookHtml(p, opts);
  }

  /* AI 封面插圖（僅 Google Gemini：generateContent 支援圖片輸出） */
  async function generateCoverArt(p, btnEl) {
    if (aiConfig.provider !== "google") { toast("目前僅支援 Google Gemini 生成封面插圖，請先到「AI 設定」切換服務提供者"); return; }
    if (!aiConfig.apiKey) { toast("請先在「AI 設定」填寫 API 金鑰"); return; }
    const imgModelInput = $("#ebook-cover-model");
    const model = (imgModelInput && imgModelInput.value.trim()) || "gemini-2.5-flash-image";
    const promptInput = $("#ebook-cover-prompt");
    const userPrompt = (promptInput && promptInput.value.trim()) ||
      `為小說《${p.name}》設計一張封面插畫。類型：${p.settings.genre || "無特別設定"}；基調：${p.settings.tone || "無特別設定"}；世界觀重點：${(p.world || "").slice(0, 200)}`;

    const originalLabel = btnEl.textContent;
    btnEl.disabled = true; btnEl.textContent = "生成中…";
    try {
      const base = "https://generativelanguage.googleapis.com/v1beta/models";
      const url = `${base}/${model}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": aiConfig.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt + "（直式書封構圖，避免任何文字或字母出現在圖片中）" }] }],
          generationConfig: { responseModalities: ["IMAGE"] }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
      const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || [];
      const imgPart = parts.find((pt) => pt.inlineData && pt.inlineData.data);
      if (!imgPart) throw new Error("回應中沒有圖片資料，可能是這個模型不支援圖片生成");
      const mime = imgPart.inlineData.mimeType || "image/png";
      p.ebookSettings = Object.assign({}, p.ebookSettings, {
        coverImageData: `data:${mime};base64,${imgPart.inlineData.data}`,
        coverImageModel: model
      });
      touch(p);
      renderEbookPanel(p);
      toast("封面插圖已生成");
    } catch (err) {
      toast("封面生成失敗：" + err.message);
    } finally {
      btnEl.disabled = false; btnEl.textContent = originalLabel;
    }
  }

  function removeCoverArt(p) {
    p.ebookSettings = Object.assign({}, p.ebookSettings, { coverImageData: null });
    touch(p);
    renderEbookPanel(p);
  }

  function renderEbookPanel(p) {
    const es = p.ebookSettings || { fontSize: 18, lineHeight: 2.0, theme: "paper", direction: "horizontal", mode: "scroll", coverStyle: "jp" };
    const hasContent = !!gatherManuscript(p);
    const seg = (key, options) => `<div class="seg">${options.map((o) => `<button type="button" class="${es[key] === o.value ? "is-active" : ""}" data-act="set-ebook-opt" data-key="${key}" data-value="${o.value}">${o.label}</button>`).join("")}</div>`;
    const isGoogle = aiConfig.provider === "google";
    $("#panel-ebook").innerHTML = `
      <h2 class="section-title">電子書預覽 <span>參考日系輕小說／歐美文學排版，翻頁模式支援真實分頁與換頁動畫</span></h2>
      <p class="panel-intro">「翻頁」模式會依章節計算頁數，左右兩側可點擊或滑動換頁，並顯示進度百分比與書籤功能；下載後打開也一樣可用。</p>
      <div class="ebook-toolbar">
        <div class="field">
          <label>字級</label>
          <input type="number" id="ebook-fontsize" min="14" max="28" value="${es.fontSize}">
        </div>
        <div class="field">
          <label>行距</label>
          <input type="number" id="ebook-lineheight" min="1.4" max="3" step="0.1" value="${es.lineHeight}">
        </div>
        <div class="field wide">
          <label>主題色</label>
          <select id="ebook-theme">
            <option value="paper" ${es.theme === "paper" ? "selected" : ""}>米白紙感（預設）</option>
            <option value="sepia" ${es.theme === "sepia" ? "selected" : ""}>復古護眼</option>
            <option value="night" ${es.theme === "night" ? "selected" : ""}>夜間閱讀</option>
          </select>
        </div>
        <div class="field">
          <label>排版方向</label>
          ${seg("direction", [{ value: "horizontal", label: "橫書" }, { value: "vertical", label: "直書" }])}
        </div>
        <div class="field">
          <label>閱讀方式</label>
          ${seg("mode", [{ value: "scroll", label: "滾動" }, { value: "paginate", label: "翻頁" }])}
        </div>
        <div class="field">
          <label>封面風格</label>
          ${seg("coverStyle", [{ value: "jp", label: "日系輕小說" }, { value: "us", label: "歐美文學" }])}
        </div>
        <button class="btn btn-jade" data-act="download-ebook">下載電子書 (.html)</button>
      </div>

      <div class="structure-toolbar" style="align-items:flex-start;">
        <div style="flex:1; min-width:240px;">
          <label style="display:block; font-size:12px; font-weight:700; color:var(--ink-soft); margin-bottom:6px;">AI 封面插圖（選用，全彩插畫）</label>
          ${isGoogle ? `
            <textarea id="ebook-cover-prompt" placeholder="留空則依類型／基調／世界觀自動組成提示詞；也可以自行描述想要的封面畫面、人物、構圖" style="width:100%; min-height:56px; margin-bottom:8px;"></textarea>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <input type="text" id="ebook-cover-model" value="${escapeHtml(es.coverImageModel || "gemini-2.5-flash-image")}" style="width:220px; padding:7px 10px; border:1px solid var(--border); border-radius:6px; font-size:12.5px;" placeholder="圖片模型名稱">
              <button class="btn btn-seal btn-sm" data-act="generate-cover-art">✦ 生成封面插圖</button>
              ${es.coverImageData ? `<button class="btn btn-ghost btn-sm" data-act="remove-cover-art">移除已生成的插圖</button>` : ""}
            </div>
            <p class="hint">會使用 Google Gemini 的圖片生成模型，消耗你自己帳號的額度；模型名稱如過期請至該服務文件確認最新可用名稱。</p>
          ` : `<p class="hint">目前僅支援 Google Gemini 生成封面插畫（同一組金鑰同時可用於文字與圖片）。請先到「AI 設定」把服務提供者切換為 Google，即可在此輸入描述、生成全彩封面插圖；沒有設定時會使用下方自動設計的排版封面。</p>`}
        </div>
      </div>

      ${hasContent ? `
        <div class="ebook-stage">
          <div class="ebook-frame-wrap"><iframe id="ebook-iframe"></iframe></div>
        </div>
      ` : `<div class="ebook-empty">目前還沒有已完成的章節內容，先到「章節與生成」分頁生成或撰寫內容後，這裡會自動排成電子書畫面。</div>`}
    `;
    if (hasContent) {
      updateEbookPreview();
      ["ebook-fontsize", "ebook-lineheight", "ebook-theme"].forEach((id) => {
        $("#" + id).addEventListener("input", updateEbookPreview);
        $("#" + id).addEventListener("change", updateEbookPreview);
      });
    }
  }

  function downloadEbook(p) {
    if (!gatherManuscript(p)) { toast("目前還沒有已完成的章節內容可以匯出"); return; }
    const opts = p.ebookSettings || { fontSize: 18, lineHeight: 2.0, theme: "paper", direction: "horizontal", mode: "scroll", coverStyle: "jp" };
    const html = generateEbookHtml(p, opts);
    downloadFile(`${p.name || "novel"}-ebook.html`, html, "text/html;charset=utf-8");
    toast("已下載電子書 HTML 檔");
  }

  /* ---------------------------------------------------------------------
     匯出
     --------------------------------------------------------------------- */
  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exportNovelTxt(p) {
    let out = `${p.name}\n\n`;
    p.chapters.forEach((c, ci) => {
      out += `第 ${ci + 1} 章　${c.title || ""}\n\n`;
      c.sections.forEach((s, si) => {
        if (s.title) out += `　${s.title}\n\n`;
        out += (s.content || "（尚未撰寫）") + "\n\n";
      });
    });
    downloadFile(`${p.name || "novel"}.txt`, out, "text/plain;charset=utf-8");
    toast("已下載文字檔");
  }

  function exportProjectJson(p) {
    downloadFile(`${p.name || "project"}.json`, JSON.stringify(p, null, 2), "application/json;charset=utf-8");
    toast("已下載備份檔");
  }

  function importProjectJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || !obj.settings || !Array.isArray(obj.chapters)) throw new Error("格式不正確");
        obj.id = uid();
        obj.name = (obj.name || "匯入的作品") + "";
        obj.updatedAt = Date.now();
        reassignIds(obj);
        db.projects[obj.id] = obj;
        db.order.unshift(obj.id);
        db.activeId = obj.id;
        persistDb();
        render();
        toast("已匯入作品");
      } catch (e) {
        toast("匯入失敗：檔案格式不正確");
      }
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------------------
     事件綁定
     --------------------------------------------------------------------- */
  function bindGlobalEvents() {
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-act]");
      if (!el) return;
      handleAction(el.dataset.act, el.dataset, e);
    });

    document.addEventListener("change", (e) => {
      if (e.target.matches("[data-scope]")) handleFieldChange(e.target);
    });
    document.addEventListener("input", (e) => {
      if (e.target.matches("textarea[data-scope], input[type=text][data-scope]")) handleFieldChange(e.target);
    });

    $("#btn-new-project").addEventListener("click", () => { newProject("未命名作品"); state.tab = "settings"; render(); closeShelf(); });
    $("#btn-new-project-empty").addEventListener("click", () => { newProject("未命名作品"); state.tab = "settings"; render(); closeShelf(); });

    $("#project-name").addEventListener("input", (e) => {
      const p = activeProject();
      if (!p) return;
      p.name = e.target.value;
      touch(p);
      renderShelf();
    });

    $("#project-search").addEventListener("input", renderShelf);

    $("#tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      state.tab = btn.dataset.tab;
      render();
    });

    $("#btn-hamburger").addEventListener("click", toggleShelf);
    $("#shelf-backdrop").addEventListener("click", closeShelf);

    $("#btn-import-project").addEventListener("click", () => $("#import-file-input").click());
    $("#import-file-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) importProjectJson(file);
      e.target.value = "";
    });
  }

  /* ---------------------------------------------------------------------
     啟動
     --------------------------------------------------------------------- */
  function init() {
    loadDb();
    loadAiConfig();
    if (!db.activeId && db.order.length) db.activeId = db.order[0];
    bindGlobalEvents();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
