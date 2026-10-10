/* 界面文案表（一期建立，见方案文档 §5.6：文案统一收口，便于校对与后续英文版） */
(function () {
  const CJT = (window.CJT = window.CJT || {});

  CJT.TEXTS = {
    // 通用
    appName: '错题集',
    // 💡 术语解释（说人话）
    tipStage: '学段决定下面的分类方式：中小学按「年级+学期+科目」，大学按「课程+章节」，考证按「考试+科目」。选错也没关系，随时可改。',
    tipKp: '知识点是这道题考查的内容，比如「分数乘法」。填得越准，后面的学情分析越有用。可以让 AI 自动帮你标。',
    tipAiKey: 'AI 服务密钥：在 AI 厂商官网注册后复制的一串字符，类似会员卡号。不填也能用，选择「Mock（离线体验）」即可先体验全部 AI 功能。',
    tipWrong: '标记为错题的题目才会进入学情统计和组卷练习。',
    tipMastery: '未掌握＝还会错；复习中＝正在巩固；已掌握＝不会再错。改状态会影响学情分析里的统计口径。',
    tipQtype: '题型比如选择、填空、应用题。让 AI 自动识别，或手动选择。统计页能看出哪种题型最容易错。',
    tipWeak: '勾上后，错得多的知识点会被优先抽进试卷——哪里薄弱练哪里。不勾就是完全随机抽。',
    tipExam: '像真的考试一样：限时做题、交卷后对照答案自己判分。「不会」的题会自动安排明天复习。',
    // AI 按钮副标题
    aiTagSub: '自动为题目贴知识点标签（花几分钱）',
    aiSolveSub: '自动生成答案和讲解（花几分钱）',
    aiSplitSub: '让 AI 检查切分是否正确、识别每道题题型',
    aiTagAllSub: '逐题自动打标，结果可修改',
    aiQtypeSub: '为没有题型的旧错题自动补标',
    // 空状态
    emptyBank: '这里还空空如也。上传一张试卷，或点右上角「手动添加」录入第一道题。',
    emptyAnalysis: '还没有足够的错题数据。先录入几道错题，再回来看分析。',
    emptyQtype: '题型都识别齐啦',
    // 错误提示（口语化）
    errUnreachable: '连不上本地服务。请重启应用；如果还不行，把 ~/.cuotiji/app.log 发给开发者。',
    errNoKey: '还没有填 AI 服务密钥。打开「AI 设置」，或选「Mock（离线体验）」先试用。',
    errAuth: '密钥好像不对，连不上 AI 服务。请回官网重新复制一遍。',
    errNetwork: '网络连不上 AI 服务，请检查网络后重试。',
    errOutput: 'AI 返回的内容格式不对，请重试一次；多次失败可换一家厂商。',
    // 删除确认
    confirmDeleteOne: '确定删除这道题吗？删除后无法恢复，建议先在顶部「导出数据」备份。',
    confirmImport: '导入会覆盖现在题库里的全部题目（共 {n} 道）。建议先导出备份，确定继续吗？',
    confirmSample: '加载示例会覆盖当前全部题目，确定继续吗？',
    // 引导
    onboard: [
      { title: '① 上传试卷', desc: '把试卷 PDF 拖进录入页，自动拆成一道道题' },
      { title: '② 勾选错题', desc: '预览里勾掉不是错题的，改一改识别不准的文字' },
      { title: '③ 打印练习卷', desc: '到「组卷打印」一键抽题生成试卷，打印给孩子重做' }
    ],
    onboardSkip: '跳过',
    onboardNext: '下一步',
    onboardDone: '开始用',
    // 分类标签
    labelGradeK12: '年级',
    labelGradeUni: '课程',
    labelGradeVoc: '考试项目',
    labelSubjectK12: '科目',
    labelSubjectUni: '章节',
    labelSubjectVoc: '科目'
  };
})();
