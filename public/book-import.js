// Converte o PDF de um livro em capítulos e parágrafos para o leitor.
// Roda no navegador da pessoa: o texto do livro nunca sai do aparelho.
// Recebe a biblioteca pdf.js já carregada, para poder ser testado fora do navegador.

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const isCaps = (s) => /\p{Lu}{3}/u.test(s) && s === s.toUpperCase();
const WORDS = { UM: 1, DOIS: 2, "TRÊS": 3, QUATRO: 4, CINCO: 5, SEIS: 6, SETE: 7, OITO: 8, NOVE: 9, DEZ: 10 };

// Junta os pedaços de texto de uma página em linhas, guardando tamanho e estilo.
async function pageLines(page) {
  await page.getOperatorList(); // carrega as fontes para sabermos o que é itálico
  const tc = await page.getTextContent();
  const style = (name) => {
    let f = ""; try { f = page.commonObjs.get(name)?.name || ""; } catch { /* sem fonte */ }
    return { i: /italic|oblique/i.test(f), b: /bold/i.test(f) };
  };
  const items = tc.items.filter((it) => it.str).map((it) => ({ y: it.transform[5], x: it.transform[4], w: it.width, h: it.height, s: it.str, ...style(it.fontName) }));
  const rows = new Map();
  const addTo = (it, near) => {
    const key = [...rows.keys()].find((k) => Math.abs(k - it.y) <= near) ?? Math.round(it.y);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(it);
  };
  // Números de nota sobrescritos ficam um pouco acima da linha: juntamos à linha de baixo.
  const isRef = (it) => /^\d+$/.test(it.s.trim()) && it.h > 0 && it.h < 8;
  items.filter((it) => !isRef(it)).forEach((it) => addTo(it, 2));
  items.filter(isRef).forEach((it) => addTo(it, 7));
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([y, its]) => {
    its.sort((a, b) => a.x - b.x);
    const body = its.filter((t) => t.s.trim());
    const size = Math.max(0, ...body.map((t) => t.h));
    let html = "", text = "";
    for (const t of its) {
      let h = esc(t.s);
      if (t.s.trim() && t.h && t.h < size * 0.6 && /^\d+$/.test(t.s.trim())) h = `<sup>${h.trim()}</sup>`;
      else if (t.i && t.s.trim()) h = `<i>${h}</i>`;
      html += h; text += t.s;
    }
    html = html.replace(/<\/i>(\s*)<i>/g, "$1");
    const x0 = body.length ? Math.min(...body.map((t) => t.x)) : 0;
    const x1 = body.length ? Math.max(...body.map((t) => t.x + t.w)) : 0;
    return { y, x0, x1, size, text: text.trim(), html: html.trim(), bold: body.every((t) => t.b) };
  }).filter((l) => l.text);
}

// Títulos do sumário ("Capítulo 1   O que é teologia?") com a grafia original.
function tocTitles(lines) {
  const out = {};
  for (const l of lines) {
    const m = l.text.match(/^Cap[íi]tulo\s+(\d+)\s+(.+)$/);
    if (m) out[Number(m[1])] = m[2].trim();
    const a = l.text.match(/^Ap[êe]ndice\s+(.+)$/);
    if (a) out.appendix = a[1].trim();
  }
  return out;
}

const sentence = (s) => s.charAt(0) + s.slice(1).toLowerCase();

export async function parseBook(pdfjs, data, onProgress = () => {}) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const meta = (await doc.getMetadata().catch(() => null))?.info || {};
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    pages.push(await pageLines(page));
    page.cleanup();
    onProgress(i / doc.numPages);
  }

  // Medidas do corpo do texto: tamanho de letra e margens mais comuns.
  const count = (arr) => { const m = new Map(); arr.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; };
  const all = pages.flat();
  const bodySize = count(all.map((l) => Math.round(l.size * 2) / 2));
  const left = count(all.filter((l) => Math.abs(l.size - bodySize) < 1).map((l) => Math.round(l.x0)));
  const right = count(all.filter((l) => Math.abs(l.size - bodySize) < 1).map((l) => Math.round(l.x1)));

  const titles = tocTitles(all);
  const parts = [], chapters = [];
  let ch = null, part = null, block = null, prev = null, dropcap = "";

  const close = () => { if (block && ch) ch.blocks.push(block); block = null; };
  const push = (t, html) => { close(); ch.blocks.push({ t, html }); prev = null; };

  for (const lines of pages) {
    // Páginas de propaganda da editora no fim do arquivo.
    if (chapters.length && lines.some((l) => /^www\./.test(l.text) && l.size > bodySize)) continue;
    const cap =lines.find((l) => l.size > bodySize * 3 && /^\p{Lu}$/u.test(l.text));
    if (cap) dropcap = cap.text;
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k];
      if (l === cap) continue;
      const big = l.size > bodySize * 1.5;

      let m = l.text.match(/^PARTE\s+(\S+)$/);
      if (m && WORDS[m[1]]) {
        close();
        const name = lines.slice(k + 1).find((x) => x.size > bodySize * 1.5)?.text || "";
        part = { n: WORDS[m[1]], title: sentence(name) };
        parts.push(part);
        k = lines.length; // a página da parte não tem mais nada
        continue;
      }
      m = l.text.match(/^CAP[ÍI]TULO\s+(\d+)$/);
      if (m || /^AP[ÊE]NDICE$/.test(l.text)) {
        close();
        const n = m ? Number(m[1]) : chapters.length + 1;
        const head = lines[k + 1] && lines[k + 1].size > bodySize * 1.5 ? lines[k + 1] : null;
        const title = (m ? titles[n] : titles.appendix) || (head ? sentence(head.text) : "");
        ch = { n, title, label: m ? `Capítulo ${n}` : "Apêndice", part: m ? part?.n ?? null : null, blocks: [] };
        chapters.push(ch);
        if (head) k++;
        prev = null;
        continue;
      }
      if (!ch || big) continue;

      const small = l.size < bodySize * 0.75;
      const quote = !small && l.size < bodySize * 0.95 && l.x0 > left + 6;
      if (small) {
        const last = ch.blocks.at(-1);
        if (!block && last?.t === "note" && !/^\d+\s/.test(l.text)) last.html += " " + l.html; // nota em várias linhas
        else push("note", l.html);
        continue;
      }
      const heading = isCaps(l.text) && l.text.length < 80 && !/[.,;:]$/.test(l.text) && (!prev || prev.x1 < right - 30 || /[.!?”)]\d*$/.test(prev.text));
      if (heading) { push("h", esc(sentence(l.text))); continue; }

      const kind = quote ? "q" : "p";
      const indent = l.x0 - left;
      const startsNew = !block || block.t !== kind || !prev
        || prev.x1 < right - 30                                // linha anterior terminou antes da margem
        || (kind === "p" && indent > 5 && indent < 25);        // recuo de primeira linha
      if (startsNew) {
        close();
        block = { t: kind, html: "" };
        if (dropcap && kind === "p") { block.html = dropcap; block.cap = true; dropcap = ""; }
      }
      const sep = !block.html || block.cap === true ? "" : block.html.endsWith("-") ? "" : " ";
      block.html += sep + l.html;
      if (block.cap === true) block.cap = 1;
      prev = l;
    }
  }
  close();

  for (const c of chapters) for (const b of c.blocks) {
    b.html = b.html.replace(/\s{2,}/g, " ").replace(/<\/sup>(?=[\p{L}“])/gu, "</sup> ").trim();
    delete b.cap;
  }
  return { title: meta.Title || "", author: meta.Author || "", pages: doc.numPages, parts, chapters };
}
