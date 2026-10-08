/* PDF 解析：pdf.js 逐页提取文本 + 正则按题号切分 */
(function () {
  const CJT = window.CJT;

  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  CJT.pdf = {
    /** 提取整个 PDF 的文本（逐页 getTextContent），失败或为空返回空字符串 */
    async extractText(file) {
      if (typeof pdfjsLib === 'undefined') {
        throw new Error('pdf.js 加载失败，请检查网络后刷新页面');
      }
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let out = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        out += content.items.map(it => it.str).join(' ') + '\n';
      }
      return out.trim();
    },

    /**
     * 按题号切分题目。
     * 兼容格式："1." "1、" "1．" "(1)" "（1）" "第1题"。
     * 启发式过滤：只接受从 1 开始严格递增的题号（或首个识别号开始的递增序列），
     * 避免把题内的 (1)(2) 小题误判为新题。
     */
    splitQuestions(text) {
      const re = /(^|\n)[ \t　]*(?:[（(]\s*(\d{1,3})\s*[)）]|第\s*(\d{1,3})\s*题|(\d{1,3})\s*[.、．)）])/gm;
      const marks = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        const num = parseInt(m[2] || m[3] || m[4], 10);
        marks.push({ num, start: m.index + m[1].length, contentStart: re.lastIndex });
      }
      if (!marks.length) return [];

      // 过滤出严格递增的题号序列
      let accepted = [];
      let expected = 1;
      for (const mk of marks) {
        if (mk.num === expected) {
          accepted.push(mk);
          expected++;
        }
      }
      // 兜底：若递增规则一题都没切出来，退化为从首个识别号开始的递增序列
      if (!accepted.length) {
        expected = marks[0].num;
        for (const mk of marks) {
          if (mk.num === expected) {
            accepted.push(mk);
            expected++;
          }
        }
      }

      const result = [];
      for (let i = 0; i < accepted.length; i++) {
        const end = i + 1 < accepted.length ? accepted[i + 1].start : text.length;
        const body = text.slice(accepted[i].contentStart, end).replace(/\s+\n/g, '\n').trim();
        if (body) result.push({ num: accepted[i].num, text: body });
      }
      return result;
    }
  };
})();
