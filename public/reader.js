// Leitor de livros com páginas, no estilo dos leitores de e-book.
// O texto do livro fica só neste aparelho (IndexedDB); a posição de leitura vai para a conta.

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168";
const DB = "estudos-livros";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Armazenamento local do livro ---------- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("books");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction("books", mode); const req = fn(t.objectStore("books"));
    t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error);
  });
}
const cache = {};
export async function loadText(id) {
  if (cache[id]) return cache[id];
  try { return (cache[id] = await tx("readonly", (s) => s.get(id))) || null; } catch { return null; }
}
export async function hasText(id) { return Boolean(await loadText(id)); }
export async function removeText(id) { delete cache[id]; await tx("readwrite", (s) => s.delete(id)); }

// Lê o PDF escolhido pela pessoa e guarda o texto neste aparelho.
export async function importPdf(id, file, onProgress) {
  const pdfjs = await import(`${PDFJS}/pdf.min.mjs`);
  // O worker do pdf.js precisa ser da mesma origem; um worker "blob" que importa o da CDN resolve.
  const src = URL.createObjectURL(new Blob([`import "${PDFJS}/pdf.worker.min.mjs";`], { type: "text/javascript" }));
  pdfjs.GlobalWorkerOptions.workerPort = new Worker(src, { type: "module" });
  const { parseBook } = await import("./book-import.js");
  const book = await parseBook(pdfjs, new Uint8Array(await file.arrayBuffer()), onProgress);
  book.importedAt = Date.now();
  book.fileName = file.name;
  await tx("readwrite", (s) => s.put(book, id));
  cache[id] = book;
  return book;
}

/* ---------- Preferências de leitura (por aparelho) ---------- */
const SIZES = [15, 17, 19, 21, 23, 26];
const PREF_KEY = "estudos:reader";
const prefs = (() => { try { return { size: 2, font: "serif", theme: "paper", spacing: 1.6, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; } catch { return { size: 2, font: "serif", theme: "paper", spacing: 1.6 }; } })();
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignora */ } };

/* ---------- Leitor ---------- */
let current = null;
export function closeReader() { current?.destroy(); current = null; }

export function openReader({ root, id, book, meta, start, onSave, onExit, summaryHref }) {
  closeReader();
  const chapters = book.chapters;
  const partTitle = Object.fromEntries((book.parts || []).map((p) => [p.n, p.title]));
  const lens = chapters.map((c) => c.blocks.reduce((a, b) => a + b.html.length, 0) || 1);
  const before = lens.map((_, i) => lens.slice(0, i).reduce((a, n) => a + n, 0));
  const total = lens.reduce((a, n) => a + n, 0);

  let ci = Math.max(0, chapters.findIndex((c) => c.n === start?.ch)), page = 0, pages = 1, step = 1, anchor = start?.b ?? 0;
  if (ci < 0) ci = 0;

  document.body.classList.add("reading");
  root.innerHTML = `
    <div class="reader" data-theme="${prefs.theme}" data-font="${prefs.font}">
      <header class="r-bar">
        <button class="r-icon" data-act="exit" aria-label="Voltar ao livro"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="r-where"><span class="r-book">${esc(meta.title)}</span><span class="r-chap"></span></div>
        <button class="r-icon" data-act="toc" aria-label="Sumário" aria-expanded="false"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <button class="r-icon r-aa" data-act="prefs" aria-label="Aparência do texto" aria-expanded="false">Aa</button>
      </header>
      <div class="r-stage">
        <div class="r-viewport"><div class="r-flow" lang="pt-BR"></div></div>
        <button class="r-zone prev" data-act="prev" aria-label="Página anterior"></button>
        <button class="r-zone next" data-act="next" aria-label="Próxima página"></button>
      </div>
      <footer class="r-foot">
        <span class="r-pg"></span>
        <input class="r-seek" type="range" min="0" max="1000" value="0" aria-label="Posição no livro">
        <span class="r-pct"></span>
      </footer>
      <aside class="r-panel r-toc" hidden></aside>
      <aside class="r-panel r-prefs" hidden>
        <div class="r-row"><span>Tamanho</span><div class="r-seg"><button data-size="-1" aria-label="Diminuir letra">A−</button><button data-size="1" aria-label="Aumentar letra">A+</button></div></div>
        <div class="r-row"><span>Fonte</span><div class="r-seg" role="group">
          <button data-font="serif" class="f-serif">Literata</button><button data-font="sans" class="f-sans">Atkinson</button></div></div>
        <div class="r-row"><span>Espaçamento</span><div class="r-seg" role="group">
          <button data-spacing="1.45">Justo</button><button data-spacing="1.6">Normal</button><button data-spacing="1.85">Amplo</button></div></div>
        <div class="r-row"><span>Tema</span><div class="r-themes" role="group">
          <button data-theme="paper" class="t-paper" aria-label="Claro"></button><button data-theme="sepia" class="t-sepia" aria-label="Sépia"></button><button data-theme="night" class="t-night" aria-label="Escuro"></button></div></div>
      </aside>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const el = $(".reader"), vp = $(".r-viewport"), flow = $(".r-flow");

  function applyPrefs() {
    el.dataset.theme = prefs.theme; el.dataset.font = prefs.font;
    el.style.setProperty("--r-size", `${SIZES[prefs.size]}px`);
    el.style.setProperty("--r-lh", prefs.spacing);
    root.querySelectorAll("[data-font]").forEach((b) => b.tagName === "BUTTON" && b.setAttribute("aria-pressed", b.dataset.font === prefs.font));
    root.querySelectorAll("[data-theme]").forEach((b) => b.tagName === "BUTTON" && b.setAttribute("aria-pressed", b.dataset.theme === prefs.theme));
    root.querySelectorAll("[data-spacing]").forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.spacing) === prefs.spacing));
  }

  function renderChapter() {
    const c = chapters[ci];
    const notes = c.blocks.filter((b) => b.t === "note");
    let first = true;
    flow.innerHTML = `
      <header class="r-title">
        ${c.part ? `<p class="r-part">Parte ${c.part} · ${esc(partTitle[c.part] || "")}</p>` : ""}
        <p class="r-label">${esc(c.label)}</p>
        <h1>${esc(c.title)}</h1>
      </header>
      ${c.blocks.map((b, i) => {
        if (b.t === "note") return "";
        if (b.t === "h") return `<h2 data-b="${i}">${b.html}</h2>`;
        if (b.t === "q") return `<blockquote data-b="${i}">${b.html}</blockquote>`;
        const cls = first ? ' class="first"' : ""; first = false;
        return `<p data-b="${i}"${cls}>${b.html}</p>`;
      }).join("")}
      ${notes.length ? `<section class="r-notes"><h3>Notas</h3>${notes.map((b) => `<p data-b="${c.blocks.indexOf(b)}">${b.html}</p>`).join("")}</section>` : ""}
      <p class="r-end">${ci < chapters.length - 1 ? `Próximo: ${esc(chapters[ci + 1].label)}, ${esc(chapters[ci + 1].title)}` : "Fim do livro"}</p>`;
    $(".r-chap").textContent = `${c.label} · ${c.title}`;
  }

  // Mede as colunas e calcula quantas páginas o capítulo tem.
  function layout() {
    const w = vp.clientWidth, h = vp.clientHeight;
    const cols = w >= 980 ? 2 : 1;
    const gap = cols === 2 ? 72 : 48;
    const colW = (w - gap * (cols - 1)) / cols;
    flow.style.cssText = `width:${w}px;height:${h}px;column-width:${colW}px;column-count:${cols};column-gap:${gap}px;`;
    step = w + gap;
    pages = Math.max(1, Math.round((flow.scrollWidth + gap) / step));
  }

  const blockPage = (node) => Math.floor((node.getBoundingClientRect().left - flow.getBoundingClientRect().left + 2) / step);

  function pageOfAnchor() {
    const node = flow.querySelector(`[data-b="${anchor}"]`);
    return node ? Math.min(pages - 1, Math.max(0, blockPage(node))) : 0;
  }

  // Primeiro bloco que aparece na página atual (ou que continua nela).
  function anchorOfPage() {
    let a = null;
    for (const n of flow.querySelectorAll("[data-b]")) { if (blockPage(n) <= page) a = Number(n.dataset.b); else break; }
    return a ?? Number(flow.querySelector("[data-b]")?.dataset.b ?? 0);
  }

  function show(save = true) {
    page = Math.min(Math.max(0, page), pages - 1);
    flow.style.transform = `translateX(${-page * step}px)`;
    const pct = (before[ci] + lens[ci] * ((page + 1) / pages)) / total;
    $(".r-pg").textContent = `${chapters[ci].label} · página ${page + 1} de ${pages}`;
    $(".r-pct").textContent = `${Math.round(pct * 100)}%`;
    $(".r-seek").value = Math.round(pct * 1000);
    $(".r-zone.prev").disabled = ci === 0 && page === 0;
    $(".r-zone.next").disabled = ci === chapters.length - 1 && page === pages - 1;
    if (save) { anchor = anchorOfPage(); queueSave(pct); }
  }

  let saveT = null, pending = null;
  function queueSave(pct) {
    clearTimeout(saveT);
    pending = { ch: chapters[ci].n, b: anchor, pct: Math.round(pct * 1000) / 1000 };
    saveT = setTimeout(flushSave, 800);
  }
  function flushSave() { clearTimeout(saveT); if (pending) onSave(pending); pending = null; }

  function goChapter(i, where = "start") {
    ci = Math.min(Math.max(0, i), chapters.length - 1);
    renderChapter(); layout();
    page = where === "end" ? pages - 1 : 0;
    if (typeof where === "number") { anchor = where; page = pageOfAnchor(); }
    show(); renderToc();
  }

  const next = () => { if (page < pages - 1) { page++; show(); } else if (ci < chapters.length - 1) goChapter(ci + 1); };
  const prev = () => { if (page > 0) { page--; show(); } else if (ci > 0) goChapter(ci - 1, "end"); };

  function relayout() { layout(); page = pageOfAnchor(); show(false); }

  function renderToc() {
    const toc = $(".r-toc");
    let lastPart = null;
    toc.innerHTML = `<h2>Sumário</h2><ol>${chapters.map((c, i) => {
      const head = c.part && c.part !== lastPart ? `<li class="r-toc-part">Parte ${c.part} · ${esc(partTitle[c.part] || "")}</li>` : "";
      lastPart = c.part ?? lastPart;
      return `${head}<li><button data-go="${i}" ${i === ci ? 'aria-current="true"' : ""}><span>${c.part ? c.n : "–"}</span>${esc(c.title)}</button></li>`;
    }).join("")}</ol>
    ${summaryHref ? `<a class="r-sum" href="${summaryHref(chapters[ci].n)}">Ver o resumo deste capítulo</a>` : ""}`;
  }

  function togglePanel(name) {
    for (const p of ["toc", "prefs"]) {
      const panel = $(`.r-${p}`), btn = $(`[data-act="${p}"]`);
      const open = p === name && panel.hidden;
      panel.hidden = !open; btn.setAttribute("aria-expanded", open);
      if (open && p === "toc") panel.querySelector("[aria-current]")?.scrollIntoView({ block: "center" });
    }
  }
  const closePanels = () => togglePanel(null);

  const onClick = (e) => {
    const t = e.target.closest("button, a"); if (!t || !root.contains(t)) return;
    const act = t.dataset.act;
    if (act === "exit") return onExit();
    if (act === "toc" || act === "prefs") return togglePanel(act);
    if ((act === "next" || act === "prev") && Date.now() - swiped < 500) return; // o toque já virou a página
    if (act === "next") { if (!$(".r-toc").hidden || !$(".r-prefs").hidden) return closePanels(); return next(); }
    if (act === "prev") { if (!$(".r-toc").hidden || !$(".r-prefs").hidden) return closePanels(); return prev(); }
    if (t.dataset.go) { closePanels(); return goChapter(Number(t.dataset.go)); }
    if (t.dataset.size) { prefs.size = Math.min(SIZES.length - 1, Math.max(0, prefs.size + Number(t.dataset.size))); }
    else if (t.dataset.font) prefs.font = t.dataset.font;
    else if (t.dataset.theme) prefs.theme = t.dataset.theme;
    else if (t.dataset.spacing) prefs.spacing = Number(t.dataset.spacing);
    else return;
    savePrefs(); applyPrefs(); relayout();
  };
  root.addEventListener("click", onClick);

  // Barra de posição: escolhe capítulo e página pela porcentagem do livro.
  $(".r-seek").addEventListener("change", (e) => {
    const target = (Number(e.target.value) / 1000) * total;
    let i = before.findIndex((b, k) => target < b + lens[k]); if (i < 0) i = chapters.length - 1;
    if (i !== ci) { ci = i; renderChapter(); layout(); renderToc(); }
    page = Math.floor(((target - before[ci]) / lens[ci]) * pages);
    show();
  });

  const onKey = (e) => {
    if (e.target.closest?.("input, textarea")) return;
    if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); next(); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === "Escape") { if (!$(".r-toc").hidden || !$(".r-prefs").hidden) closePanels(); else onExit(); }
  };
  document.addEventListener("keydown", onKey);

  // Deslizar o dedo para virar a página.
  let touch = null, swiped = 0;
  const stage = $(".r-stage");
  stage.addEventListener("touchstart", (e) => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y; touch = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { swiped = Date.now(); (dx < 0 ? next : prev)(); }
  });

  let rT = null;
  const onResize = () => { clearTimeout(rT); rT = setTimeout(relayout, 120); };
  window.addEventListener("resize", onResize);

  applyPrefs();
  renderChapter();
  // Espera as fontes para medir as páginas certas.
  (document.fonts?.ready || Promise.resolve()).then(() => { layout(); page = pageOfAnchor(); show(false); renderToc(); });

  current = {
    destroy() {
      flushSave(); clearTimeout(rT);
      root.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.classList.remove("reading");
    },
  };
}
