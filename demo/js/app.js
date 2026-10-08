/* 主逻辑：导航、PDF 导入 UI、手动录入、错题集、组卷打印、知识点分析、数据管理 */
(function () {
  const CJT = window.CJT;
  const { GRADES, TERMS, SUBJECTS, MASTERY } = CJT.CONST;
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
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function setStatus(el, msg, type) {
    el.textContent = msg;
    el.className = 'status' + (type ? ' ' + type : '');
  }

  /* ================= AI 通用封装 ================= */
  let aiLoading = 0;

  /** 统一 AI 请求封装：loading 态 + 错误 toast（区分未配置 Key / 网络 / 输出异常 / 后端不可达） */
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
        toast('无法连接后端服务，请在项目根目录运行：uvicorn server.main:app --port 8000');
        return null;
      }
      if (!resp.ok) {
        let info = {};
        try { info = (await resp.json()).detail || {}; } catch (e) { /* 保留默认 */ }
        const type = info.type || 'unknown';
        const msg = info.message || ('请求失败（HTTP ' + resp.status + '）');
        if (type === 'config_error') toast('未配置 API Key：请打开「AI 设置」配置，或选择 Mock 厂商');
        else if (type === 'auth_error') toast('鉴权失败：请检查 API Key 是否正确');
        else if (type === 'network_error') toast('网络错误：无法连接 AI 厂商接口。' + msg);
        else if (type === 'output_error') toast('模型输出异常：' + msg);
        else toast(msg);
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
  function initAiSettings() {
    $('#btnAiSettings').addEventListener('click', openAiSettings);
  }

  async function openAiSettings() {
    openModal('AI 设置');
    const body = $('#modalBody');
    body.innerHTML = '<p class="hint">正在加载配置…</p>';
    const [provData, st] = [await fetchJSON('/api/providers'), await fetchJSON('/api/settings')];
    if (!provData || !st) {
      body.innerHTML = '<p class="status err">无法连接本地服务。桌面版请直接双击应用图标；源码模式请在项目根目录运行 <code>uvicorn server.main:app --port 8000</code> 或 <code>python launcher.py</code> 后重试。</p>';
      return;
    }
    const providers = provData.providers;
    body.innerHTML = `
      <div class="ai-set-form">
        <label class="field">
          <span class="field-label">厂商</span>
          <select id="aiProvider">
            ${providers.map(p => `<option value="${esc(p.id)}" ${st.provider === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </label>
        <div class="ai-set-row">
          <label class="field">
            <span class="field-label">Base URL</span>
            <input type="text" id="aiBaseUrl" placeholder="OpenAI 兼容接口地址">
          </label>
          <label class="field">
            <span class="field-label">模型</span>
            <input type="text" id="aiModel" list="aiModelList" placeholder="模型名">
            <datalist id="aiModelList"></datalist>
          </label>
        </div>
        <label class="field">
          <span class="field-label">API Key（${st.has_key ? '已保存 ' + esc(st.api_key_masked) : '未配置'}）</span>
          <input type="password" id="aiKey" placeholder="${st.has_key ? '留空则保持不变' : '请输入 API Key'}">
        </label>
        <div class="ai-set-row">
          <button class="btn primary" id="aiSave" type="button">保存设置</button>
          <button class="btn" id="aiTest" type="button">测试连接</button>
          <span class="hint" style="margin:0">Mock 厂商无需 Key，用于离线联调。</span>
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
    // 初始回填当前配置
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
      if (!saved) { toast('保存失败：无法连接后端'); return; }
      toast('AI 设置已保存');
      openAiSettings(); // 重新渲染，刷新打码 Key
    });

    $('#aiTest').addEventListener('click', async () => {
      const box = $('#aiTestResult');
      box.innerHTML = '<p class="hint">测试中…</p>';
      const res = await callAI('/ai/test', {});
      if (res && res.ok) {
        box.innerHTML = `<p class="ai-test-result ok">连接成功：${esc(res.reply || '')}</p>`;
      } else {
        box.innerHTML = '<p class="ai-test-result err">连接失败，请根据上方提示检查配置。</p>';
      }
    });
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

  /* ---------- Tab 导航 ---------- */
  function switchView(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'bank') renderBank();
    if (name === 'analysis') renderAnalysis();
  }
  $('#tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (btn) switchView(btn.dataset.view);
  });

  /* ---------- 通用筛选 ---------- */
  function filterQuestions(source, f) {
    const kw = (f.keyword || '').trim().toLowerCase();
    return source.filter(q => {
      if (f.grade && q.grade !== f.grade) return false;
      if (f.term && q.term !== f.term) return false;
      if (f.subject && q.subject !== f.subject) return false;
      if (f.kp && !(q.knowledgePoints || []).includes(f.kp)) return false;
      if (f.mastery && q.mastery !== f.mastery) return false;
      if (f.onlyWrong && !q.isWrong) return false;
      if (kw) {
        const hay = [q.text, q.answer, q.wrongReason, ...(q.knowledgePoints || [])].join(' ').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
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
      setStatus(status, '请选择 PDF 文件', 'err');
      return;
    }
    setStatus(status, '正在解析 PDF，请稍候……');
    pdfItems = [];
    renderPreview();
    try {
      const text = await CJT.pdf.extractText(file);
      if (!text) {
        setStatus(status, '该 PDF 为扫描件，demo 版本仅支持文本型 PDF', 'err');
        return;
      }
      const parts = CJT.pdf.splitQuestions(text);
      if (!parts.length) {
        setStatus(status, '未能按题号识别出题目，请检查 PDF 是否为带题号的练习卷', 'err');
        return;
      }
      pdfFileName = file.name;
      pdfItems = parts.map(p => ({ num: p.num, text: p.text, isWrong: true, kps: '' }));
      setStatus(status, `解析成功：${file.name}，共识别 ${parts.length} 道题。`, 'ok');
      $('#importMeta').hidden = false;
      $('#impCount').textContent = parts.length;
      renderPreview();
    } catch (err) {
      console.error(err);
      setStatus(status, '解析失败：' + (err && err.message ? err.message : err), 'err');
    }
  }

  function renderPreview() {
    const list = $('#previewList');
    $('#impCount').textContent = pdfItems.length;
    $('#importMeta').hidden = pdfItems.length === 0;
    list.innerHTML = pdfItems.map((it, i) => `
      <div class="preview-item" data-i="${i}">
        <div class="preview-head">
          <span class="preview-num">第 ${esc(it.num)} 题</span>
          <span class="spacer"></span>
          <label class="check-field" style="font-size:13px">
            <input type="checkbox" class="pv-wrong" ${it.isWrong ? 'checked' : ''}>
            <span>标记为错题</span>
          </label>
          <button type="button" class="btn danger small pv-del">删除</button>
        </div>
        <textarea rows="3" class="pv-text">${esc(it.text)}</textarea>
        <input type="text" class="pv-kp" style="margin-top:6px" placeholder="知识点（逗号分隔，可点上方「全部 AI 打标」自动填充）" value="${esc(it.kps || '')}">
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
    const payload = pdfItems.map(it => ({
      text: it.text,
      answer: '',
      grade: $('#impGrade').value,
      term: $('#impTerm').value,
      subject: $('#impSubject').value,
      knowledgePoints: String(it.kps || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean),
      isWrong: it.isWrong,
      wrongReason: '',
      mastery: '未掌握',
      sourceFile: pdfFileName
    }));
    const n = await store.addMany(payload);
    pdfItems = [];
    pdfFileName = '';
    renderPreview();
    setStatus($('#pdfStatus'), `已入库 ${n} 道题。`, 'ok');
    await refreshAll();
    toast(`成功导入 ${n} 道题`);
  }

  /* ---------- AI 校对切分 / 批量打标 ---------- */
  async function aiSplitCheck() {
    if (!pdfItems.length) {
      toast('请先上传并解析 PDF');
      return;
    }
    const res = await callAI('/ai/split-check', {
      items: pdfItems.map(it => ({ text: it.text })),
      grade: $('#impGrade').value,
      term: $('#impTerm').value,
      subject: $('#impSubject').value
    });
    if (!res) return;
    pdfItems = res.items.map((it, i) => ({
      num: i + 1,
      text: it.text,
      isWrong: pdfItems[i] ? pdfItems[i].isWrong : true,
      kps: pdfItems[i] ? pdfItems[i].kps : ''
    }));
    renderPreview();
    toast(`AI 校对完成：共 ${res.items.length} 道题（每题已标注题型）`);
  }

  async function aiTagAll() {
    if (!pdfItems.length) {
      toast('请先上传并解析 PDF');
      return;
    }
    const grade = $('#impGrade').value;
    const term = $('#impTerm').value;
    const subject = $('#impSubject').value;
    let done = 0;
    for (let i = 0; i < pdfItems.length; i++) {
      const res = await callAI('/ai/tag', {
        question: pdfItems[i].text, grade, term, subject
      }, { loadingText: `AI 打标中（${i + 1}/${pdfItems.length}）` });
      if (!res) {
        toast(`打标中断：第 ${i + 1} 题请求失败，已完成 ${done} 道`);
        renderPreview();
        return;
      }
      pdfItems[i].kps = (res.knowledge_points || []).map(k => k.name).join('，');
      done++;
    }
    renderPreview();
    toast(`已为 ${done} 道题完成 AI 打标，可在预览中修改`);
  }

  /* ================= 手动录入 ================= */
  function initManualForm() {
    $('#manualForm').addEventListener('submit', async e => {
      e.preventDefault();
      const text = $('#mText').value.trim();
      if (!text) {
        toast('请填写题干');
        return;
      }
      await store.add({
        text,
        answer: $('#mAnswer').value.trim(),
        grade: $('#mGrade').value,
        term: $('#mTerm').value,
        subject: $('#mSubject').value,
        knowledgePoints: $('#mKp').value.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
        isWrong: $('#mWrong').checked,
        wrongReason: $('#mReason').value.trim(),
        mastery: '未掌握',
        sourceFile: '手动录入'
      });
      e.target.reset();
      $('#mWrong').checked = true;
      await refreshAll();
      toast('已保存题目');
    });

    $('#btnAiTag').addEventListener('click', async () => {
      const text = $('#mText').value.trim();
      if (!text) {
        toast('请先填写题干再打标');
        return;
      }
      const res = await callAI('/ai/tag', {
        question: text,
        grade: $('#mGrade').value,
        term: $('#mTerm').value,
        subject: $('#mSubject').value
      });
      if (!res) return;
      const names = (res.knowledge_points || []).map(k => k.name);
      $('#mKp').value = names.join('，');
      toast(`AI 打标完成：${names.join('、')}`);
    });

    $('#btnAiSolve').addEventListener('click', async () => {
      const text = $('#mText').value.trim();
      if (!text) {
        toast('请先填写题干再生成解答');
        return;
      }
      const res = await callAI('/ai/solve', {
        question: text,
        grade: $('#mGrade').value,
        term: $('#mTerm').value,
        subject: $('#mSubject').value
      });
      if (!res) return;
      $('#mAnswer').value = res.answer + (res.explanation ? '\n解析：' + res.explanation : '');
      toast('已生成答案与解析，可修改后保存');
    });
  }

  /* ================= 错题集 ================= */
  function bankFilters() {
    return {
      grade: $('#fGrade').value,
      term: $('#fTerm').value,
      subject: $('#fSubject').value,
      kp: $('#fKp').value,
      mastery: $('#fMastery').value,
      keyword: $('#fKeyword').value
    };
  }

  function renderBank() {
    const list = filterQuestions(store.all(), bankFilters());
    $('#bankCount').textContent = `${list.length} 题`;
    $('#bankEmpty').hidden = list.length > 0;
    $('#bankList').innerHTML = list.map(q => `
      <div class="q-card" data-id="${esc(q.id)}">
        <div class="q-head">
          <div class="q-badges">
            <span class="badge">${esc(q.subject)}</span>
            <span class="badge">${esc(q.grade)}（${esc(q.term)}）</span>
            ${q.isWrong ? '<span class="badge wrong">错题</span>' : '<span class="badge normal">普通题目</span>'}
            ${q.wrongReason ? `<span class="reason-tag">原因：${esc(q.wrongReason)}</span>` : ''}
          </div>
        </div>
        <div class="q-text">${esc(q.text)}</div>
        ${q.answer ? `<div class="q-answer"><b>答案/解析：</b>${esc(q.answer)}</div>` : ''}
        ${q.knowledgePoints.length ? `<div class="q-kps">${q.knowledgePoints.map(k =>
          `<span class="kp-chip" data-kp="${esc(k)}" title="点击按该知识点筛选">${esc(k)}</span>`).join('')}</div>` : ''}
        <div class="q-foot">
          <span>${q.sourceFile ? '来源：' + esc(q.sourceFile) : ''}</span>
          <span>${fmtDate(q.createdAt)}</span>
          <span class="spacer"></span>
          <label>掌握状态
            <select class="q-mastery">
              ${MASTERY.map(m => `<option value="${esc(m)}" ${q.mastery === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
            </select>
          </label>
          <button type="button" class="btn small q-similar">生成同类题</button>
          <button type="button" class="btn danger small q-del">删除</button>
        </div>
      </div>
    `).join('');
  }

  ['fGrade', 'fTerm', 'fSubject', 'fKp', 'fMastery'].forEach(id =>
    $('#' + id).addEventListener('change', renderBank));
  $('#fKeyword').addEventListener('input', renderBank);
  $('#btnClearFilter').addEventListener('click', () => {
    ['fGrade', 'fTerm', 'fSubject', 'fKp', 'fMastery'].forEach(id => { $('#' + id).value = ''; });
    $('#fKeyword').value = '';
    renderBank();
  });

  $('#bankList').addEventListener('change', async e => {
    const sel = e.target.closest('.q-mastery');
    if (!sel) return;
    const id = sel.closest('.q-card').dataset.id;
    await store.update(id, { mastery: sel.value });
    toast('掌握状态已更新');
  });
  $('#bankList').addEventListener('click', async e => {
    const del = e.target.closest('.q-del');
    if (del) {
      const id = del.closest('.q-card').dataset.id;
      if (confirm('确定删除这道题吗？')) {
        await store.remove(id);
        renderBank();
        renderAnalysis();
        refreshKpSelects();
        toast('已删除');
      }
      return;
    }
    const sim = e.target.closest('.q-similar');
    if (sim) {
      const id = sim.closest('.q-card').dataset.id;
      const q = store.get(id);
      if (!q) return;
      showSimilarModal('生成同类题', {
        question: q.text,
        knowledge_points: q.knowledgePoints,
        count: 3,
        grade: q.grade, term: q.term, subject: q.subject
      }, {
        grade: q.grade, term: q.term, subject: q.subject,
        knowledgePoints: q.knowledgePoints
      }, { printable: false });
      return;
    }
    const chip = e.target.closest('.kp-chip');
    if (chip) {
      $('#fKp').value = chip.dataset.kp;
      renderBank();
    }
  });

  /* ---------- 同类题弹层（错题集「生成同类题」/ 知识点分析「AI 出题」共用） ---------- */
  async function showSimilarModal(title, request, inherit, opts) {
    opts = opts || {};
    openModal(title, `
      <button class="btn" id="mClose2" type="button">关闭</button>
      ${opts.printable ? '<button class="btn" id="mPrintSel" type="button">选中组卷打印</button>' : ''}
      <button class="btn primary" id="mAddSel" type="button">加入题库</button>
    `);
    const body = $('#modalBody');
    body.innerHTML = '<p class="hint">AI 生成中…（Mock 厂商将返回模拟数据）</p>';
    const res = await callAI('/ai/similar', request);
    if (!res) {
      body.innerHTML = '<p class="status err">生成失败，请打开「AI 设置」检查厂商配置，或切换 Mock 厂商。</p>';
      $('#mAddSel').hidden = true;
      return;
    }
    const qs = res.questions || [];
    if (!qs.length) {
      body.innerHTML = '<p class="hint">未生成题目，请重试。</p>';
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
        sourceFile: 'AI 生成同类题'
      }, inherit)));
      await refreshAll();
      closeModal();
      toast(`已加入题库 ${sel.length} 道题`);
    });
    if (opts.printable) {
      $('#mPrintSel').addEventListener('click', () => {
        const sel = selected();
        if (!sel.length) {
          toast('请勾选要打印的题目');
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
    const title = '错题练习卷';
    const questions = list.map((q, i) => `
      <div class="paper-q">
        <div class="pq-text"><b>${i + 1}.</b> ${esc(q.text)}</div>
        <div class="answer-blank"></div>
      </div>
    `).join('');
    const answers = withAnswers
      ? `<div class="answer-page">
           <h2>参考答案与解析</h2>
           ${list.map((q, i) => `
             <div class="answer-item">
               <b>${i + 1}.</b> ${esc(q.answer || '（暂无答案）')}
               ${q.knowledgePoints.length ? `<br><span style="color:#666">知识点：${esc(q.knowledgePoints.join('、'))}</span>` : ''}
             </div>`).join('')}
         </div>`
      : '';
    return `
      <div class="paper-sheet">
        <h1>${title}</h1>
        <div class="paper-meta">
          <span>姓名<span class="paper-line"></span></span>
          <span>日期<span class="paper-line"></span></span>
          <span>得分<span class="paper-line"></span></span>
        </div>
        ${questions}
        ${answers}
      </div>`;
  }

  function generatePaper() {
    const pool = filterQuestions(store.all(), paperFilters());
    if (!pool.length) {
      toast('没有符合条件的题目');
      $('#paperPreview').innerHTML = '';
      $('#print-area').innerHTML = '';
      $('#btnPrint').disabled = true;
      return false;
    }
    const count = Math.max(1, Math.min(parseInt($('#pCount').value, 10) || 10, pool.length));
    const picked = shuffle(pool).slice(0, count);
    const withAnswers = $('#pWithAnswers').checked;
    const html = buildPaperHTML(picked, withAnswers);
    $('#paperPreview').innerHTML = html;
    $('#print-area').innerHTML = html;
    $('#btnPrint').disabled = false;
    $('#paperHint').textContent = `已从 ${pool.length} 道候选题中抽取 ${picked.length} 道${withAnswers ? '，附答案页' : ''}。点击「打印」输出试卷。`;
    return true;
  }

  $('#btnGenPaper').addEventListener('click', generatePaper);
  $('#btnPrint').addEventListener('click', () => {
    if (!$('#print-area').innerHTML.trim()) {
      if (!generatePaper()) return;
    }
    window.print();
  });

  /* ================= 知识点分析 ================= */
  function renderAnalysis() {
    const wrong = store.all().filter(q => q.isWrong);
    const counts = new Map();
    wrong.forEach(q => (q.knowledgePoints || []).forEach(k => {
      counts.set(k, (counts.get(k) || 0) + 1);
    }));
    const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    $('#analysisCount').textContent = `${counts.size} 个知识点`;
    const chart = $('#analysisChart');
    $('#analysisEmpty').hidden = wrong.length > 0;
    if (!rows.length) {
      chart.innerHTML = '<p class="chart-empty">暂无错题知识点数据</p>';
      return;
    }
    const max = rows[0][1];
    chart.innerHTML = rows.map(([kp, n], i) => `
      <div class="chart-row">
        <span class="chart-label" data-kp="${esc(kp)}" title="点击针对「${esc(kp)}」抽题组卷">${i + 1}. ${esc(kp)}</span>
        <div class="chart-track"><div class="chart-bar" style="width:${Math.max(4, (n / max) * 100)}%"></div></div>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="chart-count">${n} 次</span>
          <button class="btn small ai-gen" data-kp="${esc(kp)}" type="button">AI 出题</button>
        </span>
      </div>
    `).join('');
  }

  $('#analysisChart').addEventListener('click', e => {
    const gen = e.target.closest('.ai-gen');
    if (gen) {
      const kp = gen.dataset.kp;
      const pool = store.all().filter(q => q.isWrong && (q.knowledgePoints || []).includes(kp));
      const base = pool[Math.floor(Math.random() * pool.length)];
      showSimilarModal(`AI 出题：${kp}`, {
        question: base ? base.text : `请围绕知识点「${kp}」出练习题`,
        knowledge_points: [kp],
        count: 5,
        grade: base ? base.grade : '',
        term: base ? base.term : '',
        subject: base ? base.subject : ''
      }, {
        grade: base ? base.grade : GRADES[0],
        term: base ? base.term : '上',
        subject: base ? base.subject : '数学',
        knowledgePoints: [kp]
      }, { printable: true });
      return;
    }
    const label = e.target.closest('.chart-label');
    if (!label) return;
    ['pGrade', 'pTerm', 'pSubject', 'pMastery'].forEach(id => { $('#' + id).value = ''; });
    $('#pOnlyWrong').checked = true;
    $('#pKp').value = label.dataset.kp;
    switchView('paper');
    generatePaper();
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
    a.download = `cuotiji-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出 JSON 文件');
  });

  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
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
    if (!confirm('加载示例数据将覆盖当前全部题目，确定继续吗？')) return;
    const n = await store.loadSamples();
    await refreshAll();
    toast(`已加载 ${n} 道示例错题`);
  });

  /* ================= 初始化 ================= */
  function refreshKpSelects() {
    const kps = store.knowledgePoints();
    fillSelect('#fKp', kps, '全部知识点');
    fillSelect('#pKp', kps, '全部知识点');
  }

  async function refreshAll() {
    await store.reload();
    refreshKpSelects();
    renderBank();
    renderAnalysis();
  }

  CJT.refresh = refreshAll;

  /** 后端不可达时的引导页（现在必须依赖本地服务，不再支持 file:// 双击） */
  function showFatalError() {
    const overlay = $('#fatalError');
    $('#app').style.display = 'none';
    overlay.hidden = false;
  }

  async function init() {
    // 下拉选项
    fillSelect('#impGrade', GRADES, null);
    fillSelect('#impTerm', TERMS, null);
    fillSelect('#impSubject', SUBJECTS, null);
    fillSelect('#mGrade', GRADES, null);
    fillSelect('#mTerm', TERMS, null);
    fillSelect('#mSubject', SUBJECTS, null);
    fillSelect('#fGrade', GRADES, '全部年级');
    fillSelect('#fTerm', TERMS, '全部学期');
    fillSelect('#fSubject', SUBJECTS, '全部科目');
    fillSelect('#fMastery', MASTERY, '全部状态');
    fillSelect('#pGrade', GRADES, '全部年级');
    fillSelect('#pTerm', TERMS, '全部学期');
    fillSelect('#pSubject', SUBJECTS, '全部科目');
    fillSelect('#pMastery', MASTERY, '全部状态');

    initPdfUI();
    initManualForm();
    initAiSettings();

    // 首启迁移提示
    window.addEventListener('cjt:migrated', e => {
      toast(`已将浏览器数据迁移到本地数据库（${e.detail} 道题）`);
    });

    try {
      await store.init();
    } catch (err) {
      showFatalError();
      return;
    }
    refreshAll();
  }

  init();
})();
