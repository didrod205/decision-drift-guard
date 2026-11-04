// Minimal Markdown to Confluence-like storage HTML, enough for ADR files: headings, paragraphs,
// admonitions, list items, links. Code blocks are dropped (the app never reads code).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>').replace(/`([^`]+)`/g, '<code>$1</code>');
export const md2html = (md) => {
  let t = String(md).replace(/^---\n[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, '');
  const out = [];
  for (const block of t.split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b || /^:::\s*$/.test(b)) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(b.split('\n')[0]);
    if (h) {
      const lvl = Math.min(h[1].length, 4);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      const rest = b.split('\n').slice(1).join(' ').trim();
      if (rest) out.push(`<p>${inline(rest)}</p>`);
      continue;
    }
    const lines = b.split('\n').map((x) => x.replace(/^:::\s*\w*(\[(.*?)\])?\s*$/, '$2').replace(/^:::$/, '').trim()).filter(Boolean);
    if (lines.every((x) => /^[-*]\s|^\d+\.\s/.test(x))) out.push(`<ul>${lines.map((x) => `<li>${inline(x.replace(/^[-*]\s|^\d+\.\s/, ''))}</li>`).join('')}</ul>`);
    else out.push(...lines.length > 1 && /^\w+$/.test(lines[0]) && b.startsWith(':::') ? [`<p>${inline(lines[0])}</p>`, `<p>${inline(lines.slice(1).join(' '))}</p>`] : [`<p>${inline(lines.join(' '))}</p>`]);
  }
  return out.join('');
};
