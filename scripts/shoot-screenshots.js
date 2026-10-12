/* 错题集 README 截图自动生成：无头 Chrome 渲染 App 各视图（浅色+深色） */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BASE = process.argv[2];
const OUT = process.argv[3];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TODAY = '2026-10-12';

// 演示数据：覆盖 K12/大学/职考、多知识点/题型/掌握状态、8 周时间跨度（趋势图用）、1 道今日到期复习
const Q = (o) => Object.assign({ answer: '', term: '', wrongReason: '', sourceFile: '演示数据', createdAt: '2026-10-12T09:00:00', images: [] }, o);
const FIXTURE = [
  Q({ text: '计算：3/4 × 8/9 = ？', answer: '2/3。先约分再相乘。', grade: '五年级', term: '上', subject: '数学', knowledgePoints: ['分数乘法', '约分'], isWrong: true, wrongReason: '约分时看错了公因数', mastery: '复习中', qtype: '计算', stage: '小学', createdAt: '2026-09-28T10:00:00' }),
  Q({ text: '口算：25 × 4 × 7 = ？', grade: '三年级', subject: '数学', knowledgePoints: ['乘法运算律'], isWrong: true, wrongReason: '运算顺序错', mastery: '未掌握', qtype: '口算', stage: '小学', createdAt: '2026-10-10T16:30:00' }),
  Q({ text: 'He ___ (go) to school by bike every day.', answer: 'goes', grade: '初一', term: '上', subject: '英语', knowledgePoints: ['一般现在时', '动词三单'], isWrong: true, wrongReason: '三单漏了 s', mastery: '未掌握', qtype: '填空', stage: '初中', createdAt: '2026-10-08T18:00:00' }),
  Q({ text: '一个物体浸没在水中，排开水的体积为 2×10⁻³ m³，求浮力。（g 取 10N/kg）', answer: '20N。F浮 = ρ水 g V排', grade: '初二', term: '上', subject: '物理', knowledgePoints: ['阿基米德原理', '浮力计算'], isWrong: true, wrongReason: '公式记混', mastery: '复习中', qtype: '计算', stage: '初中', createdAt: '2026-09-15T14:00:00' }),
  Q({ text: '求函数 f(x) = x² - 2x + 3 在区间 [0,3] 上的最值。', answer: '最小值 2（x=1），最大值 6（x=3）', grade: '高一', subject: '数学', knowledgePoints: ['二次函数', '单调性'], isWrong: true, mastery: '已掌握', qtype: '计算', stage: '高中', createdAt: '2026-08-20T09:00:00' }),
  Q({ text: '写出实验室制取氧气的化学方程式，并注明反应条件。', answer: '2KMnO₄ △→ K₂MnO₄ + MnO₂ + O₂↑', grade: '初三', term: '上', subject: '化学', knowledgePoints: ['化学方程式', '氧气制取'], isWrong: true, wrongReason: '条件漏写', mastery: '未掌握', qtype: '填空', stage: '初中', createdAt: '2026-10-05T11:00:00' }),
  Q({ text: '下列成语使用正确的一项是（　）A.滥竽充数 B.…', answer: 'A', grade: '四年级', subject: '语文', knowledgePoints: ['成语积累'], isWrong: false, mastery: '已掌握', qtype: '选择', stage: '小学', createdAt: '2026-09-01T10:00:00' }),
  Q({ text: '求极限：lim(x→0) sin(3x) / x = ？', answer: '3（等价无穷小）', grade: '公共基础', subject: '高等数学', term: '大二', knowledgePoints: ['极限', '等价无穷小'], isWrong: true, wrongReason: '替换条件记错', mastery: '复习中', qtype: '计算证明', stage: '大学', createdAt: '2026-09-25T20:00:00' }),
  Q({ text: '（单选）企业取得长期股权投资，初始成本小于应享净资产份额的差额计入（　）。', answer: 'A.营业外收入', grade: '中级会计', subject: '中级会计实务', knowledgePoints: ['长期股权投资'], isWrong: true, wrongReason: '与资本公积混淆', mastery: '复习中', qtype: '单选', stage: '职业考试', createdAt: '2026-10-02T15:00:00' }),
  Q({ text: '计算：7.2 ÷ 0.9 + 1.5 = ？', answer: '9.5', grade: '五年级', subject: '数学', knowledgePoints: ['小数四则运算'], isWrong: true, mastery: '已掌握', qtype: '计算', stage: '小学', createdAt: '2026-08-28T10:00:00' }),
  Q({ text: '复习序列演示题：今日到期的错题', grade: '五年级', subject: '数学', knowledgePoints: ['分数乘法'], isWrong: true, mastery: '未掌握', qtype: '计算', stage: '小学', createdAt: '2026-10-11T08:00:00', nextReviewAt: TODAY, reviewInterval: 1, reps: 1 }),
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--force-device-scale-factor=2'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('页面JS错误:', e.message));

  // 注入演示数据 + 浅色主题
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(async (fixture) => {
    await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions: fixture }) });
    await fetch('/api/ui_prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'light', onboarded: '1' }) });
  }, FIXTURE);
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const clickNav = async (view) => {
    await page.evaluate((v) => {
      document.querySelector(`.side-item[data-view="${v}"]`).click();
    }, view);
    await new Promise(r => setTimeout(r, 500));
  };

  // 1 录入页（先选学段解锁）
  await page.evaluate(() => document.querySelector('.stage-chip[data-stage="小学"]').click());
  await new Promise(r => setTimeout(r, 400));
  await shot('01-import-light');

  // 2 错题集
  await clickNav('bank'); await shot('02-bank-light');

  // 3-6 学情分析四 tab
  await clickNav('analysis');
  await page.evaluate(() => document.querySelector('.ana-tab[data-ana="qtype"]').click());
  await new Promise(r => setTimeout(r, 400)); await shot('03-analysis-qtype');
  await page.evaluate(() => document.querySelector('.ana-tab[data-ana="graph"]').click());
  await new Promise(r => setTimeout(r, 400)); await shot('04-analysis-graph');

  // 5 组卷
  await clickNav('paper');
  await page.evaluate(() => { document.querySelector('#pCount').value = 8; });
  await page.evaluate(() => document.querySelector('#btnGenPaper').click());
  await new Promise(r => setTimeout(r, 500)); await shot('05-paper');

  // 6 今日复习
  await clickNav('review'); await shot('06-review');

  // 7 深色模式（错题集+分析）
  await page.evaluate(async () => {
    await fetch('/api/ui_prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'dark' }) });
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => document.querySelector(`.side-item[data-view="bank"]`).click());
  await new Promise(r => setTimeout(r, 500)); await shot('07-bank-dark');
  await page.evaluate(() => document.querySelector(`.side-item[data-view="analysis"]`).click());
  await page.evaluate(() => document.querySelector('.ana-tab[data-ana="graph"]').click());
  await new Promise(r => setTimeout(r, 500)); await shot('08-analysis-dark');

  // 还原主题 auto
  await page.evaluate(async () => {
    await fetch('/api/ui_prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'auto' }) });
  });

  await browser.close();
  console.log('截图完成 →', OUT);
})().catch(e => { console.error(e); process.exit(1); });
