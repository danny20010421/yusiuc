/* ==========================================================================
   稿間 (Gǎo Jiān) — AI 小說創作工坊
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
      note: "Anthropic 官方支援瀏覽器端直接呼叫（CORS），是本工具最推薦、最穩定的選項。API 金鑰只會存在你的瀏覽器裡，直接送往 Anthropic 官方網址。"
    },
    google: {
      label: "Google（Gemini）",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
      modelPlaceholder: "例如：gemini-2.5-flash / gemini-2.5-pro",
      note: "Google 的 Gemini API（generateContent）本身就允許瀏覽器跨網域直接呼叫，不需要額外標頭，同樣是穩定可用的選擇。金鑰可到 aistudio.google.com/app/apikey 申請，通常有免費額度可先試用。"
    },
    openai: {
      label: "OpenAI 相容 API",
      endpoint: "https://api.openai.com/v1/chat/completions",
      modelPlaceholder: "例如：gpt-4.1 / gpt-4o",
      note: "OpenAI 官方 API 通常會擋掉瀏覽器直接呼叫（CORS 限制），純靜態網站可能無法直連。建議改用支援瀏覽器呼叫的相容服務（例如 OpenRouter），或自行架設一個轉發用的伺服器端 Proxy。"
    },
    custom: {
      label: "自訂 OpenAI 相容端點",
      endpoint: "",
      modelPlaceholder: "依服務提供的模型名稱填寫",
      note: "適用於 OpenRouter、Ollama（本機）、DeepSeek、月之暗面等任何相容 OpenAI Chat Completions 格式、且允許瀏覽器跨網域呼叫的服務。請填入完整的 chat/completions 端點網址。"
    }
  };

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
      chapters: []
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
  let state = { tab: "settings", openChapters: {}, openSections: {} };

  function render() {
    renderShelf();
    const p = activeProject();
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
      structure: renderStructurePanel, ai: renderAiPanel, export: renderExportPanel
    };
    const fn = renderers[state.tab];
    if (fn) fn(p);
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
        </div>
        <div class="field">
          <label>基調</label>
          <input type="text" data-scope="settings" data-key="tone" value="${escapeHtml(s.tone)}" placeholder="例如：輕鬆詼諧、黑暗壓抑、溫暖治癒">
        </div>
      </div>

      <div class="field">
        <label>寫作風格</label>
        <textarea data-scope="settings" data-key="style" placeholder="描述文字節奏、句式長短、用詞偏好、對白比例、節奏快慢等。例如：短句為主、多用感官細節、對白精簡有潛台詞。">${escapeHtml(s.style)}</textarea>
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
    const rows = p.timeline.map((t) => `
      <div class="item-card" data-id="${t.id}">
        <div class="row row-2">
          <div class="field" style="margin-bottom:0;">
            <label>時間點</label>
            <input type="text" data-scope="timeline" data-id="${t.id}" data-key="time" value="${escapeHtml(t.time)}" placeholder="例如：故事開始前十年 / 第三章當下">
          </div>
          <div class="field" style="margin-bottom:0; display:flex; align-items:flex-end; justify-content:flex-end;">
            <button class="icon-btn" data-act="delete-timeline" data-id="${t.id}">刪除此事件</button>
          </div>
        </div>
        <div class="field" style="margin-top:12px; margin-bottom:0;">
          <label>事件內容</label>
          <textarea data-scope="timeline" data-id="${t.id}" data-key="event" placeholder="發生了什麼事、影響是什麼">${escapeHtml(t.event)}</textarea>
        </div>
      </div>
    `).join("");

    $("#panel-timeline").innerHTML = `
      <h2 class="section-title">時間線 <span>依故事內時序排列，供 AI 掌握事件先後與因果</span></h2>
      ${p.timeline.length ? rows : `<div class="list-empty">尚未新增任何時間線事件。</div>`}
      <button class="btn btn-jade add-row" data-act="add-timeline">＋ 新增事件</button>
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

      <div class="row row-2">
        <div class="field">
          <label>API 端點網址</label>
          <input type="text" id="ai-endpoint" value="${escapeHtml(aiConfig.endpoint || info.endpoint)}" placeholder="${escapeHtml(info.endpoint)}">
        </div>
        <div class="field">
          <label>模型名稱</label>
          <input type="text" id="ai-model" value="${escapeHtml(aiConfig.model)}" placeholder="${escapeHtml(info.modelPlaceholder)}">
        </div>
      </div>

      <div class="row row-2">
        <div class="field">
          <label>API 金鑰</label>
          <input type="password" id="ai-key" value="${escapeHtml(aiConfig.apiKey)}" placeholder="貼上你的 API 金鑰" autocomplete="off">
        </div>
        <div class="field">
          <label>創意程度（temperature）</label>
          <input type="number" id="ai-temp" min="0" max="2" step="0.1" value="${aiConfig.temperature}">
        </div>
      </div>

      <div style="display:flex; gap:10px;">
        <button class="btn btn-seal" id="ai-save">儲存 AI 設定</button>
        <button class="btn btn-ghost" id="ai-test">測試連線</button>
      </div>

      <div class="key-warning">⚠️ 金鑰會以明碼存在瀏覽器的 localStorage 中，任何能使用這台電腦、這個瀏覽器設定檔的人都看得到。請只在自己信任的裝置上使用，不要把金鑰交給別人或貼到公開的地方。</div>
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

      case "add-timeline":
        p.timeline.push({ id: uid(), time: "", event: "" }); touch(p); renderTimelinePanel(p); break;
      case "delete-timeline":
        p.timeline = p.timeline.filter((t) => t.id !== ds.id); touch(p); renderTimelinePanel(p); break;

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
            chapter.sections.push({ id: uid(), title: "", outline: "", targetWords: secWords, content: "", status: "empty" });
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
        chapter.sections.push({ id: uid(), title: "", outline: "", targetWords: 2000, content: "", status: "empty" });
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

      case "export-novel-txt": exportNovelTxt(p); break;
      case "export-project-json": exportProjectJson(p); break;
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

  function buildSystemPrompt(p) {
    const s = p.settings;
    const core = p.characters.filter((c) => c.role === "核心");
    const side = p.characters.filter((c) => c.role === "配角");
    const charBlock = (list) => list.map((c) =>
      `・${c.name || "（未命名）"}（${c.identity || "未標明身分"}）：個性－${c.personality || "未填寫"}；背景－${c.background || "未填寫"}；關係－${c.relationships || "未填寫"}`
    ).join("\n");

    const lines = [
      "你是一位專業的小說寫手，請完全依照以下設定創作繁體中文小說內容，只輸出正文本身，不要輸出任何說明、前言、標題或註解。",
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

    $("#btn-new-project").addEventListener("click", () => { newProject("未命名作品"); state.tab = "settings"; render(); });
    $("#btn-new-project-empty").addEventListener("click", () => { newProject("未命名作品"); state.tab = "settings"; render(); });

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
