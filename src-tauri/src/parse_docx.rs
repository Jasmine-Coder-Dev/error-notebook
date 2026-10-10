//! docx 文本提取：zip 解包 word/document.xml，quick-xml 按 w:p 段落拼 w:t 文本。
//! 仅依赖 deflate 解压，无系统库；复杂排版（文本框/表格嵌套）按出现顺序提取正文。

use quick_xml::events::Event;
use quick_xml::Reader;

/// 从 docx 字节流提取纯文本（段落以 \n 分隔）。失败返回 Err(原因)。
pub fn extract_text(bytes: &[u8]) -> Result<String, String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut zip = zip::ZipArchive::new(cursor).map_err(|e| format!("不是有效的 .docx 文件：{e}"))?;
    let mut xml = match zip.by_name("word/document.xml") {
        Ok(mut f) => {
            let mut buf = Vec::with_capacity(f.size() as usize);
            use std::io::Read;
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            buf
        }
        Err(_) => return Err("docx 内缺少 word/document.xml（可能为老版 .doc 格式，请另存为 .docx）".into()),
    };
    xml.shrink_to_fit();

    let mut reader = Reader::from_reader(xml.as_slice());
    reader.config_mut().trim_text(false);

    let mut out_lines: Vec<String> = Vec::new();
    let mut cur = String::new();      // 当前段落文本
    let mut in_paragraph = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => break,
            Ok(Event::Start(e)) => {
                let name = e.name();
                let ln = name.local_name();
                if ln.as_ref() == b"p" && is_word_ns(&name) {
                    in_paragraph = true;
                    cur.clear();
                }
            }
            Ok(Event::End(e)) => {
                let name = e.name();
                let ln = name.local_name();
                if ln.as_ref() == b"p" && is_word_ns(&name) {
                    in_paragraph = false;
                    out_lines.push(cur.trim().to_string());
                }
            }
            Ok(Event::Text(t)) if in_paragraph => {
                if let Ok(txt) = t.unescape() {
                    cur.push_str(&txt);
                }
            }
            Ok(_) => {}
            Err(e) => return Err(format!("解析 document.xml 失败：{e}")),
        }
        buf.clear();
    }

    // 丢弃空段落后拼接；保留原始行序
    let text: Vec<&str> = out_lines.iter().map(|s| s.as_str()).filter(|s| !s.is_empty()).collect();
    Ok(text.join("\n"))
}

/// w:p / w:t 等元素带 namespace（如 w: 或无前缀直写），两者都接受。
fn is_word_ns(name: &quick_xml::name::QName<'_>) -> bool {
    match name.prefix() {
        None => true,
        Some(p) => p.as_ref() == b"w",
    }
}
