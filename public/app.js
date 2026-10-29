import { store, isConfigured } from "./store.js?v=2";

const $main = document.getElementById("main");
const $account = document.getElementById("account");
const $banner = document.getElementById("banner");
const $toast = document.getElementById("toast");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toSec = (d) => (d || "0:00").split(":").reduce((a, n) => a * 60 + Number(n), 0);
const fmtHours = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const WATCH_RATIO = 0.85;

let COURSES = [], QUIZ = {}, LESSON = {}, SUBJECT = {}, SERMONS = [], BOOKS = [], ready = false;

function toast(msg) {
  $toast.textContent = msg; $toast.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => $toast.classList.remove("show"), 2600);
}

async function loadData() {
  const [c, q, s, b] = await Promise.all([
    fetch("data/courses.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/quiz.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({})),
    fetch("data/sermons.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => []),
    fetch("data/books.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => []),
  ]);
  COURSES = c; QUIZ = q; SERMONS = s; BOOKS = b;
  for (const course of COURSES) for (const s of course.subjects) {
    s.course = course; SUBJECT[s.id] = s;
    s.lessons.forEach((l, i) => { l.n = i + 1; l.subject = s; l.secs = toSec(l.dur); LESSON[l.id] = l; });
  }
}

const watched = (id) => Boolean(store.state.watched[id]);
const subjectStats = (s) => { const done = s.lessons.filter((l) => watched(l.id)).length; return { done, total: s.lessons.length, pct: Math.round((done / s.lessons.length) * 100) }; };
const courseStats = (c) => c.subjects.reduce((a, s) => { const x = subjectStats(s); a.done += x.done; a.total += x.total; return a; }, { done: 0, total: 0 });
const nextLesson = (s) => s.lessons.find((l) => !watched(l.id)) || s.lessons[0];

// Faixa de "bordas douradas": um filete por aula, dourado quando assistida.
function edge(s, big = false) {
  const bars = s.lessons.map((l) => `<span class="${watched(l.id) ? "on" : ""}" title="${esc(`${l.n}. ${l.title}`)}"></span>`).join("");
  const st = subjectStats(s);
  return `<div class="edge${big ? " big" : ""}" role="img" aria-label="${st.done} de ${st.total} aulas assistidas">${bars}</div>`;
}

/* ---------- Conta ---------- */
function renderAccount() {
  const u = store.user;
  if (!u) { $account.innerHTML = ""; return; }
  if (u.demo) { $account.innerHTML = `<span class="demo-tag">Modo demonstração</span>`; return; }
  const initial = esc((u.name || "?").trim()[0]?.toUpperCase());
  $account.innerHTML = `
    ${u.photo ? `<img class="avatar" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${initial}</span>`}
    <span class="acc-name">${esc(u.name)}</span>
    <button class="btn-text" id="signout">Sair</button>`;
  document.getElementById("signout").onclick = () => store.signOut();
}

function renderSignIn() {
  $main.innerHTML = `
    <section class="signin">
      <div class="signin-card">
        <span class="brand-mark big" aria-hidden="true"></span>
        <h1>Estudos de Teologia</h1>
        <p>Entre para continuar de onde parou.</p>
        <button class="btn btn-google" id="signin">
          <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
          Entrar com Google
        </button>
      </div>
    </section>`;
  document.getElementById("signin").onclick = async () => {
    try { await store.signIn(); } catch (e) { console.error(e); toast("Não foi possível entrar. Tente de novo."); }
  };
}

/* ---------- Números do estudo ---------- */
const DAY = 86400000;
const dayKey = (t) => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY);
function overall() {
  const st = store.state;
  const lessons = Object.values(LESSON);
  const done = lessons.filter((l) => watched(l.id)).length;
  const secs = Object.values(st.sec).reduce((a, n) => a + (Number(n) || 0), 0);
  const qz = Object.values(st.quiz).reduce((a, q) => { a.c += q.c; a.n += q.n; return a; }, { c: 0, n: 0 });
  // Dias seguidos: conta dias com alguma atividade (aula assistida, perguntas ou última aula aberta).
  const days = new Set([...Object.values(st.watched), ...Object.values(st.quiz).map((q) => q.at), st.last?.at].filter(Boolean).map(dayKey));
  let streak = 0, d = dayKey(Date.now());
  if (!days.has(d)) d--;
  while (days.has(d)) { streak++; d--; }
  return { done, total: lessons.length, secs, qz, streak };
}

function continueLesson() {
  const last = store.state.last && LESSON[store.state.last.vid];
  if (last) return watched(last.id) ? (last.subject.lessons[last.n] || nextLesson(last.subject)) : last;
  return COURSES[0].subjects[0].lessons[0];
}

const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ---------- Início ---------- */
function renderHome() {
  const o = overall();
  const first = (store.user?.name || "").split(" ")[0];
  const started = Boolean(store.state.last);
  const cont = continueLesson();
  const pos = store.state.pos[cont.id] || 0;
  const posPct = Math.min(100, Math.round((pos / (cont.secs || 1)) * 100));
  const pctAll = Math.round((o.done / o.total) * 100);

  $main.innerHTML = `
    <section class="dash">
      <div class="dash-hello">
        <p class="eyebrow">${started ? "Bom te ver de novo" : "Bem-vindo"}</p>
        <h1>${first && !store.user?.demo ? `Olá, ${esc(first)}` : "Seus estudos"}</h1>
        <p class="lead">${o.done ? `Você já assistiu <strong>${o.done}</strong> de ${o.total} aulas (${pctAll}%).` : `São ${o.total} aulas em ${Object.keys(SUBJECT).length} matérias. Comece pela primeira ou escolha uma matéria abaixo.`}</p>
      </div>
      <a class="resume" href="#/a/${cont.id}">
        <span class="resume-media">
          <img src="${thumb(cont.id)}" alt="" loading="lazy">
          <span class="play" aria-hidden="true"></span>
          ${pos > 10 ? `<span class="resume-bar"><span style="width:${posPct}%"></span></span>` : ""}
        </span>
        <span class="resume-body">
          <span class="resume-kicker">${started ? `Continuar${pos > 10 ? ` de ${fmtClock(pos)}` : ""}` : "Comece por aqui"}</span>
          <span class="resume-title">${esc(cont.title)}</span>
          <span class="resume-meta">${esc(cont.subject.title)} · aula ${cont.n} de ${cont.subject.lessons.length} · ${cont.dur}</span>
        </span>
      </a>
      <dl class="stats">
        <div class="stat"><dt>Aulas assistidas</dt><dd>${o.done}<small>/${o.total}</small></dd><span class="meter"><span style="width:${pctAll}%"></span></span></div>
        <div class="stat"><dt>Tempo de estudo</dt><dd>${o.secs >= 60 ? fmtHours(o.secs) : "0 min"}</dd><span class="stat-note">assistido aqui</span></div>
        <div class="stat"><dt>Acertos nas perguntas</dt><dd>${o.qz.n ? `${Math.round((o.qz.c / o.qz.n) * 100)}%` : "–"}</dd><span class="stat-note">${o.qz.n ? `${o.qz.c} de ${o.qz.n}` : "nenhuma respondida ainda"}</span></div>
        <div class="stat"><dt>Dias seguidos</dt><dd>${o.streak}</dd><span class="stat-note">${o.streak ? "continue amanhã" : "estude hoje para começar"}</span></div>
      </dl>
    </section>

    <div class="search">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" id="q" placeholder="Buscar aula ou matéria (ex.: Calvino, parábolas, Gênesis)" aria-label="Buscar aula ou matéria" autocomplete="off">
    </div>
    <div id="results" aria-live="polite"></div>

    <div id="catalog">
    ${COURSES.map((c) => {
      const cs = courseStats(c);
      return `
      <section class="course">
        <header class="course-head">
          <h2>${esc(c.title)}</h2>
          <p>${cs.done}/${cs.total} aulas · ${fmtHours(c.subjects.reduce((a, s) => a + s.lessons.reduce((b, l) => b + l.secs, 0), 0))}</p>
        </header>
        <ul class="cards">
          ${c.subjects.map((s) => {
            const st = subjectStats(s); const hrs = fmtHours(s.lessons.reduce((a, l) => a + l.secs, 0));
            return `
            <li>
              <a class="card${st.pct === 100 ? " complete" : ""}" href="#/m/${s.id}">
                <span class="card-cover"><img src="${thumb(s.lessons[0].id)}" alt="" loading="lazy"><span class="card-badge">${st.pct === 100 ? "Concluída" : st.done ? `${st.pct}%` : `${st.total} aulas`}</span></span>
                <span class="card-body">
                  <span class="card-title">${esc(s.title)}</span>
                  <span class="card-desc">${esc(s.desc)}</span>
                  ${edge(s)}
                  <span class="card-meta"><span>${st.done}/${st.total} assistidas</span><span>${hrs}</span></span>
                </span>
              </a>
            </li>`;
          }).join("")}
        </ul>
      </section>`;
    }).join("")}
    </div>`;

  const q = document.getElementById("q");
  q.oninput = () => renderSearch(q.value);
  if (renderHome.lastQuery) { q.value = renderHome.lastQuery; renderSearch(q.value); }
}

function renderSearch(text) {
  renderHome.lastQuery = text;
  const box = document.getElementById("results"), cat = document.getElementById("catalog");
  const terms = norm(text.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) { box.innerHTML = ""; cat.hidden = false; return; }
  const hits = Object.values(LESSON).filter((l) => { const h = norm(`${l.title} ${l.subject.title}`); return terms.every((t) => h.includes(t)); });
  cat.hidden = true;
  box.innerHTML = hits.length ? `
    <p class="results-count">${hits.length} ${hits.length === 1 ? "aula encontrada" : "aulas encontradas"}</p>
    <ol class="lessons results">${hits.slice(0, 60).map((l) => `
      <li class="lesson${watched(l.id) ? " done" : ""}">
        <a href="#/a/${l.id}">
          <span class="num">${l.n}</span>
          <span class="lesson-text"><span class="lesson-title">${esc(l.title)}</span><span class="lesson-meta">${esc(l.subject.title)} · ${l.dur}</span></span>
          <span class="check" aria-label="${watched(l.id) ? "Assistida" : "Não assistida"}"></span>
        </a>
      </li>`).join("")}</ol>` : `<p class="results-count">Nenhuma aula encontrada para “${esc(text.trim())}”.</p>`;
}

/* ---------- Desempenho ---------- */
function renderPerf() {
  const o = overall();
  const subjects = COURSES.flatMap((c) => c.subjects);
  const rows = subjects.map((s) => {
    const st = subjectStats(s);
    const qs = s.lessons.map((l) => store.state.quiz[l.id]).filter(Boolean);
    const c = qs.reduce((a, q) => a + q.c, 0), n = qs.reduce((a, q) => a + q.n, 0);
    return { s, st, answered: qs.length, acc: n ? Math.round((c / n) * 100) : null };
  });
  const review = Object.entries(store.state.quiz).filter(([id, q]) => LESSON[id] && q.c < q.n).sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n).slice(0, 12);

  $main.innerHTML = `
    <section class="dash-hello perf-head">
      <p class="eyebrow">Desempenho</p>
      <h1>Como vão seus estudos</h1>
      <p class="lead">${o.done} de ${o.total} aulas assistidas${o.qz.n ? `, ${Math.round((o.qz.c / o.qz.n) * 100)}% de acertos em ${o.qz.n} perguntas` : ""}.</p>
    </section>
    <div class="table-wrap">
      <table class="perf">
        <thead><tr><th scope="col">Matéria</th><th scope="col">Aulas</th><th scope="col">Perguntas feitas</th><th scope="col">Acertos</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <th scope="row"><a href="#/m/${r.s.id}">${esc(r.s.title)}</a><small>${esc(r.s.course.title)}</small></th>
            <td><span class="cell-meter"><span class="meter"><span style="width:${r.st.pct}%"></span></span>${r.st.done}/${r.st.total}</span></td>
            <td>${r.answered}/${r.st.total}</td>
            <td class="${r.acc == null ? "muted" : r.acc >= 70 ? "good" : r.acc >= 50 ? "" : "bad"}">${r.acc == null ? "–" : `${r.acc}%`}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <section class="review">
      <h2>Para revisar</h2>
      ${review.length ? `<p class="lead">Aulas em que você errou alguma pergunta. Reveja o trecho e responda de novo.</p>
      <ol class="lessons">${review.map(([id, q]) => { const l = LESSON[id]; return `
        <li class="lesson">
          <a href="#/a/${l.id}#quiz">
            <span class="num">${l.n}</span>
            <span class="lesson-text"><span class="lesson-title">${esc(l.title)}</span><span class="lesson-meta">${esc(l.subject.title)} · acertou ${q.c} de ${q.n}</span></span>
            <span class="score-pill">${q.c}/${q.n}</span>
          </a>
        </li>`; }).join("")}</ol>` : `<p class="lead">Nada por aqui ainda. Quando você errar alguma pergunta, a aula aparece nesta lista.</p>`}
    </section>`;
}

/* ---------- Matéria ---------- */
function renderSubject(id) {
  const s = SUBJECT[id]; if (!s) return renderNotFound();
  const st = subjectStats(s), nx = nextLesson(s);
  $main.innerHTML = `
    <nav class="crumbs"><a href="#/">Início</a><span aria-hidden="true">/</span><span>${esc(s.course.title)}</span></nav>
    <section class="subject-hero">
      <h1>${esc(s.title)}</h1>
      <p class="lead">${esc(s.desc)}</p>
      ${edge(s, true)}
      <div class="hero-row">
        <p>${st.done} de ${st.total} aulas assistidas</p>
        <a class="btn" href="#/a/${nx.id}">${st.done === 0 ? "Começar pela aula 1" : st.done === st.total ? "Rever a aula 1" : `Ir para a aula ${nx.n}`}</a>
      </div>
    </section>
    <ol class="lessons">
      ${s.lessons.map((l) => lessonRow(l, l.id === nx.id && st.done < st.total)).join("")}
    </ol>`;
}

function lessonRow(l, isNext, current = false) {
  const q = store.state.quiz[l.id];
  return `
    <li class="lesson${watched(l.id) ? " done" : ""}${isNext ? " next" : ""}${current ? " current" : ""}">
      <a href="#/a/${l.id}" ${current ? 'aria-current="page"' : ""}>
        <span class="num">${l.n}</span>
        <span class="lesson-text">
          <span class="lesson-title">${esc(l.title)}</span>
          <span class="lesson-meta">${l.dur}${l.teacher ? `, ${esc(l.teacher)}` : ""}${q ? `, perguntas ${q.c}/${q.n}` : ""}${isNext ? `<b class="next-tag">Próxima</b>` : ""}</span>
        </span>
        <span class="check" aria-label="${watched(l.id) ? "Assistida" : "Não assistida"}"></span>
      </a>
    </li>`;
}

/* ---------- Aula ---------- */
let player = null, ticker = null, session = null;

function renderLesson(id) {
  const l = LESSON[id]; if (!l) return renderNotFound();
  const s = l.subject, prev = s.lessons[l.n - 2], next = s.lessons[l.n];
  $main.innerHTML = `
    <nav class="crumbs"><a href="#/">Início</a><span aria-hidden="true">/</span><a href="#/m/${s.id}">${esc(s.title)}</a></nav>
    <div class="lesson-layout">
      <article class="lesson-main">
        <div class="player-wrap"><div id="player"></div></div>
        <header class="lesson-head">
          <p class="lesson-kicker">Aula ${l.n} de ${s.lessons.length}</p>
          <h1>${esc(l.title)}</h1>
          <p class="lesson-sub">${l.dur}${l.teacher ? `, com ${esc(l.teacher)}` : ""}</p>
        </header>
        <div class="watch-row">
          <button class="toggle${watched(id) ? " on" : ""}" id="mark" aria-pressed="${watched(id)}">
            <span class="box" aria-hidden="true"></span><span class="label">${watched(id) ? "Assistida" : "Marcar como assistida"}</span>
          </button>
          <span class="watch-hint" id="hint">${watched(id) ? "" : `Marcamos sozinhos quando você assistir ${Math.round(WATCH_RATIO * 100)}% do vídeo aqui.`}</span>
        </div>
        <nav class="pager">
          ${prev ? `<a href="#/a/${prev.id}" class="pager-prev"><small>Anterior</small>${esc(prev.title)}</a>` : "<span></span>"}
          ${next ? `<a href="#/a/${next.id}" class="pager-next"><small>Próxima</small>${esc(next.title)}</a>` : `<a href="#/m/${s.id}" class="pager-next"><small>Fim da matéria</small>Voltar para ${esc(s.title)}</a>`}
        </nav>
        <section class="quiz" id="quiz"></section>
      </article>
      <aside class="lesson-side">
        <h2>${esc(s.title)}</h2>
        ${edge(s)}
        <ol class="lessons compact">${s.lessons.map((x) => lessonRow(x, false, x.id === id)).join("")}</ol>
      </aside>
    </div>`;

  document.getElementById("mark").onclick = () => setWatched(l, !watched(id), true);
  renderQuiz(l);
  document.querySelector(".lesson-side .current")?.scrollIntoView({ block: "center" });
  store.setLast(id);
  mountPlayer(l);
}

async function setWatched(l, on, manual = false) {
  if (watched(l.id) === on) return;
  await store.setWatched(l.id, on);
  if (!location.hash.startsWith(`#/a/${l.id}`)) return;
  const b = document.getElementById("mark");
  b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
  b.querySelector(".label").textContent = on ? "Assistida" : "Marcar como assistida";
  document.getElementById("hint").textContent = on ? "" : `Marcamos sozinhos quando você assistir ${Math.round(WATCH_RATIO * 100)}% do vídeo aqui.`;
  document.querySelector(".lesson-side .edge").outerHTML = edge(l.subject);
  document.querySelector(".lesson-side .current")?.classList.toggle("done", on);
  if (on && !manual) toast("Aula marcada como assistida");
}

function loadYT() {
  if (window.YT?.Player) return Promise.resolve();
  if (!loadYT.p) loadYT.p = new Promise((res) => {
    window.onYouTubeIframeAPIReady = res;
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
  });
  return loadYT.p;
}

async function mountPlayer(l) {
  teardownPlayer();
  const pos = store.state.pos[l.id] || 0;
  session = { l, sec: store.state.sec[l.id] || 0, lastT: null, lastSave: Date.now() };
  await loadYT();
  if (!session || session.l !== l) return;
  player = new YT.Player("player", {
    videoId: l.id,
    playerVars: { rel: 0, modestbranding: 1, playsinline: 1, hl: "pt", start: pos > 10 && pos < l.secs - 30 ? Math.floor(pos) : 0 },
    events: {
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED) { setWatched(l, true); flush(); }
        if (e.data === YT.PlayerState.PAUSED) flush();
      }
    }
  });
  ticker = setInterval(tick, 1000);
}

function tick() {
  if (!player?.getPlayerState || !session) return;
  if (player.getPlayerState() !== YT.PlayerState.PLAYING) { session.lastT = null; return; }
  const t = player.getCurrentTime(), d = player.getDuration() || session.l.secs;
  // Conta só tempo realmente reproduzido; pulos para frente não contam.
  if (session.lastT !== null) { const dt = t - session.lastT; if (dt > 0 && dt < 3) session.sec = Math.min(d, session.sec + dt); }
  session.lastT = t; session.pos = t; session.dur = d;
  if (!watched(session.l.id) && session.sec >= d * WATCH_RATIO) setWatched(session.l, true);
  if (Date.now() - session.lastSave > 15000) flush();
}

function flush() {
  if (!session || session.pos == null) return;
  session.lastSave = Date.now();
  store.saveProgress(session.l.id, Math.round(session.sec), Math.round(session.pos));
}

function teardownPlayer() {
  flush();
  clearInterval(ticker); ticker = null;
  try { player?.destroy(); } catch { /* ok */ }
  player = null; session = null;
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

/* ---------- Perguntas ---------- */
function renderQuiz(l) {
  const box = document.getElementById("quiz");
  const qs = QUIZ[l.id];
  if (!qs?.length) { box.remove(); return; }
  const prev = store.state.quiz[l.id];
  box.innerHTML = `
    <header class="quiz-head">
      <h2>Perguntas de fixação</h2>
      <p>${prev ? `Da última vez você acertou ${prev.c} de ${prev.n}.` : `${qs.length} perguntas sobre o tema desta aula. Responda depois de assistir.`}</p>
    </header>
    <form id="qform">
      ${qs.map((q, i) => `
        <fieldset class="q" data-i="${i}">
          <legend><span class="qn">${i + 1}.</span> ${esc(q.q)}</legend>
          ${q.o.map((o, j) => `
            <label class="opt"><input type="radio" name="q${i}" value="${j}" required><span>${esc(o)}</span></label>`).join("")}
          <p class="explain" hidden></p>
        </fieldset>`).join("")}
      <div class="quiz-actions">
        <button class="btn" type="submit">Conferir respostas</button>
        <span class="score" id="score" aria-live="polite"></span>
      </div>
    </form>`;
  const form = document.getElementById("qform");
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (form.dataset.checked) { renderQuiz(l); return; }
    let c = 0;
    qs.forEach((q, i) => {
      const fs = form.querySelector(`[data-i="${i}"]`);
      const pick = Number(form.querySelector(`input[name=q${i}]:checked`).value);
      const ok = pick === q.a; if (ok) c++;
      fs.classList.add(ok ? "right" : "wrong");
      fs.querySelectorAll(".opt").forEach((lab, j) => { lab.classList.toggle("is-answer", j === q.a); lab.classList.toggle("is-picked", j === pick); lab.querySelector("input").disabled = true; });
      const ex = fs.querySelector(".explain"); ex.hidden = false;
      ex.innerHTML = `<strong>${ok ? "Certo." : `Resposta: ${esc(q.o[q.a])}.`}</strong> ${esc(q.e)}`;
    });
    form.dataset.checked = "1";
    form.querySelector("button").textContent = "Responder de novo";
    document.getElementById("score").textContent = `Você acertou ${c} de ${qs.length}.`;
    await store.saveQuiz(l.id, c, qs.length);
  };
}

/* ---------- Pregações ---------- */
function renderSermons() {
  $main.innerHTML = `
    <section class="dash-hello perf-head">
      <p class="eyebrow">Pregações</p>
      <h1>Pregações para ouvir e ler</h1>
      <p class="lead">Cada pregação tem o vídeo e um resumo para leitura, com os pontos principais da mensagem.</p>
    </section>
    <ul class="cards sermons">
      ${SERMONS.map((s) => `
      <li>
        <a class="card" href="#/s/${s.id}">
          <span class="card-cover"><img src="${thumb(s.id)}" alt="" loading="lazy"><span class="card-badge">${s.dur}</span></span>
          <span class="card-body">
            <span class="card-kicker">${esc(s.text)}</span>
            <span class="card-title">${esc(s.title)}</span>
            <span class="card-desc">${esc(s.lead)}</span>
            <span class="card-meta"><span>${esc(s.preacher)}</span><span>Ler resumo</span></span>
          </span>
        </a>
      </li>`).join("")}
    </ul>`;
}

function renderSermon(id) {
  const s = SERMONS.find((x) => x.id === id); if (!s) return renderNotFound();
  $main.innerHTML = `
    <nav class="crumbs"><a href="#/">Início</a><span aria-hidden="true">/</span><a href="#/s">Pregações</a></nav>
    <article class="sermon">
      <div class="player-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${s.id}?rel=0&modestbranding=1&playsinline=1&hl=pt" title="${esc(s.title)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
      <header class="lesson-head">
        <p class="lesson-kicker">${esc(s.text)}</p>
        <h1>${esc(s.title)}</h1>
        <p class="lesson-sub">${esc(s.preacher)} · ${esc(s.source)} · ${s.dur}</p>
      </header>
      <div class="sermon-body">
        <h2>Resumo</h2>
        <p class="sermon-lead">${esc(s.lead)}</p>
        ${s.sections.map((sec) => `
          <section>
            <h3>${esc(sec.h)}</h3>
            ${sec.p.map((p) => `<p>${esc(p)}</p>`).join("")}
          </section>`).join("")}
        ${s.takeaway ? `<aside class="takeaway"><strong>Para guardar</strong><p>${esc(s.takeaway)}</p></aside>` : ""}
      </div>
    </article>`;
}

/* ---------- Resumos de livros ---------- */
// Cada livro vira uma sequência de aulas curtas, uma por capítulo.
const bookById = (id) => BOOKS.find((b) => b.id === id);
const bookDone = (b, n) => Boolean(store.state.books?.[b.id]?.done?.[n]);
const bookStats = (b) => { const done = b.chapters.filter((c) => bookDone(b, c.n)).length; return { done, total: b.chapters.length, pct: Math.round((done / b.chapters.length) * 100) }; };
const bookNext = (b) => {
  const last = store.state.books?.[b.id]?.last;
  const i = b.chapters.findIndex((c) => c.n === last);
  if (i >= 0 && !bookDone(b, last)) return b.chapters[i];
  return b.chapters.slice(Math.max(0, i)).find((c) => !bookDone(b, c.n)) || b.chapters.find((c) => !bookDone(b, c.n)) || b.chapters[0];
};
const cover = (b) => `
  <span class="cover" aria-hidden="true"${b.colors ? ` style="--c1:${b.colors[0]};--c2:${b.colors[1]}"` : ""}>
    <span class="cover-author">${esc(b.author)}</span>
    <span class="cover-title${Math.max(...b.title.split(" ").map((w) => w.length)) > 11 ? " long" : ""}">${esc(b.title)}</span>
    <span class="cover-sub">${esc(b.subtitle || "")}</span>
  </span>`;
const bookEdge = (b) => `<div class="edge" role="img" aria-label="${bookStats(b).done} de ${b.chapters.length} aulas estudadas">${b.chapters.map((c) => `<span class="${bookDone(b, c.n) ? "on" : ""}" title="${esc(`${c.n}. ${c.title}`)}"></span>`).join("")}</div>`;

function renderBooks() {
  $main.innerHTML = `
    <section class="dash-hello perf-head">
      <p class="eyebrow">Resumos de livros</p>
      <h1>Resumos de livros</h1>
      <p class="lead">Cada livro foi dividido em aulas curtas, uma por capítulo, com os pontos principais, os termos e perguntas para revisar.</p>
    </section>
    <ul class="shelf">
      ${BOOKS.map((b) => {
        const st = bookStats(b);
        return `
        <li>
          <a class="shelf-item" href="#/l/${b.id}">
            ${cover(b)}
            <span class="shelf-text">
              <span class="card-title">${esc(b.title)}</span>
              <span class="shelf-meta">${esc(b.author)} · ${st.total} aulas</span>
              ${st.done ? `<span class="meter"><span style="width:${st.pct}%"></span></span><span class="shelf-meta">${st.done} de ${st.total} estudadas</span>` : ""}
            </span>
          </a>
        </li>`;
      }).join("")}
    </ul>`;
}

function renderBook(id) {
  const b = bookById(id); if (!b) return renderNotFound();
  const st = bookStats(b), nx = bookNext(b);
  $main.innerHTML = `
    <nav class="crumbs"><a href="#/">Início</a><span aria-hidden="true">/</span><a href="#/l">Resumos de livros</a></nav>
    <section class="book-hero">
      ${cover(b)}
      <div class="book-info">
        <p class="eyebrow">Resumo em aulas · ${esc(b.author)}</p>
        <h1>${esc(b.title)}</h1>
        <p class="book-sub">${esc(b.subtitle || "")}</p>
        <p class="lead">${esc(b.desc)}</p>
        ${bookEdge(b)}
        <div class="hero-row">
          <p>${st.done} de ${st.total} aulas estudadas</p>
          <a class="btn" href="#/l/${b.id}/${nx.n}">${st.done === 0 ? "Começar pela aula 1" : st.done === st.total ? "Rever a aula 1" : `Continuar na aula ${nx.n}`}</a>
        </div>
      </div>
    </section>
    <section class="study">
      ${bookGroups(b).map((g) => `
        <div class="study-part">
          ${g.part ? `<h2><span>Parte ${g.part.n}</span>${esc(g.part.title)}</h2>` : ""}
          <ol class="lessons">
            ${g.chapters.map((c) => `
              <li class="lesson${bookDone(b, c.n) ? " done" : ""}${c.n === nx.n && st.done < st.total ? " next" : ""}">
                <a href="#/l/${b.id}/${c.n}">
                  <span class="num">${c.n}</span>
                  <span class="lesson-text"><span class="lesson-title">${esc(c.title)}</span>${c.by ? `<span class="lesson-meta">${esc(c.by)}</span>` : ""}<span class="study-idea">${esc(c.idea)}</span></span>
                  <span class="check" aria-label="${bookDone(b, c.n) ? "Estudada" : "Não estudada"}"></span>
                </a>
              </li>`).join("")}
          </ol>
        </div>`).join("")}
    </section>`;
}

// Agrupa as aulas em sequência: as de uma mesma parte ficam juntas; introdução e conclusão ficam soltas.
function bookGroups(b) {
  const groups = [];
  for (const c of b.chapters) {
    const last = groups.at(-1);
    if (last && last.key === c.part) last.chapters.push(c);
    else groups.push({ key: c.part, part: b.parts.find((p) => p.n === c.part), chapters: [c] });
  }
  return groups;
}

function renderBookLesson(id, n) {
  const b = bookById(id); if (!b) return renderNotFound();
  const i = b.chapters.findIndex((c) => c.n === Number(n)); if (i < 0) return renderNotFound();
  const c = b.chapters[i], prev = b.chapters[i - 1], next = b.chapters[i + 1];
  const part = b.parts.find((p) => p.n === c.part);
  const done = bookDone(b, c.n);
  $main.innerHTML = `
    <nav class="crumbs"><a href="#/l">Resumos de livros</a><span aria-hidden="true">/</span><a href="#/l/${b.id}">${esc(b.title)}</a></nav>
    <article class="sermon study-ch">
      <header class="lesson-head">
        <p class="lesson-kicker">Aula ${c.n} de ${b.chapters.length}${part ? ` · Parte ${part.n}: ${esc(part.title)}` : ""}${c.by ? ` · ${esc(c.by)}` : ""}</p>
        <h1>${esc(c.title)}</h1>
        <p class="study-big-idea">${esc(c.idea)}</p>
      </header>
      <div class="sermon-body">
        ${c.lesson.map((p) => `<p>${esc(p)}</p>`).join("")}
        <h3>Para guardar</h3>
        <ul class="study-points">${c.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        ${c.terms?.length ? `<h3>Termos</h3><dl class="study-terms">${c.terms.map((t) => `<div><dt>${esc(t.t)}</dt><dd>${esc(t.d)}</dd></div>`).join("")}</dl>` : ""}
        ${c.verses?.length ? `<h3>Passagens</h3><p class="study-verses">${c.verses.map((v) => `<span>${esc(v)}</span>`).join("")}</p>` : ""}
        ${c.questions?.length ? `
          <h3>Perguntas de revisão</h3>
          <p class="study-hint">Tente responder antes de abrir a resposta.</p>
          <div class="study-qa">${c.questions.map((q, k) => `
            <details><summary><span class="qn">${k + 1}.</span> ${esc(q)}</summary><p>${esc(c.answers?.[k] || "")}</p></details>`).join("")}
          </div>` : ""}
      </div>
      <div class="watch-row">
        <button class="toggle${done ? " on" : ""}" id="mark" aria-pressed="${done}">
          <span class="box" aria-hidden="true"></span><span class="label">${done ? "Aula estudada" : "Marcar como estudada"}</span>
        </button>
      </div>
      <nav class="pager">
        ${prev ? `<a href="#/l/${b.id}/${prev.n}" class="pager-prev"><small>Aula ${prev.n}</small>${esc(prev.title)}</a>` : "<span></span>"}
        ${next ? `<a href="#/l/${b.id}/${next.n}" class="pager-next"><small>Aula ${next.n}</small>${esc(next.title)}</a>` : `<a href="#/l/${b.id}" class="pager-next"><small>Fim das aulas</small>Voltar ao livro</a>`}
      </nav>
    </article>`;
  store.setBookLast(b.id, c.n);
  document.getElementById("mark").onclick = async (e) => {
    const on = !bookDone(b, c.n);
    await store.setBookDone(b.id, c.n, on);
    const btn = e.currentTarget;
    btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", on);
    btn.querySelector(".label").textContent = on ? "Aula estudada" : "Marcar como estudada";
    if (on) toast(next ? "Aula marcada. Próxima: " + next.title : "Você terminou todas as aulas deste livro");
  };
}

function renderNotFound() {
  $main.innerHTML = `<section class="hello"><h1>Página não encontrada</h1><p class="lead"><a href="#/">Voltar ao início</a></p></section>`;
}

/* ---------- Rotas ---------- */
function route() {
  if (!ready) return;
  const [, kind, rawId, sub] = location.hash.split("/");
  const [id, anchor] = (rawId || "").split("#");
  if (kind !== "a") teardownPlayer();
  document.getElementById("topnav").hidden = !store.user;
  document.querySelectorAll("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === (["p", "s", "l"].includes(kind) ? kind : kind ? "" : "home")));
  if (!store.user) { renderSignIn(); return; }
  if (kind === "s") id ? renderSermon(id) : renderSermons();
  else if (kind === "l") id ? (sub ? renderBookLesson(id, sub) : renderBook(id)) : renderBooks();
  else if (kind === "m") renderSubject(id);
  else if (kind === "a") renderLesson(id);
  else if (kind === "p") renderPerf();
  else renderHome();
  if (anchor) { document.getElementById(anchor)?.scrollIntoView(); return; }
  $main.focus({ preventScroll: true });
  if (kind !== "a" || !route.sameLesson) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

// Tema: segue o sistema até a pessoa escolher; a escolha fica salva neste navegador.
document.getElementById("theme").onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("estudos:theme", root.dataset.theme); } catch { /* ignora */ }
};

(async function boot() {
  $main.innerHTML = `<p class="loading">Carregando aulas…</p>`;
  // O leitor de livros foi removido: apaga o texto que tenha ficado guardado neste aparelho.
  try { indexedDB.deleteDatabase("estudos-livros"); } catch { /* ignora */ }
  await loadData();
  if (!isConfigured) { $banner.hidden = false; $banner.textContent = "Modo demonstração: o progresso fica salvo só neste navegador. Configure o Firebase para ativar o login com Google."; }
  await store.init(() => { ready = true; renderAccount(); route(); });
})();
