/* 主逻辑：导航、学段联动、PDF 导入、手动录入、错题集、组卷打印、学情分析、数据管理、引导 */
(function () {
  const CJT = window.CJT;
  const T = CJT.TEXTS;
  const { GRADES, TERMS, SUBJECTS, MASTERY, STAGES, K12_STAGES, QTYPE_VOCAB, CLASSIFY_SEEDS, hasTerm, stageOfGrade } = CJT.CONST;
  const { GRADE_SUBJECTS, STAGE_SUBJECTS, UNI_YEARS, UNI_MAJORS, UNI_COURSES } = CJT;
  const store = CJT.store;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function fillSelect(sel, options, placeholder) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) return;
    const current = el.value;
    let html = placeholder != null ? `<option value="">${esc(placeholder)}</option>` : '';
    html += options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    el.innerHTML = html;
    if (options.includes(current)) el.value = current;
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function setStatus(el, msg, type) {
    el.textContent = msg;
    el.className = 'status' + (type ? ' ' + type : '');
  }

  /* ---------- UI 偏好（服务端持久化，解决动态端口导致 localStorage 失效） ---------- */
  const Prefs = {
    data: {},
    async load() {
      try {
        const r = await fetch('/api/ui_prefs');
        this.data = r.ok ? await r.json() : {};
      } catch (e) { this.data = {}; }
      if (typeof this.data !== 'object' || this.data === null) this.data = {};
    },
    get(k, d) { return (k in this.data) ? this.data[k] : d; },
    set(k, v) {
      this.data[k] = v;
      fetch('/api/ui_prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [k]: v })
      }).catch(() => {});
    }
  };

  /* ---------- 学段状态 ---------- */
  // 首次启动（服务端无记录）时不预选学段，引导用户主动选择
  let curStage = '';

  function gradesForStage(stage) {
    if (stage === '小学') return GRADES.slice(0, 6);
    if (stage === '初中') return GRADES.slice(6, 9);
    if (stage === '高中') return GRADES.slice(9, 12);
    return GRADES;
  }

  function saveStage() {
    Prefs.set('stage', curStage);
  }

  // 学段未选时锁定录入区（步骤条第 1 步门禁，参考常见 App 的引导逻辑）
  function updateImportLock() {
    const locked = !STAGES.includes(curStage);
    $$('.card[data-step-gate]').forEach(c => c.classList.toggle('locked', locked));
    $('#stageHint').textContent = locked
      ? '👆 第一步：先点上面的学段，再开始录入'
      : '';
  }

  function qtypeOptions(stage, current) {
    const vocab = QTYPE_VOCAB[stage] || QTYPE_VOCAB['其他'];
    const opts = vocab.slice();
    if (current && !opts.includes(current)) opts.push(current);
    return opts;
  }

  /* ---------- 分类一/二控件（三分支：K12 / 大学 / 自由输入） ----------
     K12：分类一=年级，分类二=科目（按年级联动），term=学期
     大学：分类一=专业门类，分类二=课程（按门类联动），term=学年（大一~大四）
     职考/其他：自由输入 + 种子/历史建议 */
  function renderClassifyUI(prefix) {
    const isK12 = K12_STAGES.includes(curStage);
    const isUni = curStage === '大学';
    const selGrade = $('#' + prefix + 'Grade');
    const inpGrade = $('#' + prefix + 'GradeInput');
    const selTerm = $('#' + prefix + 'Term');
    const lblTerm = $('#lbl' + (prefix === 'imp' ? 'Imp' : 'M') + 'Term');
    const selSubject = $('#' + prefix + 'Subject');
    const inpSubject = $('#' + prefix + 'SubjectInput');
    const uniHist = store.all().filter(q => q.stage === '大学');

    if (isK12) {
      selGrade.hidden = false; inpGrade.hidden = true;
      selSubject.hidden = false; inpSubject.hidden = true;
      lblTerm.style.display = '';
      fillSelect(selGrade, gradesForStage(curStage), null);
      fillSelect(selTerm, TERMS, null);
      const g = selGrade.value;
      const subjects = g && GRADE_SUBJECTS[g] ? GRADE_SUBJECTS[g] : (STAGE_SUBJECTS[curStage] || SUBJECTS);
      fillSelect(selSubject, subjects, null);
    } else if (isUni) {
      selGrade.hidden = false; inpGrade.hidden = true;
      selSubject.hidden = false; inpSubject.hidden = true;
      lblTerm.style.display = '';
      fillSelect(selGrade, UNI_MAJORS, null);
      fillSelect(selTerm, UNI_YEARS, null); // term 列复用为学年
      // 课程按所选门类联动：内置课程 + 该门类历史输入
      const m = selGrade.value || '公共基础';
      const hist = [...new Set(uniHist.filter(q => q.grade === m).map(q => q.subject).filter(Boolean))];
      fillSelect(selSubject, [...new Set((UNI_COURSES[m] || []).concat(hist))], null);
    } else {
      selGrade.hidden = true; inpGrade.hidden = false;
      selSubject.hidden = true; inpSubject.hidden = true;
      lblTerm.style.display = 'none';
      // 建议：种子 + 该学段已录题目的输入历史（去重）
      const pool = store.all().filter(q => q.stage === curStage);
      const seedGrades = (CLASSIFY_SEEDS[curStage] || []).map(x => x.grade);
      const gradeSet = [...new Set(seedGrades.concat(pool.map(q => q.grade).filter(Boolean)))];
      const dlGrade = $('#dl' + (prefix === 'imp' ? 'Grade' : 'Grade2'));
      dlGrade.innerHTML = gradeSet.map(g => `<option value="${esc(g)}">`).join('');
      const curGrade = inpGrade.value;
      const seedSubs = (CLASSIFY_SEEDS[curStage] || []).filter(x => !curGrade || x.grade === curGrade).map(x => x.subject).filter(Boolean);
      const subSet = [...new Set(seedSubs.concat(pool.filter(q => !curGrade || q.grade === curGrade).map(q => q.subject).filter(Boolean)))];
      const dlSubject = $('#dl' + (prefix === 'imp' ? 'Subject' : 'Subject2'));
      dlSubject.innerHTML = subSet.map(s => `<option value="${esc(s)}">`).join('');
    }
    // 标签随学段变化（统一 .field-label 结构）
    const gradeLabel = isK12 ? T.labelGradeK12 : isUni ? T.labelGradeUni : curStage === '职业考试' ? T.labelGradeVoc : '分类一';
    const subjectLabel = isK12 ? T.labelSubjectK12 : isUni ? T.labelSubjectUni : T.labelSubjectVoc;
    (prefix === 'imp' ? $('#impGradeLabel') : $('#mGradeLabel')).textContent = gradeLabel;
    (prefix === 'imp' ? $('#impSubjectLabel') : $('#mSubjectLabel')).textContent = subjectLabel;
    // 第三列标签：K12=学期，大学=学年，其余隐藏
    const termLabel = prefix === 'imp' ? $('#impTermLabel') : $('#mTermLabel');
    if (termLabel) termLabel.textContent = isK12 ? '学期' : isUni ? '学年' : '';
  }

  // 读取当前分类值
  function classifyValue(prefix) {
    const isK12 = K12_STAGES.includes(curStage);
    const isUni = curStage === '大学';
    const useSelect = isK12 || isUni;
    return {
      stage: curStage,
      grade: useSelect ? $('#' + prefix + 'Grade').value : $('#' + prefix + 'GradeInput').value.trim(),
      term: useSelect ? $('#' + prefix + 'Term').value : '',
      subject: useSelect ? $('#' + prefix + 'Subject').value : $('#' + prefix + 'SubjectInput').value.trim()
    };
  }

  /* ================= AI 通用封装 ================= */
  let aiLoading = 0;

  /** 统一 AI 请求封装：loading 态 + 口语化错误提示 */
  async function callAI(path, body, opts) {
    opts = opts || {};
    const loadingEl = $('#loading');
    aiLoading++;
    $('#loadingText').textContent = (opts && opts.loadingText) || 'AI 处理中…';
    loadingEl.hidden = false;
    try {
      let resp;
      try {
        resp = await fetch('/api' + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {})
        });
      } catch (e) {
        toast(T.errUnreachable);
        return null;
      }
      if (!resp.ok) {
        let info = {};
        try { info = (await resp.json()).detail || {}; } catch (e) { /* 保留默认 */ }
        const type = info.type || 'unknown';
        if (type === 'config_error') toast(T.errNoKey);
        else if (type === 'auth_error') toast(T.errAuth);
        else if (type === 'network_error') toast(T.errNetwork);
        else if (type === 'output_error') toast(T.errOutput);
        else toast(info.message || '出错了，请重试');
        return null;
      }
      return await resp.json();
    } finally {
      aiLoading--;
      if (aiLoading <= 0) {
        aiLoading = 0;
        loadingEl.hidden = true;
      }
    }
  }

  async function fetchJSON(path) {
    try {
      const resp = await fetch(path);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      return null;
    }
  }

  async function postJSON(path, payload) {
    try {
      const resp = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null;
    }
  }

  /* ---------- 弹层 ---------- */
  function openModal(title, footHTML) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = '';
    $('#modalFoot').innerHTML = footHTML || '';
    $('#modalOverlay').hidden = false;
  }
  function closeModal() {
    $('#modalOverlay').hidden = true;
  }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', e => {
    if (e.target === $('#modalOverlay')) closeModal();
  });

  /* ---------- AI 设置面板 ---------- */
  async function openAiSettings() {
    openModal('AI 设置');
    const body = $('#modalBody');
    body.innerHTML = '<p class="hint">正在加载配置…</p>';
    const [provData, st] = [await fetchJSON('/api/providers'), await fetchJSON('/api/settings')];
    if (!provData || !st) {
      body.innerHTML = '<p class="status err">' + esc(T.errUnreachable) + '</p>';
      return;
    }
    const providers = provData.providers;
    // 首次配置教程：从未配置过 Key（或当前无 Key）时默认展开
    const tutorial = `
      <details class="ai-tutorial" ${st.has_key ? '' : 'open'}>
        <summary>${esc(T.aiTutorialTitle)}</summary>
        <p class="hint">${esc(T.aiTutorialWhat)}</p>
        <ol class="tutorial-steps">
          ${T.aiTutorialSteps.map(s => `<li>${esc(s)}</li>`).join('')}
        </ol>
        <div class="tutorial-links">
          ${Object.values(T.aiTutorialLinks).map(l =>
            `<a class="btn small" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}官网 ↗</a>`).join('')}
        </div>
        <p class="hint">${esc(T.aiTutorialCoding)}</p>
        <p class="hint">${esc(T.aiTutorialMock)}</p>
      </details>`;
    body.innerHTML = `
      <div class="ai-set-form">
        ${tutorial}
        <label class="field">
          <span class="field-label">AI 服务商
            <span class="hint-tip" data-tip-key="tipAiKey">?</span>
          </span>
          <select id="aiProvider">
            ${providers.map(p => `<option value="${esc(p.id)}" ${st.provider === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </label>
        <div class="ai-set-row">
          <label class="field">
            <span class="field-label">接口地址（一般不用改）</span>
            <input type="text" id="aiBaseUrl" placeholder="OpenAI 兼容接口地址">
          </label>
          <label class="field">
            <span class="field-label">模型</span>
            <input type="text" id="aiModel" list="aiModelList" placeholder="模型名">
            <datalist id="aiModelList"></datalist>
          </label>
        </div>
        <label class="field">
          <span class="field-label">AI 服务密钥（${st.has_key ? '已保存 ' + esc(st.api_key_masked) : '还没填'}）</span>
          <input type="password" id="aiKey" placeholder="${st.has_key ? '留空则保持不变' : '从 AI 厂商官网复制'}">
        </label>
        <div class="ai-set-row">
          <button class="btn primary" id="aiSave" type="button">保存设置</button>
          <button class="btn" id="aiTest" type="button">测试连接</button>
          <span class="hint" style="margin:0">选「Mock（离线体验）」无需密钥，可先体验全部功能。</span>
        </div>
        <div id="aiTestResult"></div>
      </div>
    `;

    const providerSel = $('#aiProvider');
    const baseUrlInput = $('#aiBaseUrl');
    const modelInput = $('#aiModel');
    const modelList = $('#aiModelList');

    function applyProviderDefaults(keepUserInput) {
      const p = providers.find(x => x.id === providerSel.value);
      if (!p) return;
      if (!keepUserInput || !baseUrlInput.value) baseUrlInput.value = p.base_url || st.base_url || '';
      if (!keepUserInput || !modelInput.value) modelInput.value = (p.models && p.models[0]) || st.model || '';
      modelList.innerHTML = (p.models || []).map(m => `<option value="${esc(m)}">`).join('');
      baseUrlInput.disabled = p.id !== 'custom';
    }
    baseUrlInput.value = st.base_url || '';
    modelInput.value = st.model || '';
    applyProviderDefaults(true);
    providerSel.addEventListener('change', () => applyProviderDefaults(false));

    $('#aiSave').addEventListener('click', async () => {
      const payload = {
        provider: providerSel.value,
        base_url: baseUrlInput.value.trim(),
        model: modelInput.value.trim(),
        api_key: $('#aiKey').value
      };
      const saved = await postJSON('/api/settings', payload);
      if (!saved) { toast('保存失败，请重试'); return; }
      toast('设置已保存');
      openAiSettings();
    });

    $('#aiTest').addEventListener('click', async () => {
      const box = $('#aiTestResult');
      box.innerHTML = '<p class="hint">正在测试…</p>';
      const res = await callAI('/ai/test', {});
      if (res && res.ok) {
        box.innerHTML = `<p class="ai-test-result ok">连接成功：${esc(res.reply || '')}</p>`;
      } else {
        box.innerHTML = '<p class="ai-test-result err">连接失败，请检查密钥或换个服务商。</p>';
      }
    });
  }

  /* ================= 导航 / 主题 / 数据菜单 ================= */
  function switchView(name) {
    $$('.side-item[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'bank') renderBank();
    if (name === 'analysis') renderAnalysis();
    if (name === 'review') renderReview();
  }
  $('#sideNav').addEventListener('click', e => {
    const btn = e.target.closest('.side-item');
    if (btn) switchView(btn.dataset.view);
  });
  $('#btnAiSettings').addEventListener('click', openAiSettings);

  // 侧栏折叠（偏好存服务端）
  function setCollapsed(c) {
    $('#sidebar').classList.toggle('collapsed', c);
    Prefs.set('collapsed', c ? '1' : '');
  }
  $('#btnCollapse').addEventListener('click', () => {
    setCollapsed(!$('#sidebar').classList.contains('collapsed'));
  });

  // 主题（浅色/深色；偏好存服务端，三态：跟随系统/浅色/深色）
  const themeMq = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const mode = Prefs.get('theme', 'auto'); // auto | light | dark
    const dark = mode === 'dark' || (mode === 'auto' && themeMq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : '';
    const btn = $('#btnTheme');
    if (btn) btn.textContent = { auto: '🌓 外观·自动', light: '☀️ 外观·浅色', dark: '🌙 外观·深色' }[mode];
  }
  $('#btnTheme').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    const cur = Prefs.get('theme', 'auto');
    Prefs.set('theme', order[(order.indexOf(cur) + 1) % order.length]);
    applyTheme();
  });
  themeMq.addEventListener('change', applyTheme);

  // 数据菜单
  $('#btnDataMenu').addEventListener('click', e => {
    e.stopPropagation();
    $('#dataMenu').hidden = !$('#dataMenu').hidden;
  });
  document.addEventListener('click', e => {
    if (!$('#dataMenu').hidden && !e.target.closest('#dataMenu') && !e.target.closest('#btnDataMenu')) {
      $('#dataMenu').hidden = true;
    }
  });

  /* ================= 首次引导（3 步，可跳过） ================= */
  function initOnboard() {
    if (Prefs.get('onboarded')) return; // 仅首次启动弹出，跳过/完成后不再显示
    const steps = T.onboard;
    let idx = 0;
    const overlay = $('#onboard');
    function render() {
      $('#obTitle').textContent = steps[idx].title;
      $('#obDesc').textContent = steps[idx].desc;
      $('#obDots').innerHTML = steps.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
      $('#obNext').textContent = idx === steps.length - 1 ? T.onboardDone : T.onboardNext;
    }
    $('#obSkip').textContent = T.onboardSkip;
    render();
    overlay.hidden = false;
    $('#obSkip').addEventListener('click', done);
    $('#obNext').addEventListener('click', () => {
      if (idx >= steps.length - 1) { done(); return; }
      idx++;
      render();
    });
    function done() {
      Prefs.set('onboarded', '1');
      overlay.hidden = true;
    }
  }

  /* ================= 通用筛选 ================= */
  function filterQuestions(source, f) {
    const kw = (f.keyword || '').trim().toLowerCase();
    return source.filter(q => {
      if (f.stage && q.stage !== f.stage) return false;
      if (f.grade && q.grade !== f.grade) return false;
      if (f.term && q.term !== f.term) return false;
      if (f.subject && q.subject !== f.subject) return false;
      if (f.kp && !(q.knowledgePoints || []).includes(f.kp)) return false;
      if (f.qtype && (q.qtype || '') !== f.qtype) return false;
      if (f.mastery && q.mastery !== f.mastery) return false;
      if (f.onlyWrong && !q.isWrong) return false;
      if (kw) {
        const hay = [q.text, q.answer, q.wrongReason, ...(q.knowledgePoints || [])].join(' ').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  /* ================= 录入页：学段与步骤条 ================= */
  function renderStageChips() {
    $('#stageChips').innerHTML = STAGES.map(s =>
      `<button type="button" class="stage-chip ${s === curStage ? 'active' : ''}" data-stage="${esc(s)}">${esc(s)}</button>`
    ).join('');
    const hints = {
      '小学': '按「年级 + 学期 + 科目」整理',
      '初中': '按「年级 + 学期 + 科目」整理',
      '高中': '按「年级 + 学期 + 科目」整理',
      '大学': '按「课程 + 章节」整理，无学期',
      '职业考试': '按「考试项目 + 科目」整理，无学期',
      '其他': '自由填写分类'
    };
    $('#stageHint').textContent = hints[curStage] || '';
  }

  function updateSteps() {
    // 三步状态机：0 选择学段（未选时永远停在第 1 步）→ 1 上传或输入 → 2 预览确认
    const stageOk = STAGES.includes(curStage);
    const hasItems = pdfItems.length > 0 || $('#mText').value.trim().length > 0;
    const cur = !stageOk ? 0 : hasItems ? 2 : 1;
    $$('#importSteps .step').forEach((s, i) => {
      s.classList.toggle('current', i === cur);
      s.classList.toggle('done', i < cur);
    });
  }

  /* ================= PDF 导入 ================= */
  let pdfItems = [];
  let pdfFileName = '';

  function initPdfUI() {
    const dz = $('#dropZone');
    const fileInput = $('#pdfFile');

    dz.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) handlePdf(fileInput.files[0]);
      fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
      e.preventDefault();
      dz.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
      e.preventDefault();
      dz.classList.remove('dragover');
    }));
    dz.addEventListener('drop', e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handlePdf(f);
    });

    $('#btnImportAll').addEventListener('click', importAll);
    $('#btnAiSplitCheck').addEventListener('click', aiSplitCheck);
    $('#btnAiTagAll').addEventListener('click', aiTagAll);
  }

  async function handlePdf(file) {
    const status = $('#pdfStatus');
    if (!/\.pdf$/i.test(file.name)) {
      setStatus(status, '请选 PDF 文件', 'err');
      return;
    }
    setStatus(status, '正在读试卷，请稍等……');
    pdfItems = [];
    renderPreview();
    try {
      const text = await CJT.pdf.extractText(file);
      if (!text) {
        setStatus(status, '这份 PDF 是扫描图片版，暂时只支持文字版试卷', 'err');
        return;
      }
      const parts = CJT.pdf.splitQuestions(text);
      if (!parts.length) {
        setStatus(status, '没找到题号，没能拆成题目。可以先手动添加。', 'err');
        return;
      }
      pdfFileName = file.name;
      pdfItems = parts.map(p => ({ num: p.num, text: p.text, isWrong: true, kps: '', qtype: '' }));
      setStatus(status, `读好了：${file.name}，共 ${parts.length} 道题。`, 'ok');
      $('#importMeta').hidden = false;
      $('#impCount').textContent = parts.length;
      renderPreview();
      updateSteps();
    } catch (err) {
      console.error(err);
      setStatus(status, '读文件出错了，请换个 PDF 试试', 'err');
    }
  }

  function renderPreview() {
    const list = $('#previewList');
    $('#impCount').textContent = pdfItems.length;
    $('#importMeta').hidden = pdfItems.length === 0;
    const qtOpts = [''].concat(qtypeOptions(curStage));
    list.innerHTML = pdfItems.map((it, i) => `
      <div class="preview-item" data-i="${i}">
        <div class="preview-head">
          <span class="preview-num">第 ${esc(it.num)} 题</span>
          <span class="spacer"></span>
          <select class="pv-qtype" title="题型">
            ${qtOpts.map(q => `<option value="${esc(q)}" ${(it.qtype || '') === q ? 'selected' : ''}>${q ? esc(q) : '未分类'}</option>`).join('')}
          </select>
          <label class="check-field" style="font-size:13px">
            <input type="checkbox" class="pv-wrong" ${it.isWrong ? 'checked' : ''}>
            <span>错题</span>
          </label>
          <button type="button" class="btn danger small pv-del">删除</button>
        </div>
        <textarea rows="3" class="pv-text">${esc(it.text)}</textarea>
        <input type="text" class="pv-kp" style="margin-top:6px" placeholder="知识点（逗号隔开，可点「全部 AI 打标」自动填）" value="${esc(it.kps || '')}">
      </div>
    `).join('');
  }

  $('#previewList').addEventListener('input', e => {
    const item = e.target.closest('.preview-item');
    if (!item) return;
    const i = +item.dataset.i;
    if (e.target.classList.contains('pv-text')) pdfItems[i].text = e.target.value;
    if (e.target.classList.contains('pv-wrong')) pdfItems[i].isWrong = e.target.checked;
    if (e.target.classList.contains('pv-kp')) pdfItems[i].kps = e.target.value;
    if (e.target.classList.contains('pv-qtype')) pdfItems[i].qtype = e.target.value;
  });
  $('#previewList').addEventListener('click', e => {
    const btn = e.target.closest('.pv-del');
    if (!btn) return;
    const i = +btn.closest('.preview-item').dataset.i;
    pdfItems.splice(i, 1);
    renderPreview();
  });

  async function importAll() {
    if (!pdfItems.length) return;
    const cls = classifyValue('imp');
    const payload = pdfItems.map(it => Object.assign({
      text: it.text,
      answer: '',
      knowledgePoints: String(it.kps || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean),
      isWrong: it.isWrong,
      wrongReason: '',
      mastery: '未掌握',
      sourceFile: pdfFileName,
      qtype: it.qtype || ''
    }, cls));
    const n = await store.addMany(payload);
    pdfItems = [];
    pdfFileName = '';
    renderPreview();
    setStatus($('#pdfStatus'), `已存好 ${n} 道题。`, 'ok');
    await refreshAll();
    toast(`成功存入 ${n} 道题`);
  }

  /* ---------- AI 校对切分 / 批量打标 ---------- */
  async function aiSplitCheck() {
    if (!pdfItems.length) {
      toast('请先上传试卷');
      return;
    }
    const cls = classifyValue('imp');
    const res = await callAI('/ai/split-check', {
      items: pdfItems.map(it => ({ text: it.text })),
      stage: cls.stage, grade: cls.grade, term: cls.term, subject: cls.subject
    });
    if (!res) return;
    pdfItems = res.items.map((it, i) => ({
      num: i + 1,
      text: it.text,
      isWrong: pdfItems[i] ? pdfItems[i].isWrong : true,
      kps: pdfItems[i] ? pdfItems[i].kps : '',
      qtype: mapSplitQtype(it.type)
    }));
    renderPreview();
    toast(`校对完成：共 ${res.items.length} 道题（已标题型）`);
  }

  // 切分校对返回的题型（带「题」后缀）映射到当前学段词表
  function mapSplitQtype(raw) {
    if (!raw || raw === '其他') return '';
    const vocab = QTYPE_VOCAB[curStage] || [];
    const stripped = raw.replace(/题$/, '');
    if (vocab.includes(raw)) return raw;
    if (vocab.includes(stripped)) return stripped;
    if (raw === '解答题' && vocab.includes('计算证明')) return '计算证明';
    if (raw === '阅读题' && vocab.includes('阅读理解')) return '阅读理解';
    if (raw === '写作题' && vocab.includes('作文')) return '作文';
    return '';
  }

  async function aiTagAll() {
    if (!pdfItems.length) {
      toast('请先上传试卷');
      return;
    }
    const cls = classifyValue('imp');
    let done = 0;
    for (let i = 0; i < pdfItems.length; i++) {
      const res = await callAI('/ai/tag', Object.assign({
        question: pdfItems[i].text
      }, cls), { loadingText: `AI 打标中（${i + 1}/${pdfItems.length}）` });
      if (!res) {
        toast(`打标中断：第 ${i + 1} 道没成功，已完成 ${done} 道`);
        renderPreview();
        return;
      }
      pdfItems[i].kps = (res.knowledge_points || []).map(k => k.name).join('，');
      if (res.qtype) pdfItems[i].qtype = res.qtype;
      done++;
    }
    renderPreview();
    toast(`已为 ${done} 道题打好标签，可再修改`);
  }

  /* ================= 手动录入 ================= */
  let mImages = []; // 已上传题目配图文件名
  function renderMImgs() {
    $('#mImgs').innerHTML = mImages.map(n => `
      <span class="img-thumb-wrap">
        <img src="/images/${esc(n)}" class="img-thumb" alt="题目配图">
        <button type="button" class="img-del" data-name="${esc(n)}" title="删除这张图">×</button>
      </span>`).join('');
  }

  function initManualForm() {
    $('#mImgBtn').addEventListener('click', () => $('#mImgFile').click());
    $('#mImgFile').addEventListener('change', async () => {
      const files = Array.from($('#mImgFile').files || []);
      $('#mImgFile').value = '';
      if (!files.length) return;
      for (const f of files) {
        if (f.size > 10 * 1024 * 1024) { toast('「' + f.name + '」超过 10MB，压一压再传'); continue; }
        const fd = new FormData();
        fd.append('file', f);
        try {
          const resp = await fetch('/api/upload/image', { method: 'POST', body: fd });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.detail || resp.status);
          mImages.push(data.name);
        } catch (err) {
          toast('图片上传失败，换一张试试');
        }
      }
      renderMImgs();
    });
    $('#mImgs').addEventListener('click', e => {
      const del = e.target.closest('.img-del');
      if (!del) return;
      mImages = mImages.filter(n => n !== del.dataset.name);
      renderMImgs();
    });

    $('#manualForm').addEventListener('submit', async e => {
      e.preventDefault();
      const text = $('#mText').value.trim();
      if (!text) {
        toast('请把题目填进来');
        return;
      }
      const cls = classifyValue('m');
      await store.add(Object.assign({
        text,
        answer: $('#mAnswer').value.trim(),
        knowledgePoints: $('#mKp').value.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
        isWrong: $('#mWrong').checked,
        wrongReason: $('#mReason').value.trim(),
        mastery: '未掌握',
        sourceFile: '手动录入',
        qtype: $('#mQtype').value,
        images: mImages.slice()
      }, cls));
      e.target.reset();
      $('#mWrong').checked = true;
      mImages = [];
      renderMImgs();
      await refreshAll();
      updateSteps();
      toast('已保存');
    });

    $('#mText').addEventListener('input', updateSteps);

    $('#btnAiTag').addEventListener('click', async () => {
      const text = $('#mText').value.trim();
      if (!text) {
        toast('请先填题目再打标');
        return;
      }
      const res = await callAI('/ai/tag', Object.assign({ question: text }, classifyValue('m')));
      if (!res) return;
      const names = (res.knowledge_points || []).map(k => k.name);
      $('#mKp').value = names.join('，');
      if (res.qtype && qtypeOptions(curStage).includes(res.qtype)) $('#mQtype').value = res.qtype;
      toast(`打好标签：${names.join('、')}`);
    });

    $('#btnAiSolve').addEventListener('click', async () => {
      const text = $('#mText').value.trim();
      if (!text) {
        toast('请先填题目');
        return;
      }
      const res = await callAI('/ai/solve', Object.assign({ question: text }, classifyValue('m')));
      if (!res) return;
      $('#mAnswer').value = res.answer + (res.explanation ? '\n讲解：' + res.explanation : '');
      toast('已生成答案，可修改后保存');
    });
  }

  /* ================= 错题集 ================= */
  let drillUncat = false; // 「未分类」下钻标志：任一筛选变化即解除

  function bankFilters() {
    return {
      stage: $('#fStage').value,
      grade: $('#fGrade').value,
      term: $('#fTerm').value,
      subject: $('#fSubject').value,
      qtype: $('#fQtype').value,
      kp: $('#fKp').value,
      mastery: $('#fMastery').value,
      keyword: $('#fKeyword').value
    };
  }

  function renderBank() {
    let list;
    if (drillUncat) {
      list = filterQuestions(store.all(), Object.assign(anaFilters(), { qtype: '' }))
        .filter(q => q.isWrong && !q.qtype);
      $('#bankCount').textContent = `${list.length} 题（题型未分类）`;
    } else {
      list = filterQuestions(store.all(), bankFilters());
      $('#bankCount').textContent = `${list.length} 题`;
    }
    const empty = $('#bankEmpty');
    empty.hidden = list.length > 0;
    empty.querySelector('.empty-text').textContent = store.all().length
      ? '没有符合筛选条件的题目，换个筛选试试。'
      : T.emptyBank;
    $('#bankList').innerHTML = list.map(q => `
      <div class="q-card" data-id="${esc(q.id)}">
        <div class="q-badges">
          <span class="badge">${esc(q.stage || stageOfGrade(q.grade))}</span>
          ${q.grade ? `<span class="badge">${esc(q.grade)}</span>` : ''}
          ${q.term ? `<span class="badge">${esc(q.term)}学期</span>` : ''}
          ${q.subject ? `<span class="badge">${esc(q.subject)}</span>` : ''}
          ${q.qtype ? `<span class="badge">${esc(q.qtype)}</span>` : ''}
          ${q.isWrong ? '<span class="badge wrong">错题</span>' : '<span class="badge normal">普通题</span>'}
          ${q.wrongReason ? `<span class="reason-tag">原因：${esc(q.wrongReason)}</span>` : ''}
        </div>
        <div class="q-text">${esc(q.text)}</div>
        ${(q.images && q.images.length) ? `<div class="q-imgs">${q.images.map(n =>
          `<img src="/images/${esc(n)}" class="img-thumb" alt="题目配图" loading="lazy">`).join('')}</div>` : ''}
        ${q.answer ? `<div class="q-answer"><b>答案：</b>${esc(q.answer)}</div>` : ''}
        ${q.knowledgePoints.length ? `<div class="q-kps">${q.knowledgePoints.map(k =>
          `<span class="kp-chip" data-kp="${esc(k)}" title="按该知识点筛选">${esc(k)}</span>`).join('')}</div>` : ''}
        <div class="q-foot">
          <span>${q.sourceFile ? '来源：' + esc(q.sourceFile) : ''}</span>
          <span>${fmtDate(q.createdAt)}</span>
          <span class="spacer"></span>
          <label>题型
            <select class="q-qtype">
              <option value="">未分类</option>
              ${qtypeOptions(q.stage || '其他', q.qtype).map(t => `<option value="${esc(t)}" ${q.qtype === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </label>
          <label>掌握
            <span class="hint-tip" data-tip-key="tipMastery">?</span>
            <select class="q-mastery">
              ${MASTERY.map(m => `<option value="${esc(m)}" ${q.mastery === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
            </select>
          </label>
          <button type="button" class="btn small q-similar">出同类题</button>
          <button type="button" class="btn danger small q-del">删除</button>
        </div>
      </div>
    `).join('');
  }

  ['fStage', 'fGrade', 'fTerm', 'fSubject', 'fQtype', 'fKp', 'fMastery'].forEach(id =>
    $('#' + id).addEventListener('change', () => { drillUncat = false; renderBank(); }));
  $('#fKeyword').addEventListener('input', () => { drillUncat = false; renderBank(); });
  $('#btnClearFilter').addEventListener('click', () => {
    drillUncat = false;
    ['fStage', 'fGrade', 'fTerm', 'fSubject', 'fQtype', 'fKp', 'fMastery'].forEach(id => { $('#' + id).value = ''; });
    $('#fKeyword').value = '';
    renderBank();
  });
  $('#btnGoImport').addEventListener('click', () => switchView('import'));

  $('#bankList').addEventListener('change', async e => {
    const card = e.target.closest('.q-card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.classList.contains('q-mastery')) {
      await store.update(id, { mastery: e.target.value });
      toast('掌握状态已更新');
    }
    if (e.target.classList.contains('q-qtype')) {
      await store.update(id, { qtype: e.target.value });
      toast('题型已更新');
    }
  });
  $('#bankList').addEventListener('click', async e => {
    const del = e.target.closest('.q-del');
    if (del) {
      if (confirm(T.confirmDeleteOne)) {
        await store.remove(del.closest('.q-card').dataset.id);
        renderBank();
        renderAnalysis();
        refreshKpSelects();
        toast('已删除');
      }
      return;
    }
    const sim = e.target.closest('.q-similar');
    if (sim) {
      const q = store.get(sim.closest('.q-card').dataset.id);
      if (!q) return;
      showSimilarModal('出同类题', {
        question: q.text,
        knowledge_points: q.knowledgePoints,
        count: 3,
        stage: q.stage, grade: q.grade, term: q.term, subject: q.subject
      }, {
        stage: q.stage, grade: q.grade, term: q.term, subject: q.subject,
        knowledgePoints: q.knowledgePoints, qtype: q.qtype
      }, { printable: false });
      return;
    }
    const chip = e.target.closest('.kp-chip');
    if (chip) {
      $('#fKp').value = chip.dataset.kp;
      renderBank();
    }
  });

  /* ---------- 同类题弹层（错题集「出同类题」/ 学情分析「AI 出题」共用） ---------- */
  async function showSimilarModal(title, request, inherit, opts) {
    opts = opts || {};
    openModal(title, `
      <button class="btn" id="mClose2" type="button">关闭</button>
      ${opts.printable ? '<button class="btn" id="mPrintSel" type="button">选中组卷打印</button>' : ''}
      <button class="btn primary" id="mAddSel" type="button">加入题库</button>
    `);
    const body = $('#modalBody');
    body.innerHTML = '<p class="hint">AI 出题中…</p>';
    const res = await callAI('/ai/similar', request);
    if (!res) {
      body.innerHTML = '<p class="status err">没生成成功，请打开「AI 设置」检查，或先选 Mock 体验。</p>';
      $('#mAddSel').hidden = true;
      return;
    }
    const qs = res.questions || [];
    if (!qs.length) {
      body.innerHTML = '<p class="hint">没出成题，请重试。</p>';
      $('#mAddSel').hidden = true;
      return;
    }
    body.innerHTML = qs.map((q, i) => `
      <div class="ai-item">
        <label>
          <input type="checkbox" class="sim-check" data-i="${i}" checked>
          <div>
            <div class="ai-text">${esc(q.text)}</div>
            <div class="ai-answer"><b>答案：</b>${esc(q.answer || '（暂无）')}</div>
          </div>
        </label>
      </div>
    `).join('');
    const selected = () => $$('.sim-check:checked').map(cb => qs[+cb.dataset.i]);
    $('#mClose2').addEventListener('click', closeModal);
    $('#mAddSel').addEventListener('click', async () => {
      const sel = selected();
      if (!sel.length) {
        toast('请勾选要加入的题目');
        return;
      }
      await store.addMany(sel.map(s => Object.assign({
        text: s.text,
        answer: s.answer,
        isWrong: false,
        mastery: '未掌握',
        wrongReason: '',
        sourceFile: 'AI 出题'
      }, inherit)));
      await refreshAll();
      closeModal();
      toast(`已加入题库 ${sel.length} 道题`);
    });
    if (opts.printable) {
      $('#mPrintSel').addEventListener('click', () => {
        const sel = selected();
        if (!sel.length) {
          toast('请勾选题目');
          return;
        }
        const html = buildPaperHTML(sel.map(s => ({
          text: s.text,
          answer: s.answer,
          knowledgePoints: inherit.knowledgePoints || []
        })), true);
        $('#print-area').innerHTML = html;
        window.print();
      });
    }
  }

  /* ================= 组卷打印 ================= */
  function paperFilters() {
    return {
      stage: $('#pStage').value,
      grade: $('#pGrade').value,
      term: $('#pTerm').value,
      subject: $('#pSubject').value,
      kp: $('#pKp').value,
      mastery: $('#pMastery').value,
      onlyWrong: $('#pOnlyWrong').checked
    };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildPaperHTML(list, withAnswers) {
    const questions = list.map((q, i) => `
      <div class="paper-q">
        <div class="pq-text"><b>${i + 1}.</b> ${esc(q.text)}</div>
        ${(q.images && q.images.length) ? `<div class="paper-imgs">${q.images.map(n =>
          `<img src="/images/${esc(n)}" class="paper-img" alt="">`).join('')}</div>` : ''}
        <div class="answer-blank"></div>
      </div>
    `).join('');
    const answers = withAnswers
      ? `<div class="answer-page">
           <h2>参考答案与讲解</h2>
           ${list.map((q, i) => `
             <div class="answer-item">
               <b>${i + 1}.</b> ${esc(q.answer || '（暂无答案）')}
               ${q.knowledgePoints.length ? `<br><span style="color:#666">知识点：${esc(q.knowledgePoints.join('、'))}</span>` : ''}
             </div>`).join('')}
         </div>`
      : '';
    return `
      <div class="paper-sheet">
        <h1>错题练习卷</h1>
        <div class="paper-meta">
          <span>姓名<span class="paper-line"></span></span>
          <span>日期<span class="paper-line"></span></span>
          <span>得分<span class="paper-line"></span></span>
        </div>
        ${questions}
        ${answers}
      </div>`;
  }

  let lastPicked = []; // 最近一次抽题结果（模考复用）

  function weakPick(pool, count) {
    // 薄弱优先：按知识点「未掌握/复习中错题数」给题加权（错得多的知识点命中率高）
    const weight = new Map();
    pool.forEach(q => {
      if (q.isWrong && q.mastery !== '已掌握') {
        (q.knowledgePoints || []).forEach(k => weight.set(k, (weight.get(k) || 0) + 1));
      }
    });
    const items = pool.map(q => {
      const w = 1 + (q.knowledgePoints || []).reduce((s, k) => s + (weight.get(k) || 0), 0);
      return { q, w };
    });
    const picked = [];
    for (let n = 0; n < count && items.length; n++) {
      const total = items.reduce((s, it) => s + it.w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < items.length; idx++) {
        r -= items[idx].w;
        if (r <= 0) break;
      }
      if (idx >= items.length) idx = items.length - 1;
      picked.push(items[idx].q);
      items.splice(idx, 1);
    }
    return picked;
  }

  function generatePaper() {
    const pool = filterQuestions(store.all(), paperFilters());
    if (!pool.length) {
      toast('没有符合条件的题目');
      $('#paperPreview').innerHTML = '';
      $('#print-area').innerHTML = '';
      $('#btnPrint').disabled = true;
      lastPicked = [];
      return false;
    }
    const count = Math.max(1, Math.min(parseInt($('#pCount').value, 10) || 10, pool.length));
    const weakMode = $('#pWeak').checked;
    const picked = weakMode ? weakPick(pool, count) : shuffle(pool).slice(0, count);
    lastPicked = picked;
    const withAnswers = $('#pWithAnswers').checked;
    const html = buildPaperHTML(picked, withAnswers);
    $('#paperPreview').innerHTML = html;
    $('#print-area').innerHTML = html;
    $('#btnPrint').disabled = false;
    $('#paperHint').textContent = `从 ${pool.length} 道候选题里抽了 ${picked.length} 道${weakMode ? '（薄弱知识点优先）' : ''}${withAnswers ? '，附答案页' : ''}。点「打印」输出试卷。`;
    return true;
  }

  $('#btnGenPaper').addEventListener('click', generatePaper);
  $('#btnPrint').addEventListener('click', () => {
    if (!$('#print-area').innerHTML.trim()) {
      if (!generatePaper()) return;
    }
    window.print();
  });

  /* ================= 学情分析 ================= */
  let anaTab = 'qtype';
  let chartMode = 'bar'; // bar | pie

  function anaFilters() {
    return {
      stage: $('#aStage').value,
      grade: $('#aGrade').value,
      subject: $('#aSubject').value,
      onlyWrong: true
    };
  }

  function analysisPool() {
    return filterQuestions(store.all(), anaFilters()).filter(q => q.isWrong);
  }

  function renderAnalysis() {
    const pool = analysisPool();
    $('#analysisEmpty').hidden = pool.length > 0;
    $('#analysisEmpty .empty-text').textContent = T.emptyAnalysis;

    // 摘要卡片
    $('#sumTotal').textContent = pool.length;
    const qCounts = new Map();
    const kpCounts = new Map();
    pool.forEach(q => {
      const qt = q.qtype || '未分类';
      qCounts.set(qt, (qCounts.get(qt) || 0) + 1);
      (q.knowledgePoints || []).forEach(k => kpCounts.set(k, (kpCounts.get(k) || 0) + 1));
    });
    const topQt = [...qCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const topKp = [...kpCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    $('#sumQtype').textContent = topQt ? `${topQt[0]}（${topQt[1]} 次）` : '—';
    $('#sumKp').textContent = topKp ? `${topKp[0]}（${topKp[1]} 次）` : '—';

    $('#anaPanelQtype').hidden = anaTab !== 'qtype';
    $('#anaPanelKp').hidden = anaTab !== 'kp';
    $('#anaPanelTrend').hidden = anaTab !== 'trend';
    $('#anaPanelGraph').hidden = anaTab !== 'graph';

    if (anaTab === 'qtype') renderQtypeChart(pool);
    else if (anaTab === 'trend') renderTrendChart(pool);
    else if (anaTab === 'graph') renderGraphChart(pool);
    else renderKpChart(pool);

    // 历史数据补标入口
    const missing = pool.filter(q => !q.qtype).length;
    $('#btnAiQtype').hidden = missing === 0;
    $('#aiQtypeSub').textContent = missing ? `${missing} 道错题还没有题型，可一键补标` : T.emptyQtype;
  }

  const PIE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];

  function renderQtypeChart(pool) {
    const chart = $('#qtypeChart');
    const counts = new Map();
    pool.forEach(q => {
      const qt = q.qtype || '未分类';
      counts.set(qt, (counts.get(qt) || 0) + 1);
    });
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
      chart.innerHTML = '<p class="hint">暂无数据</p>';
      return;
    }
    if (chartMode === 'pie') {
      const total = rows.reduce((s, r) => s + r[1], 0);
      let acc = 0;
      const segs = rows.map(([name, n], i) => {
        const from = acc / total * 360;
        acc += n;
        const to = acc / total * 360;
        const color = name === '未分类' ? '#94a3b8' : PIE_COLORS[i % PIE_COLORS.length];
        return `${color} ${from}deg ${to}deg`;
      }).join(', ');
      chart.innerHTML = `
        <div class="pie-wrap">
          <div class="pie" style="background: conic-gradient(${segs})"></div>
          <div class="pie-legend">
            ${rows.map(([name, n], i) => `
              <span class="lg" data-qt="${esc(name)}">
                <span class="dot" style="background:${name === '未分类' ? '#94a3b8' : PIE_COLORS[i % PIE_COLORS.length]}"></span>
                ${esc(name)}　${n} 道（${Math.round(n / total * 100)}%）
              </span>`).join('')}
          </div>
        </div>`;
      $$('#qtypeChart .lg').forEach(el => el.addEventListener('click', () => drillQtype(el.dataset.qt)));
    } else {
      const max = rows[0][1];
      chart.innerHTML = rows.map(([name, n]) => `
        <div class="chart-row">
          <span class="chart-label" data-qt="${esc(name)}">${esc(name)}</span>
          <div class="chart-track"><div class="chart-bar" style="width:${Math.max(4, (n / max) * 100)}%"></div></div>
          <span class="chart-count">${n} 道</span>
        </div>
      `).join('');
      $$('#qtypeChart .chart-label').forEach(el => el.addEventListener('click', () => drillQtype(el.dataset.qt)));
    }
  }

  // 题型下钻：跳到错题集并筛出该题型
  function drillQtype(qt) {
    drillUncat = qt === '未分类';
    ['fStage', 'fGrade', 'fTerm', 'fSubject', 'fKp', 'fMastery'].forEach(id => { $('#' + id).value = ''; });
    $('#fKeyword').value = '';
    $('#fQtype').value = drillUncat ? '' : qt;
    if (drillUncat) {
      // 沿用分析页筛选范围
      $('#fStage').value = $('#aStage').value;
      $('#fGrade').value = $('#aGrade').value;
      $('#fSubject').value = $('#aSubject').value;
    }
    refreshGradeSubjectSelects('f');
    switchView('bank');
    renderBank();
  }

  function renderKpChart(pool) {
    const chart = $('#kpChart');
    const countAll = $('#aAllMastery').checked;
    const counted = pool.filter(q => countAll || q.mastery !== '已掌握');
    const counts = new Map();
    const masteryDist = new Map(); // kp -> {未掌握, 复习中, 已掌握}
    pool.forEach(q => {
      (q.knowledgePoints || []).forEach(k => {
        const d = masteryDist.get(k) || { '未掌握': 0, '复习中': 0, '已掌握': 0 };
        d[q.mastery] = (d[q.mastery] || 0) + 1;
        masteryDist.set(k, d);
      });
    });
    counted.forEach(q => {
      (q.knowledgePoints || []).forEach(k => counts.set(k, (counts.get(k) || 0) + 1));
    });
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!rows.length) {
      chart.innerHTML = '<p class="hint">暂无数据</p>';
      return;
    }
    const max = rows[0][1];
    chart.innerHTML = rows.map(([kp, n], i) => {
      const d = masteryDist.get(kp) || { '未掌握': 0, '复习中': 0, '已掌握': 0 };
      const dt = (d['未掌握'] || 0) + (d['复习中'] || 0) + (d['已掌握'] || 0) || 1;
      return `
        <div class="chart-row">
          <span class="chart-label" data-kp="${esc(kp)}" title="点我针对「${esc(kp)}」出题">${i + 1}. ${esc(kp)}</span>
          <div class="chart-track"><div class="chart-bar" style="width:${Math.max(4, (n / max) * 100)}%"></div></div>
          <span class="chart-count">
            ${n} 道
            <span class="kp-stack" title="未掌握 ${d['未掌握']} / 复习中 ${d['复习中']} / 已掌握 ${d['已掌握']}">
              <i class="s-red" style="width:${(d['未掌握'] || 0) / dt * 100}%"></i>
              <i class="s-yellow" style="width:${(d['复习中'] || 0) / dt * 100}%"></i>
              <i class="s-green" style="width:${(d['已掌握'] || 0) / dt * 100}%"></i>
            </span>
          </span>
        </div>`;
    }).join('');
    $$('#kpChart .chart-label').forEach(el => el.addEventListener('click', () => drillKp(el.dataset.kp)));
  }

  // 知识点下钻：跳到组卷页针对出题
  function drillKp(kp) {
    ['pStage', 'pGrade', 'pTerm', 'pSubject', 'pMastery'].forEach(id => { $('#' + id).value = ''; });
    $('#pOnlyWrong').checked = true;
    $('#pStage').value = $('#aStage').value;
    $('#pGrade').value = $('#aGrade').value;
    $('#pSubject').value = $('#aSubject').value;
    refreshGradeSubjectSelects('p');
    $('#pKp').value = kp;
    switchView('paper');
    generatePaper();
  }

  $('#aAllMastery').addEventListener('change', renderAnalysis);
  $('#btnChartBar').addEventListener('click', () => { chartMode = 'bar'; $('#btnChartBar').classList.add('active'); $('#btnChartPie').classList.remove('active'); renderAnalysis(); });
  $('#btnChartPie').addEventListener('click', () => { chartMode = 'pie'; $('#btnChartPie').classList.add('active'); $('#btnChartBar').classList.remove('active'); renderAnalysis(); });
  $$('.ana-tab').forEach(t => t.addEventListener('click', () => {
    anaTab = t.dataset.ana;
    $$('.ana-tab').forEach(x => x.classList.toggle('active', x === t));
    renderAnalysis();
  }));
  ['aStage', 'aGrade', 'aSubject'].forEach(id => $('#' + id).addEventListener('change', renderAnalysis));
  $('#btnGoImport2').addEventListener('click', () => switchView('import'));

  // AI 批量补标题型（历史数据）
  $('#btnAiQtype').addEventListener('click', async () => {
    const targets = analysisPool().filter(q => !q.qtype);
    if (!targets.length) return;
    if (!confirm(`将给 ${targets.length} 道错题自动识别题型，会消耗一点点 AI 额度。继续吗？`)) return;
    let done = 0;
    for (let i = 0; i < targets.length; i++) {
      const q = targets[i];
      const res = await callAI('/ai/tag', {
        question: q.text, stage: q.stage, grade: q.grade, term: q.term, subject: q.subject
      }, { loadingText: `补标题型中（${i + 1}/${targets.length}）` });
      if (!res) {
        toast(`中断：第 ${i + 1} 道失败，已补 ${done} 道`);
        break;
      }
      if (res.qtype) {
        await store.update(q.id, { qtype: res.qtype });
        done++;
      }
    }
    await store.reload();
    renderAnalysis();
    toast(`已补标 ${done} 道题的题型`);
  });

  /* ================= 知识图谱（旭日图，纯 SVG） ================= */
  // 掌握度 → 颜色：0=红(未掌握) 0.5=黄 1=绿(已掌握)，HSL 插值
  function masteryColor(mastered, total) {
    if (!total) return 'var(--muted)';
    const ratio = mastered / total;
    const hue = ratio * 120; // 0红 → 120绿
    return `hsl(${Math.round(hue)}, 62%, 52%)`;
  }

  function arcPath(cx, cy, r0, r1, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (r, a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    return `M ${p(r0, a0)} A ${r0} ${r0} 0 ${large} 1 ${p(r0, a1)} L ${p(r1, a1)} A ${r1} ${r1} 0 ${large} 0 ${p(r1, a0)} Z`;
  }

  function renderGraphChart(pool) {
    const el = $('#graphChart');
    // 聚合：科目 → 知识点 → {total, mastered}
    const bySubject = new Map();
    pool.forEach(q => {
      const subject = q.subject || '未分类科目';
      const kps = q.knowledgePoints.length ? q.knowledgePoints : ['未标知识点'];
      kps.forEach(kp => {
        const m = bySubject.get(subject) || new Map();
        const node = m.get(kp) || { total: 0, mastered: 0 };
        node.total += 1;
        if (q.mastery === '已掌握') node.mastered += 1;
        m.set(kp, node);
        bySubject.set(subject, m);
      });
    });
    const grandTotal = [...bySubject.values()].reduce((s, m) => s + [...m.values()].reduce((x, n) => x + n.total, 0), 0);
    if (!grandTotal) {
      el.innerHTML = '<p class="chart-empty">还没有知识点数据。录入错题时让 AI 打上知识点标签，这里就能看到全貌。</p>';
      return;
    }
    const SIZE = 460, CX = SIZE / 2, CY = SIZE / 2;
    const R_IN = 66, R_SUBJECT = 128, R_KP = 196;
    let angle = -Math.PI / 2;
    let svg = `<circle cx="${CX}" cy="${CY}" r="${R_IN - 8}" fill="var(--surface-3)"/>
      <text x="${CX}" y="${CY - 6}" text-anchor="middle" font-size="22" font-weight="700" fill="var(--text)">${grandTotal}</text>
      <text x="${CX}" y="${CY + 16}" text-anchor="middle" font-size="12" fill="var(--muted)">道错题</text>`;
    const legend = [];
    [...bySubject.entries()].forEach(([subject, kps], si) => {
      const subTotal = [...kps.values()].reduce((s, n) => s + n.total, 0);
      const subMastered = [...kps.values()].reduce((s, n) => s + n.mastered, 0);
      const span = subTotal / grandTotal * Math.PI * 2;
      const a0 = angle, a1 = angle + span;
      const hue = (si * 47) % 360;
      svg += `<path d="${arcPath(CX, CY, R_IN, R_SUBJECT, a0, a1)}" fill="hsl(${hue},45%,58%)" stroke="var(--card)" stroke-width="1.5"><title>${esc(subject)}：${subTotal} 道错题</title></path>`;
      // 科目标签（扇区中线外侧）
      const mid = (a0 + a1) / 2;
      const lx = CX + (R_IN + R_SUBJECT) / 2 * Math.cos(mid);
      const ly = CY + (R_IN + R_SUBJECT) / 2 * Math.sin(mid);
      if (span > 0.28) {
        svg += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">${esc(subject.length > 6 ? subject.slice(0, 5) + '…' : subject)}</text>`;
      }
      // 外环：知识点
      let ka = a0;
      [...kps.entries()].sort((a, b) => b[1].total - a[1].total).forEach(([kp, node]) => {
        const kspan = node.total / subTotal * span;
        const color = masteryColor(node.mastered, node.total);
        svg += `<path class="graph-kp" d="${arcPath(CX, CY, R_SUBJECT + 2, R_KP, ka, ka + kspan)}" fill="${color}" fill-opacity="0.88" stroke="var(--card)" stroke-width="1" data-kp="${esc(kp)}" style="cursor:pointer"><title>${esc(kp)}：${node.total} 道${node.mastered ? `（已掌握 ${node.mastered}）` : ''}</title></path>`;
        ka += kspan;
      });
      legend.push({ subject, total: subTotal, color: `hsl(${hue},45%,58%)`, mastered: subMastered });
      angle = a1;
    });
    el.innerHTML = `<svg viewBox="0 0 ${SIZE} ${SIZE}" class="graph-svg" role="img" aria-label="知识图谱">${svg}</svg>
      <div class="trend-legend">${legend.slice(0, 8).map(l =>
        `<span><i class="lg" style="background:${l.color}"></i>${esc(l.subject)} ${l.total} 道（绿=${l.mastered} 已掌握）</span>`).join('')}</div>`;
  }

  $('#graphChart').addEventListener('click', e => {
    const seg = e.target.closest('.graph-kp');
    if (!seg) return;
    $('#fKp').value = seg.dataset.kp;
    drillUncat = false;
    switchView('bank');
    renderBank();
  });

  /* ================= 错题趋势（按周/月折线） ================= */
  let trendMode = 'week'; // week | month

  function bucketKey(iso, mode) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    if (mode === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monday = new Date(d);
    const day = (d.getDay() + 6) % 7; // 周一为一周开始
    monday.setDate(d.getDate() - day);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  }

  function renderTrendChart(pool) {
    const el = $('#trendChart');
    const buckets = new Map(); // key → {added, mastered}
    pool.forEach(q => {
      const key = bucketKey(q.createdAt, trendMode);
      if (!key) return;
      const b = buckets.get(key) || { added: 0, mastered: 0 };
      b.added += 1;
      if (q.mastery === '已掌握') b.mastered += 1;
      buckets.set(key, b);
    });
    const keys = [...buckets.keys()].sort().slice(-12); // 最近 12 个周期
    if (!keys.length) {
      el.innerHTML = '<p class="chart-empty">还没有带日期的错题，录入后这里会显示变化趋势。</p>';
      return;
    }
    const W = 640, H = 220, PAD = 34;
    const maxAdded = Math.max(1, ...keys.map(k => buckets.get(k).added));
    const x = i => PAD + (keys.length === 1 ? (W - 2 * PAD) / 2 : i * (W - 2 * PAD) / (keys.length - 1));
    const yAdded = v => H - PAD - (v / maxAdded) * (H - 2 * PAD);
    const yRate = v => H - PAD - v * (H - 2 * PAD); // 0~1
    const pts = (fn) => keys.map((k, i) => `${x(i)},${fn(k)}`).join(' ');
    const addedPts = pts(k => yAdded(buckets.get(k).added));
    const ratePts = pts(k => yRate(buckets.get(k).mastered / buckets.get(k).added));
    const labels = keys.map((k, i) => {
      const short = trendMode === 'month' ? k.slice(2, 7) : k.slice(5);
      return `<text x="${x(i)}" y="${H - 10}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(short)}</text>`;
    }).join('');
    const addedDots = keys.map((k, i) =>
      `<circle cx="${x(i)}" cy="${yAdded(buckets.get(k).added)}" r="3.5" fill="var(--primary)"><title>${esc(k)}：新增错题 ${buckets.get(k).added} 道</title></circle>`).join('');
    const rateDots = keys.map((k, i) => {
      const b = buckets.get(k);
      const pct = Math.round(100 * b.mastered / b.added);
      return `<circle cx="${x(i)}" cy="${yRate(b.mastered / b.added)}" r="3.5" fill="#16a34a"><title>${esc(k)}：订正率 ${pct}%</title></circle>`;
    }).join('');
    el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img" aria-label="错题趋势图">
        ${labels}
        <polyline points="${addedPts}" fill="none" stroke="var(--primary)" stroke-width="2.5"/>
        <polyline points="${ratePts}" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="5 4"/>
        ${addedDots}${rateDots}
      </svg>
      <div class="trend-legend">
        <span><i class="lg lg-blue"></i>新增错题数</span>
        <span><i class="lg lg-green"></i>订正率（已掌握占比）</span>
      </div>`;
  }

  $('#btnTrendWeek').addEventListener('click', () => {
    trendMode = 'week';
    $('#btnTrendWeek').classList.add('active');
    $('#btnTrendMonth').classList.remove('active');
    renderAnalysis();
  });
  $('#btnTrendMonth').addEventListener('click', () => {
    trendMode = 'month';
    $('#btnTrendMonth').classList.add('active');
    $('#btnTrendWeek').classList.remove('active');
    renderAnalysis();
  });

  /* ================= 今日复习（间隔重复 1/3/7/15 天） ================= */
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dueQuestions() {
    const today = todayStr();
    return store.all().filter(q =>
      q.isWrong && q.mastery !== '已掌握' && q.nextReviewAt && q.nextReviewAt <= today);
  }

  function renderReview() {
    const list = dueQuestions();
    const badge = $('#revBadge');
    badge.textContent = list.length > 99 ? '99+' : list.length;
    badge.hidden = list.length === 0;
    $('#revCount').textContent = `${list.length} 题`;
    $('#reviewEmpty').hidden = list.length !== 0;
    $('#reviewList').innerHTML = list.map(q => `
      <div class="q-card" data-id="${esc(q.id)}">
        <div class="q-badges">
          <span class="badge">${esc(q.stage || stageOfGrade(q.grade))}</span>
          ${q.grade ? `<span class="badge">${esc(q.grade)}</span>` : ''}
          ${q.subject ? `<span class="badge">${esc(q.subject)}</span>` : ''}
          ${q.qtype ? `<span class="badge">${esc(q.qtype)}</span>` : ''}
          <span class="badge wrong">第 ${(q.reviewInterval || 0) + 1} 次复习</span>
        </div>
        <div class="q-text">${esc(q.text)}</div>
        ${(q.images && q.images.length) ? `<div class="q-imgs">${q.images.map(n =>
          `<img src="/images/${esc(n)}" class="img-thumb" alt="">`).join('')}</div>` : ''}
        <details class="review-answer"><summary>看答案</summary><div class="q-answer">${esc(q.answer || '（暂无答案）')}</div></details>
        <div class="q-foot">
          <span class="hint">先自己动笔做，再对答案，然后按真实感受点一个</span>
          <span class="spacer"></span>
          <button type="button" class="btn danger small rev-grade" data-rating="forgot">😵 忘了 · 明天</button>
          <button type="button" class="btn small rev-grade" data-rating="good">🙂 想起来了 · ${sm2Preview(q, 'good')}</button>
          <button type="button" class="btn small rev-grade" data-rating="easy">😎 很轻松 · ${sm2Preview(q, 'easy')}</button>
          <button type="button" class="btn small rev-known" style="color:var(--ok);border-color:var(--ok)">✓ 已掌握，不用再复习</button>
        </div>
      </div>
    `).join('');
  }

  // SM-2 间隔预览（与后端 sm2_next 同公式，仅用于按钮文案）
  function sm2Preview(q, rating) {
    const reps = q.reps || 0;
    const ease = Math.min(2.8, Math.max(1.3, q.ease || 2.5));
    const cur = Math.max(1, q.reviewInterval || 0);
    if (rating === 'forgot') return '明天';
    const r = reps + 1;
    let base = r === 1 ? 1 : r === 2 ? 6 : Math.round(cur * ease);
    if (rating === 'easy') base = Math.round(base * 1.3);
    const days = Math.min(180, Math.max(1, base));
    return days + ' 天后';
  }

  $('#reviewList').addEventListener('click', async e => {
    const grade = e.target.closest('.rev-grade');
    const known = e.target.closest('.rev-known');
    if (!grade && !known) return;
    const id = (grade || known).closest('.q-card').dataset.id;
    const q = store.get(id);
    if (!q) return;
    if (known) {
      await store.update(id, { mastery: '已掌握' });
      toast('很好，这题不再安排复习');
    } else {
      const rating = grade.dataset.rating;
      const resp = await fetch('/api/review/' + encodeURIComponent(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      });
      if (!resp.ok) {
        const info = await resp.json().catch(() => ({}));
        toast((info.detail && info.detail.message) || '操作没成功，再试一次');
        return;
      }
      const updated = await resp.json();
      toast(rating === 'forgot' ? '没关系，明天再来一遍' : `记住了，${updated.reviewInterval} 天后再见`);
    }
    await refreshAll();
  });

  /* ================= 模考模式 ================= */
  let examTimer = null;

  $('#btnExam').addEventListener('click', () => {
    if (!lastPicked.length && !generatePaper()) return;
    openExam(lastPicked);
  });

  function openExam(list) {
    const minutes = Math.max(5, list.length * 2);
    $('#examTitle').textContent = `模考 · ${list.length} 题`;
    $('#examHint').textContent = `每题约 2 分钟，共 ${minutes} 分钟。做完点「交卷」对照答案自己判分。`;
    $('#examBody').innerHTML = list.map((q, i) => `
      <div class="exam-q" data-i="${i}">
        <div class="pq-text"><b>${i + 1}.</b> ${esc(q.text)}</div>
        ${(q.images && q.images.length) ? `<div class="q-imgs">${q.images.map(n =>
          `<img src="/images/${esc(n)}" class="img-thumb" alt="">`).join('')}</div>` : ''}
        <textarea class="exam-input" rows="2" placeholder="在这里打草稿或写答案（不用判分，交卷后自己对照）"></textarea>
      </div>
    `).join('');
    $('#examSubmit').textContent = '交卷';
    $('#examSubmit').dataset.stage = 'answer';
    $('#examOverlay').hidden = false;
    const deadline = Date.now() + minutes * 60 * 1000;
    clearInterval(examTimer);
    examTimer = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      $('#examTimer').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (left === 0) {
        clearInterval(examTimer);
        toast('时间到！点「交卷」对照答案');
      }
    }, 500);
  }

  $('#examClose').addEventListener('click', () => {
    clearInterval(examTimer);
    $('#examOverlay').hidden = true;
  });

  $('#examSubmit').addEventListener('click', async () => {
    const btn = $('#examSubmit');
    if (btn.dataset.stage === 'answer') {
      // 交卷 → 展示答案与自评
      clearInterval(examTimer);
      $('#examBody').innerHTML = lastPicked.map((q, i) => `
        <div class="exam-q">
          <div class="pq-text"><b>${i + 1}.</b> ${esc(q.text)}</div>
          <div class="q-answer"><b>参考答案：</b>${esc(q.answer || '（暂无答案）')}</div>
          <div class="exam-grade">
            <span>这题你会了吗？</span>
            <button type="button" class="btn small exam-yes" data-id="${esc(q.id)}">会</button>
            <button type="button" class="btn danger small exam-no" data-id="${esc(q.id)}">不会</button>
          </div>
        </div>
      `).join('');
      btn.textContent = '完成';
      btn.dataset.stage = 'done';
      $('#examHint').textContent = '逐题自评：「不会」的题会自动安排明天复习。';
      return;
    }
    // 完成 → 关闭
    clearInterval(examTimer);
    $('#examOverlay').hidden = true;
    await refreshAll();
  });

  $('#examBody').addEventListener('click', async e => {
    const yes = e.target.closest('.exam-yes');
    const no = e.target.closest('.exam-no');
    if (!yes && !no) return;
    const id = (yes || no).dataset.id;
    const row = (yes || no).closest('.exam-grade');
    row.innerHTML = yes
      ? '<span style="color:var(--ok)">已标记：会 ✓</span>'
      : '<span style="color:var(--danger)">已标记：不会，明天再练</span>';
    if (yes) {
      await store.update(id, { mastery: '已掌握' });
    } else {
      await store.update(id, { mastery: '未掌握', reviewInterval: 0, nextReviewAt: todayStr() });
    }
  });

  /* ================= 数据管理 ================= */
  $('#btnExport').addEventListener('click', async () => {
    let text;
    try {
      text = await store.exportJSON();
    } catch (err) {
      toast('导出失败：' + err.message);
      return;
    }
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `错题集备份-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('备份文件已下载');
  });

  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        if (!confirm(T.confirmImport.replace('{n}', store.all().length))) return;
        const n = await store.importJSON(reader.result);
        await refreshAll();
        switchView('bank');
        toast(`已导入 ${n} 道题`);
      } catch (err) {
        toast('导入失败：' + err.message);
      }
    };
    reader.readAsText(f);
  });

  $('#btnSample').addEventListener('click', async () => {
    if (!confirm(T.confirmSample)) return;
    const n = await store.loadSamples();
    await refreshAll();
    toast(`已加载 ${n} 道示例`);
  });

  /* ================= 初始化 ================= */
  // 💡 提示内容从文案表注入
  function initHints() {
    $$('.hint-tip').forEach(el => {
      el.setAttribute('data-tip', T[el.dataset.tipKey] || '');
    });
    $('#aiSplitSub').textContent = T.aiSplitSub;
    $('#aiSolveSub').textContent = T.aiSolveSub;
    $('#aiTagSub').textContent = T.aiTagSub;
    $('#aiQtypeSub').textContent = T.aiQtypeSub;
  }

  function refreshKpSelects() {
    const kps = store.knowledgePoints();
    fillSelect('#fKp', kps, '全部知识点');
    fillSelect('#pKp', kps, '全部知识点');
  }

  // 分类一/二筛选下拉：随学段切换选项与占位文案（K12 用固定枚举，其余用已录值）
  function refreshGradeSubjectSelects(prefix) {
    const stage = $('#' + prefix + 'Stage').value;
    const isK12 = K12_STAGES.includes(stage);
    const pool = store.all().filter(q => !stage || q.stage === stage);
    // 年级选项按学段过滤（修复：选小学不再出现初中/高中）
    const isUni = stage === '大学';
    const grades = isK12 ? gradesForStage(stage)
      : isUni ? [...new Set(UNI_MAJORS.concat(pool.map(q => q.grade).filter(Boolean)))]
      : [...new Set(pool.map(q => q.grade).filter(Boolean))];
    // 科目联动：K12 按年级；大学按门类（内置课程+历史）；其余历史
    const g = $('#' + prefix + 'Grade').value;
    const subjects = isK12
      ? (g && GRADE_SUBJECTS[g] ? GRADE_SUBJECTS[g] : (STAGE_SUBJECTS[stage] || SUBJECTS))
      : isUni
        ? (g && UNI_COURSES[g] ? [...new Set(UNI_COURSES[g].concat(pool.filter(q => q.grade === g).map(q => q.subject).filter(Boolean)))] : [...new Set(pool.map(q => q.subject).filter(Boolean))])
        : [...new Set(pool.map(q => q.subject).filter(Boolean))];
    fillSelect('#' + prefix + 'Grade', grades, isK12 ? '全部年级' : '全部' + (stage === '大学' ? '专业门类' : stage === '职业考试' ? '考试' : '分类一'));
    fillSelect('#' + prefix + 'Subject', subjects, isK12 ? '全部科目' : '全部' + (stage === '大学' ? '课程' : '科目'));
    const termSel = $('#' + prefix + 'Term');
    // 学期/学年筛选：K12 显示学期(上/下)，大学显示学年(大一~大四)，其余隐藏
    const termWrap = termSel ? termSel.parentElement : null;
    if (termWrap && termWrap.tagName === 'LABEL') termWrap.style.display = (isK12 || isUni) ? '' : 'none';
    if (termSel) termSel.style.display = (isK12 || isUni) ? '' : 'none';
    if (isK12) {
      fillSelect(termSel, TERMS, '全部学期');
    } else if (isUni) {
      fillSelect(termSel, UNI_YEARS, '全部学年');
    } else {
      termSel && (termSel.value = '');
    }
    // term 标签
    const termLabel = $('#' + prefix + 'TermLabel');
    if (termLabel) termLabel.textContent = isK12 ? '学期' : isUni ? '学年' : '';
  }

  ['f', 'p', 'a'].forEach(prefix => {
    $('#' + prefix + 'Stage').addEventListener('change', () => {
      refreshGradeSubjectSelects(prefix);
      if (prefix === 'f') renderBank();
      if (prefix === 'a') renderAnalysis();
    });
  });

  async function refreshAll() {
    await store.reload();
    refreshKpSelects();
    ['f', 'p', 'a'].forEach(refreshGradeSubjectSelects);
    renderBank();
    renderAnalysis();
    renderReview();
  }

  CJT.refresh = refreshAll;

  function showFatalError() {
    $('#fatalError').hidden = false;
    $('.shell').style.display = 'none';
  }

  async function init() {
    // 先加载服务端偏好（主题/侧栏折叠/学段/引导标记），再渲染 UI
    await Prefs.load();
    // 学段不持久化：每次启动都从「未选择」开始，用户必须显式点击才算选定（门禁语义）
    curStage = '';

    applyTheme();
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
      setCollapsed(true);
    } else {
      setCollapsed(Prefs.get('collapsed') === '1');
    }

    renderStageChips();

    // 后续每步用 try-catch 隔离：一个组件出错不影响其他渲染（学段 chips 已在上面确保渲染）
    const safe = (fn) => { try { fn(); } catch (e) { console.error('init 步骤失败：', e); } };
    safe(() => fillSelect('#impTerm', TERMS, null));
    safe(() => fillSelect('#impSubject', SUBJECTS, null));
    safe(() => fillSelect('#mTerm', TERMS, null));
    safe(() => fillSelect('#mSubject', SUBJECTS, null));
    safe(() => fillSelect('#fStage', STAGES, '全部学段'));
    safe(() => fillSelect('#pStage', STAGES, '全部学段'));
    safe(() => fillSelect('#aStage', STAGES, '全部学段'));
    safe(() => ['f', 'p', 'a'].forEach(refreshGradeSubjectSelects));
    safe(() => fillSelect('#fTerm', TERMS, '全部学期'));
    safe(() => fillSelect('#pTerm', TERMS, '全部学期'));
    safe(() => fillSelect('#fMastery', MASTERY, '全部状态'));
    safe(() => fillSelect('#pMastery', MASTERY, '全部状态'));
    safe(() => fillSelect('#mQtype', qtypeOptions(curStage), null));

    safe(() => renderClassifyUI('imp'));
    safe(() => renderClassifyUI('m'));
    safe(() => updateImportLock());

    safe(() => initHints());
    safe(() => initPdfUI());
    safe(() => initManualForm());

    // 学段 chips
    $('#stageChips').addEventListener('click', e => {
      const chip = e.target.closest('.stage-chip');
      if (!chip) return;
      curStage = chip.dataset.stage;
      saveStage();
      renderStageChips();
      renderClassifyUI('imp');
      renderClassifyUI('m');
      fillSelect('#mQtype', qtypeOptions(curStage), null);
      renderPreview();
      updateImportLock();
      updateSteps();
    });

    // 大学/职考：分类一输入时刷新分类二建议；K12：年级变化时刷新科目列表
    ['impGradeInput', 'mGradeInput'].forEach(id => {
      $('#' + id).addEventListener('input', () => renderClassifyUI(id.startsWith('imp') ? 'imp' : 'm'));
    });
    ['impGrade', 'mGrade'].forEach(id => {
      $('#' + id).addEventListener('change', () => renderClassifyUI(id.startsWith('imp') ? 'imp' : 'm'));
    });
    // 筛选页：年级变化时刷新科目筛选项
    ['fGrade', 'pGrade'].forEach(id => {
      $('#' + id).addEventListener('change', () => refreshGradeSubjectSelects(id[0]));
    });

    window.addEventListener('cjt:migrated', e => {
      toast(`已把浏览器里的旧数据迁到本地数据库（${e.detail} 道题）`);
    });

    try {
      await store.init();
    } catch (err) {
      showFatalError();
      return;
    }
    await refreshAll();
    initOnboard();
    updateSteps();
  }

  init();
})();
