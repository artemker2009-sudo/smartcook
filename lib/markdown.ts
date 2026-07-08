// Минимальный безопасный markdown → HTML для тел статей (заметок).
//
// Почему свой рендерер, а не библиотека: контент пишет ТОЛЬКО админ (таблица
// articles закрыта RLS для anon/authenticated, запись — через service_role),
// поэтому нам достаточно небольшого доверенного подмножества, а не тяжёлой
// зависимости с широким surface. Тем не менее сначала ЭКРАНИРУЕМ весь HTML,
// затем включаем ровно то, что нужно — на случай, если в тело просочится
// html-разметка. Никаких <script>, <img>, on*-атрибутов и произвольных тегов.
//
// Поддержка: заголовки (##, ###), жирный (**), курсив (*), ссылки [t](url)
// (только http/https/mailto), маркированные (-, *) и нумерованные (1.) списки,
// абзацы, переносы строк.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Инлайн-разметка применяется УЖЕ по экранированному тексту.
function inline(escaped: string): string {
  let out = escaped;
  // Ссылки [текст](url) — url валидируем: только http(s)/mailto, без кавычек.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const safe = /^(https?:\/\/|mailto:)[^"'<>]+$/i.test(url);
    if (!safe) return text;
    return `<a href="${url}" target="_blank" rel="noopener nofollow">${text}</a>`;
  });
  // Жирный **...**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Курсив *...* (после жирного, чтобы не конфликтовать)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return out;
}

export function renderMarkdown(md: string): string {
  const escaped = escapeHtml(md || "").replace(/\r\n/g, "\n");
  const lines = escaped.split("\n");
  const html: string[] = [];

  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length; // 2 → h2, 3 → h3
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.*)$/);
    const unordered = line.match(/^[-*]\s+(.*)$/);
    if (ordered || unordered) {
      flushParagraph();
      const wanted: "ul" | "ol" = ordered ? "ol" : "ul";
      if (listType !== wanted) {
        closeList();
        html.push(`<${wanted}>`);
        listType = wanted;
      }
      const item = (ordered ? ordered[1] : unordered![1]).trim();
      html.push(`<li>${inline(item)}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  flushParagraph();
  closeList();

  return html.join("\n");
}
