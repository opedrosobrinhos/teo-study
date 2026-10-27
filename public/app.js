import { store, isConfigured } from "./store.js";

const $main = document.getElementById("main");
const $account = document.getElementById("account");
const $banner = document.getElementById("banner");
const $toast = document.getElementById("toast");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toSec = (d) => (d || "0:00").split(":").reduce((a, n) => a * 60 + Number(n), 0);
const fmtHours = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const WATCH_RATIO = 0.85;

let COURSES = [], QUIZ = {}, LESSON = {}, SUBJECT = {}, ready = false;

function toast(msg) {
  $toast.textContent = msg; $toast.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => $toast.classList.remove("show"), 2600);
}

async function loadData() {
  const [c, q] = await Promise.all([fetch("data/courses.json").then((r) => r.json()), fetch("data/quiz.json").then((r) => r.json()).catch(() => ({}))]);
  COURSES = c; QUIZ = q;
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
  const total = COURSES.reduce((a, c) => a + courseStats(c).total, 0);
  $main.innerHTML = `
    <section class="signin">
      <div class="signin-copy">
        <h1>Suas aulas de teologia, em ordem e acompanhadas</h1>
        <p>${total} aulas de três cursos do RTM Brasil, separadas por matéria. Assista aqui, veja quanto falta em cada matéria e responda perguntas para fixar o conteúdo.</p>
        <button class="btn btn-google" id="signin">
          <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
          Entrar com Google
        </button>
        <p class="fine">Usamos sua conta Google só para guardar quais aulas você já assistiu e suas respostas.</p>
      </div>
      <div class="signin-books" aria-hidden="true">
        ${COURSES.flatMap((c) => c.subjects).map((s, i) => `<span class="spine" style="--h:${70 + ((i * 37) % 30)}%"><em>${esc(s.title)}</em></span>`).join("")}
      </div>
    </section>`;
  document.getElementById("signin").onclick = async () => {
    try { await store.signIn(); } catch (e) { console.error(e); toast("Não foi possível entrar. Tente de novo."); }
  };
}

/* ---------- Início ---------- */
function renderHome() {
  const all = COURSES.reduce((a, c) => { const x = courseStats(c); a.done += x.done; a.total += x.total; return a; }, { done: 0, total: 0 });
  const first = (store.user?.name || "").split(" ")[0];
  const last = store.state.last && LESSON[store.state.last.vid];
  const cont = last ? (watched(last.id) ? (last.subject.lessons[last.n] || nextLesson(last.subject)) : last) : null;
  const resumeAt = cont && store.state.pos[cont.id] > 10 ? ` a partir de ${Math.floor(store.state.pos[cont.id] / 60)}:${String(Math.floor(store.state.pos[cont.id] % 60)).padStart(2, "0")}` : "";

  $main.innerHTML = `
    <section class="hello">
      <h1>${first && !store.user?.demo ? `Olá, ${esc(first)}` : "Seus estudos"}</h1>
      <p class="lead">${all.done ? `Você já assistiu <strong>${all.done}</strong> de ${all.total} aulas.` : `São ${all.total} aulas em ${Object.keys(SUBJECT).length} matérias. Escolha uma para começar.`}</p>
      ${cont ? `
      <a class="continue" href="#/a/${cont.id}">
        <img src="${thumb(cont.id)}" alt="" loading="lazy">
        <span class="continue-body">
          <span class="continue-kicker">Continuar${resumeAt}</span>
          <span class="continue-title">${esc(cont.title)}</span>
          <span class="continue-meta">${esc(cont.subject.title)}, aula ${cont.n} de ${cont.subject.lessons.length}</span>
        </span>
      </a>` : ""}
    </section>
    ${COURSES.map((c) => {
      const cs = courseStats(c);
      return `
      <section class="course">
        <header class="course-head">
          <h2>${esc(c.title)}</h2>
          <p>${cs.done}/${cs.total} aulas</p>
        </header>
        <ul class="subjects">
          ${c.subjects.map((s) => {
            const st = subjectStats(s); const hrs = fmtHours(s.lessons.reduce((a, l) => a + l.secs, 0));
            return `
            <li>
              <a class="subject" href="#/m/${s.id}">
                <span class="subject-text">
                  <span class="subject-title">${esc(s.title)}</span>
                  <span class="subject-desc">${esc(s.desc)}</span>
                  <span class="subject-meta">${st.total} aulas, ${hrs}</span>
                </span>
                <span class="subject-progress">
                  ${edge(s)}
                  <span class="pct">${st.pct === 100 ? "Concluída" : `${st.pct}%`}</span>
                </span>
              </a>
            </li>`;
          }).join("")}
        </ul>
      </section>`;
    }).join("")}`;
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
  if (location.hash !== `#/a/${l.id}`) return;
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

function renderNotFound() {
  $main.innerHTML = `<section class="hello"><h1>Página não encontrada</h1><p class="lead"><a href="#/">Voltar ao início</a></p></section>`;
}

/* ---------- Rotas ---------- */
function route() {
  if (!ready) return;
  const [, kind, id] = location.hash.split("/");
  if (kind !== "a") teardownPlayer();
  if (!store.user) { renderSignIn(); return; }
  if (kind === "m") renderSubject(id);
  else if (kind === "a") renderLesson(id);
  else renderHome();
  $main.focus({ preventScroll: true });
  if (kind !== "a" || !route.sameLesson) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

(async function boot() {
  $main.innerHTML = `<p class="loading">Carregando aulas…</p>`;
  await loadData();
  if (!isConfigured) { $banner.hidden = false; $banner.textContent = "Modo demonstração: o progresso fica salvo só neste navegador. Configure o Firebase para ativar o login com Google."; }
  await store.init(() => { ready = true; renderAccount(); route(); });
})();
