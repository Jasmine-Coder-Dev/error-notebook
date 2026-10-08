/* 数据层：远端 SQLite 存储（fetch 封装 + 内存缓存）。

localStorage 仅用于一次性迁移标记：
- 首启检测到旧 cuotiji_questions 数据且服务端为空 → 自动批量导入；
- 成功后写 cuotiji_migrated 标记并派发 cjt:migrated 事件（app.js toast）。
后端不可达时 init() 抛错，由 app.js 显示引导页（不再支持 file:// 双击模式）。
*/
(function () {
  const CJT = (window.CJT = window.CJT || {});

  const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
    '七年级', '八年级', '九年级', '高一', '高二', '高三'];
  const TERMS = ['上', '下'];
  const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
  const MASTERY = ['未掌握', '复习中', '已掌握'];

  const LS_DATA_KEY = 'cuotiji_questions';
  const LS_MIGRATED_KEY = 'cuotiji_migrated';

  let questions = []; // 内存缓存，all()/get()/knowledgePoints() 同步读

  async function api(path, opts) {
    opts = opts || {};
    let resp;
    try {
      resp = await fetch('/api' + path, {
        method: opts.method || 'GET',
        headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      const err = new Error('无法连接本地服务');
      err.kind = 'unreachable';
      throw err;
    }
    if (!resp.ok) {
      let info = {};
      try { info = (await resp.json()).detail || {}; } catch (e) { /* 保留默认 */ }
      const err = new Error(info.message || ('请求失败（HTTP ' + resp.status + '）'));
      err.kind = info.type || 'http_' + resp.status;
      throw err;
    }
    return resp.json();
  }

  /* ---------- 首启迁移：localStorage → SQLite ---------- */
  async function migrateIfNeeded() {
    if (localStorage.getItem(LS_MIGRATED_KEY)) return;
    const raw = localStorage.getItem(LS_DATA_KEY);
    if (!raw) {
      localStorage.setItem(LS_MIGRATED_KEY, '1');
      return;
    }
    let old = [];
    try { old = JSON.parse(raw); } catch (e) { old = []; }
    if (!Array.isArray(old) || !old.length) {
      localStorage.setItem(LS_MIGRATED_KEY, '1');
      return;
    }
    // 仅当服务端为空时导入，避免重复
    const server = await api('/questions');
    if ((server.questions || []).length) {
      localStorage.setItem(LS_MIGRATED_KEY, '1');
      return;
    }
    const r = await api('/questions', { method: 'POST', body: old });
    localStorage.setItem(LS_MIGRATED_KEY, '1');
    window.dispatchEvent(new CustomEvent('cjt:migrated', { detail: r.inserted || 0 }));
  }

  CJT.CONST = { GRADES, TERMS, SUBJECTS, MASTERY };

  CJT.store = {
    all() { return questions.slice(); },
    get(id) { return questions.find(q => q.id === id); },

    /** 初始化：迁移 + 全量加载缓存。后端不可达时抛错（kind='unreachable'）。 */
    async init() {
      await migrateIfNeeded();
      await this.reload();
    },

    async reload() {
      const r = await api('/questions');
      questions = r.questions || [];
      return questions;
    },

    async add(data) {
      const r = await api('/questions', { method: 'POST', body: data });
      const q = (r.questions || [])[0];
      if (q) questions.push(q);
      return q;
    },

    async addMany(list) {
      const r = await api('/questions', { method: 'POST', body: list });
      questions = questions.concat(r.questions || []);
      return r.inserted || 0;
    },

    async update(id, patch) {
      const q = await api('/questions/' + encodeURIComponent(id), { method: 'PUT', body: patch });
      const i = questions.findIndex(x => x.id === id);
      if (i >= 0) questions[i] = q;
      return q;
    },

    async remove(id) {
      await api('/questions/' + encodeURIComponent(id), { method: 'DELETE' });
      questions = questions.filter(q => q.id !== id);
    },

    knowledgePoints() {
      const set = new Set();
      questions.forEach(q => (q.knowledgePoints || []).forEach(k => set.add(k)));
      return Array.from(set).sort();
    },

    async exportJSON() {
      const data = await api('/export');
      return JSON.stringify(data, null, 2);
    },

    async importJSON(text) {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : data.questions;
      if (!Array.isArray(arr)) throw new Error('JSON 格式不正确：缺少 questions 数组');
      const r = await api('/import', { method: 'POST', body: arr });
      await this.reload();
      return r.imported || 0;
    },

    async loadSamples() {
      const r = await api('/import', { method: 'POST', body: SAMPLES });
      await this.reload();
      return r.imported || 0;
    }
  };

  const now = new Date().toISOString();
  const SAMPLES = [
    {
      text: '计算：3/4 × 8/9 = ？',
      answer: '2/3。先约分再相乘：3/4 × 8/9 = (3×8)/(4×9) = 24/36 = 2/3。',
      grade: '五年级', term: '上', subject: '数学',
      knowledgePoints: ['分数乘法', '约分'],
      isWrong: true, wrongReason: '约分时漏掉了公因数', mastery: '复习中',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '一个长方形的长是 12 厘米，宽是 5 厘米，它的面积和周长各是多少？',
      answer: '面积 = 12×5 = 60 平方厘米；周长 = (12+5)×2 = 34 厘米。',
      grade: '三年级', term: '下', subject: '数学',
      knowledgePoints: ['长方形周长', '长方形面积'],
      isWrong: true, wrongReason: '周长公式记错，没乘 2', mastery: '未掌握',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '用所给词的适当形式填空：She ______ (go) to school by bus every day.',
      answer: 'goes。every day 表示一般现在时，主语 she 是第三人称单数，用 goes。',
      grade: '五年级', term: '上', subject: '英语',
      knowledgePoints: ['一般现在时', '动词三单'],
      isWrong: true, wrongReason: '忽略了三单变化', mastery: '复习中',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '根据句意写出词语：他做事总是（jīng dǎ xì suàn），从不浪费一分钱。',
      answer: '精打细算。',
      grade: '四年级', term: '下', subject: '语文',
      knowledgePoints: ['成语积累', '看拼音写词语'],
      isWrong: true, wrongReason: '“精”写成“经”', mastery: '已掌握',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '一辆汽车以 60 km/h 的速度行驶 2.5 小时，一共行驶了多少千米？',
      answer: '60 × 2.5 = 150 千米。',
      grade: '八年级', term: '上', subject: '物理',
      knowledgePoints: ['速度公式', '匀速直线运动'],
      isWrong: true, wrongReason: '单位换算失误', mastery: '未掌握',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '写出铁在氧气中燃烧的化学方程式，并注明反应现象。',
      answer: '3Fe + 2O₂ ==点燃== Fe₃O₄；现象：剧烈燃烧、火星四射、生成黑色固体。',
      grade: '九年级', term: '上', subject: '化学',
      knowledgePoints: ['化学方程式', '氧气性质'],
      isWrong: true, wrongReason: '条件“点燃”漏写', mastery: '复习中',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '简述光合作用的主要场所和产物。',
      answer: '场所：叶绿体；产物：有机物（葡萄糖）和氧气。',
      grade: '七年级', term: '下', subject: '生物',
      knowledgePoints: ['光合作用'],
      isWrong: true, wrongReason: '把场所答成线粒体', mastery: '未掌握',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '秦统一六国后，在地方上推行什么制度？这一制度有什么作用？',
      answer: '郡县制。作用：加强中央对地方的直接管辖，巩固统一。',
      grade: '七年级', term: '上', subject: '历史',
      knowledgePoints: ['秦朝中央集权', '郡县制'],
      isWrong: true, wrongReason: '郡县制与分封制混淆', mastery: '复习中',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '解方程：2x - 7 = 15',
      answer: '2x = 22，x = 11。',
      grade: '七年级', term: '上', subject: '数学',
      knowledgePoints: ['一元一次方程', '移项'],
      isWrong: true, wrongReason: '移项时符号出错', mastery: '已掌握',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '默写：海内存知己，__________。（王勃《送杜少府之任蜀州》）',
      answer: '天涯若比邻。',
      grade: '八年级', term: '下', subject: '语文',
      knowledgePoints: ['古诗词默写'],
      isWrong: true, wrongReason: '“涯”写成“崖”', mastery: '复习中',
      sourceFile: '示例数据', createdAt: now
    }
  ];
})();
