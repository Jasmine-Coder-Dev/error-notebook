/* 数据层：远端 SQLite 存储（fetch 封装 + 内存缓存）。

localStorage 仅用于一次性迁移标记：
- 首启检测到旧 cuotiji_questions 数据且服务端为空 → 自动批量导入；
- 成功后写 cuotiji_migrated 标记并派发 cjt:migrated 事件（app.js toast）。
后端不可达时 init() 抛错，由 app.js 显示引导页（不再支持 file:// 双击模式）。
*/
(function () {
  const CJT = (window.CJT = window.CJT || {});

  const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
    '初一', '初二', '初三', '高一', '高二', '高三'];
  // 各年级所学科目（随课标：物理初二起、化学初三起；道德与法治含政治）
  const GRADE_SUBJECTS = {
    '一年级': ['语文', '数学', '英语'],
    '二年级': ['语文', '数学', '英语'],
    '三年级': ['语文', '数学', '英语', '科学', '道德与法治'],
    '四年级': ['语文', '数学', '英语', '科学', '道德与法治'],
    '五年级': ['语文', '数学', '英语', '科学', '道德与法治'],
    '六年级': ['语文', '数学', '英语', '科学', '道德与法治'],
    '初一': ['语文', '数学', '英语', '历史', '地理', '生物', '道德与法治'],
    '初二': ['语文', '数学', '英语', '物理', '历史', '地理', '生物', '道德与法治'],
    '初三': ['语文', '数学', '英语', '物理', '化学', '历史', '道德与法治'],
    '高一': ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'],
    '高二': ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'],
    '高三': ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']
  };
  // 学段内全科目（未选年级时展示并集）
  const STAGE_SUBJECTS = {
    '小学': ['语文', '数学', '英语', '科学', '道德与法治'],
    '初中': ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治'],
    '高中': ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']
  };
  const TERMS = ['上', '下'];
  const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
  const MASTERY = ['未掌握', '复习中', '已掌握'];
  /* 学段（受众扩展一期，见 docs/受众扩展方案.md §3） */
  const STAGES = ['小学', '初中', '高中', '大学', '职业考试', '其他'];
  const K12_STAGES = ['小学', '初中', '高中'];

  function hasTerm(stage) { return K12_STAGES.includes(stage); }

  function stageOfGrade(grade) {
    if (GRADES.indexOf(grade) <= 5 && grade) return '小学';
    if (['初一', '初二', '初三'].includes(grade)) return '初中';
    if (['高一', '高二', '高三'].includes(grade)) return '高中';
    return '其他';
  }

  /* 题型词表（按学段，种子可扩充） */
  const QTYPE_VOCAB = {
    '小学': ['选择', '填空', '判断', '计算', '应用题', '操作作图', '口算'],
    '初中': ['选择', '填空', '判断', '计算', '应用题', '实验探究', '作图证明', '阅读理解', '作文', '听力'],
    '高中': ['选择', '填空', '判断', '计算', '应用题', '实验探究', '作图证明', '阅读理解', '作文', '听力'],
    '大学': ['选择', '填空', '计算证明', '简答', '论述', '案例分析', '翻译', '作文'],
    '职业考试': ['单选', '多选', '判断', '不定项选择', '计算分析', '简答', '综合题', '案例分析', '申论'],
    '其他': ['选择', '填空', '判断', '计算', '简答', '其他']
  };

  /* 大学学段：专业门类（教育部 12 学科门类+军事学+公共基础）× 课程 × 学年 */
  const UNI_YEARS = ['大一', '大二', '大三', '大四'];
  const UNI_MAJORS = ['公共基础', '工学', '理学', '医学', '经济学', '管理学', '法学', '教育学', '文学', '历史学', '农学', '艺术学', '哲学', '军事学'];
  const UNI_COURSES = {
    '公共基础': ['高等数学', '线性代数', '概率论与数理统计', '大学物理', '大学英语', '程序设计基础', '马克思主义基本原理'],
    '工学': ['数据结构', '电路原理', '模拟电子技术', '数字电子技术', '信号与系统', '理论力学', '材料力学', '机械原理', '操作系统', '数据库原理', '工程图学'],
    '理学': ['数学分析', '高等代数', '解析几何', '常微分方程', '概率统计', '大学物理(理)', '无机化学', '有机化学', '物理化学', '普通生物学'],
    '医学': ['系统解剖学', '组织学与胚胎学', '生理学', '生物化学', '病理学', '药理学', '诊断学', '内科学', '外科学', '妇产科学'],
    '经济学': ['微观经济学', '宏观经济学', '政治经济学', '计量经济学', '财政学', '金融学', '会计学', '统计学'],
    '管理学': ['管理学原理', '市场营销', '财务管理', '人力资源管理', '运筹学', '管理信息系统', '会计学'],
    '法学': ['法理学', '宪法学', '民法学', '刑法学', '民事诉讼法学', '刑事诉讼法学', '行政法与行政诉讼法学', '商法'],
    '教育学': ['教育学原理', '教育心理学', '课程与教学论', '中国教育史', '外国教育史', '教育研究方法'],
    '文学': ['现代汉语', '古代汉语', '中国古代文学', '中国现当代文学', '外国文学', '文学理论', '语言学概论'],
    '历史学': ['中国古代史', '中国近现代史', '世界古代史', '世界近现代史', '历史文选', '史学概论'],
    '农学': ['植物学', '动物学', '遗传学', '作物栽培学', '土壤学', '农业生态学'],
    '艺术学': ['艺术概论', '素描', '色彩', '中国美术史', '外国美术史', '音乐基础理论', '设计基础'],
    '哲学': ['马克思主义哲学', '中国哲学史', '西方哲学史', '逻辑学', '伦理学'],
    '军事学': ['军事理论', '军事思想', '战略学基础']
  };

  /* 分类建议种子（与 catalog.json 种子一致；录入时与输入历史合并去重） */
  const CLASSIFY_SEEDS = {
    '大学': UNI_MAJORS.filter(m => m !== '公共基础').map(m => ({ grade: m, subject: '' })),
    '职业考试': [
      { grade: '中级会计', subject: '中级会计实务' },
      { grade: '中级会计', subject: '财务管理' },
      { grade: '中级会计', subject: '经济法' },
      { grade: '法考', subject: '民法' },
      { grade: '法考', subject: '刑法' },
      { grade: '法考', subject: '诉讼法' },
      { grade: '教资', subject: '科目二（教育知识与能力）' },
      { grade: '公务员', subject: '行测' },
      { grade: '考研', subject: '政治' }
    ],
    '其他': []
  };

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

  CJT.UNI_YEARS = UNI_YEARS;
  CJT.UNI_MAJORS = UNI_MAJORS;
  CJT.UNI_COURSES = UNI_COURSES;
  CJT.GRADE_SUBJECTS = GRADE_SUBJECTS;
  CJT.STAGE_SUBJECTS = STAGE_SUBJECTS;
  CJT.CONST = { GRADES, TERMS, SUBJECTS, MASTERY, STAGES, K12_STAGES, QTYPE_VOCAB, CLASSIFY_SEEDS, hasTerm, stageOfGrade };

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
      grade: '初二', term: '上', subject: '物理',
      knowledgePoints: ['速度公式', '匀速直线运动'],
      isWrong: true, wrongReason: '单位换算失误', mastery: '未掌握',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '写出铁在氧气中燃烧的化学方程式，并注明反应现象。',
      answer: '3Fe + 2O₂ ==点燃== Fe₃O₄；现象：剧烈燃烧、火星四射、生成黑色固体。',
      grade: '初三', term: '上', subject: '化学',
      knowledgePoints: ['化学方程式', '氧气性质'],
      isWrong: true, wrongReason: '条件“点燃”漏写', mastery: '复习中',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '简述光合作用的主要场所和产物。',
      answer: '场所：叶绿体；产物：有机物（葡萄糖）和氧气。',
      grade: '初一', term: '下', subject: '生物',
      knowledgePoints: ['光合作用'],
      isWrong: true, wrongReason: '把场所答成线粒体', mastery: '未掌握',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '秦统一六国后，在地方上推行什么制度？这一制度有什么作用？',
      answer: '郡县制。作用：加强中央对地方的直接管辖，巩固统一。',
      grade: '初一', term: '上', subject: '历史',
      knowledgePoints: ['秦朝中央集权', '郡县制'],
      isWrong: true, wrongReason: '郡县制与分封制混淆', mastery: '复习中',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '解方程：2x - 7 = 15',
      answer: '2x = 22，x = 11。',
      grade: '初一', term: '上', subject: '数学',
      knowledgePoints: ['一元一次方程', '移项'],
      isWrong: true, wrongReason: '移项时符号出错', mastery: '已掌握',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '默写：海内存知己，__________。（王勃《送杜少府之任蜀州》）',
      answer: '天涯若比邻。',
      grade: '初二', term: '下', subject: '语文',
      knowledgePoints: ['古诗词默写'],
      isWrong: true, wrongReason: '“涯”写成“崖”', mastery: '复习中',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '求极限：lim(x→0) sin(3x) / x = ？',
      answer: '3。利用等价无穷小 sin(3x) ~ 3x，原式 = lim 3x/x = 3。',
      grade: '公共基础', subject: '高等数学', term: '大一',
      knowledgePoints: ['极限', '等价无穷小'],
      isWrong: true, wrongReason: '等价无穷小替换条件记错', mastery: '未掌握',
      qtype: '计算证明', stage: '大学',
      sourceFile: '示例数据', createdAt: now
    },
    {
      text: '（单选）企业取得长期股权投资时，初始投资成本小于应享有被投资单位可辨认净资产公允价值份额的，其差额应计入（　）。A.营业外收入 B.资本公积 C.商誉 D.其他综合收益',
      answer: 'A。差额计入当期损益（营业外收入）。',
      grade: '中级会计', subject: '中级会计实务',
      knowledgePoints: ['长期股权投资'],
      isWrong: true, wrongReason: '与商誉处理混淆', mastery: '复习中',
      qtype: '单选', stage: '职业考试',
      sourceFile: '示例数据', createdAt: now
    }
  ];
})();
