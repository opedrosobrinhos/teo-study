// Guarda o progresso de cada pessoa.
// Com Firebase configurado: login com Google + Firestore (users/{uid}).
// Sem configuração: modo demonstração com localStorage.
import { firebaseConfig } from "./firebase-config.js?v=3";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const empty = () => ({ watched: {}, sec: {}, pos: {}, quiz: {}, last: null, books: {} });

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

class LocalStore {
  constructor() { this.mode = "local"; this.user = null; this.state = empty(); }
  async init(onChange) {
    try { this.state = { ...empty(), ...JSON.parse(localStorage.getItem("estudos:v1") || "{}") }; } catch { /* sem storage */ }
    this.user = { name: "Modo demonstração", email: null, photo: null, demo: true };
    onChange(this.user);
  }
  _save() { try { localStorage.setItem("estudos:v1", JSON.stringify(this.state)); } catch { /* ignora */ } }
  async signIn() {} async signOut() {}
  async setWatched(vid, on) { on ? (this.state.watched[vid] = Date.now()) : delete this.state.watched[vid]; this._save(); }
  async saveProgress(vid, sec, pos) { this.state.sec[vid] = sec; this.state.pos[vid] = pos; this.state.last = { vid, at: Date.now() }; this._save(); }
  async setLast(vid) { this.state.last = { vid, at: Date.now() }; this._save(); }
  async saveQuiz(vid, c, n) { this.state.quiz[vid] = { c, n, at: Date.now() }; this._save(); }
  async setBookLast(id, n) { this.state.books[id] = { ...this.state.books[id], last: n, at: Date.now() }; this._save(); }
  async setBookDone(id, n, on) {
    const b = (this.state.books[id] = { done: {}, ...this.state.books[id] });
    b.done = { ...b.done }; on ? (b.done[n] = Date.now()) : delete b.done[n]; this._save();
  }
}

class FirebaseStore {
  constructor() { this.mode = "firebase"; this.user = null; this.state = empty(); }
  async init(onChange) {
    const [{ initializeApp }, auth, fs] = await Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`)
    ]);
    this.a = auth; this.f = fs;
    const app = initializeApp(firebaseConfig);
    this.auth = auth.getAuth(app); this.auth.languageCode = "pt";
    this.db = fs.getFirestore(app);
    auth.onAuthStateChanged(this.auth, async (u) => {
      if (!u) { this.user = null; this.ref = null; this.state = empty(); onChange(null); return; }
      this.user = { uid: u.uid, name: u.displayName || u.email, email: u.email, photo: u.photoURL };
      this.ref = fs.doc(this.db, "users", u.uid);
      try {
        const snap = await fs.getDoc(this.ref);
        this.state = { ...empty(), ...(snap.exists() ? snap.data() : {}) };
        if (!snap.exists()) await fs.setDoc(this.ref, { email: u.email || null, name: this.user.name, createdAt: Date.now() }, { merge: true });
      } catch (e) { console.error(e); this.error = e; }
      onChange(this.user);
    });
  }
  async signIn() {
    const p = new this.a.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try { await this.a.signInWithPopup(this.auth, p); }
    catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await this.a.signInWithRedirect(this.auth, p);
      else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") throw e;
    }
  }
  async signOut() { await this.a.signOut(this.auth); }
  _merge(data) { return this.f.setDoc(this.ref, { ...data, updatedAt: Date.now() }, { merge: true }).catch(console.error); }
  async setWatched(vid, on) {
    if (on) { this.state.watched[vid] = Date.now(); return this._merge({ watched: { [vid]: this.state.watched[vid] } }); }
    delete this.state.watched[vid];
    return this.f.updateDoc(this.ref, new this.f.FieldPath("watched", vid), this.f.deleteField()).catch(console.error);
  }
  async saveProgress(vid, sec, pos) {
    this.state.sec[vid] = sec; this.state.pos[vid] = pos; this.state.last = { vid, at: Date.now() };
    return this._merge({ sec: { [vid]: sec }, pos: { [vid]: pos }, last: this.state.last });
  }
  async setLast(vid) { this.state.last = { vid, at: Date.now() }; return this._merge({ last: this.state.last }); }
  async saveQuiz(vid, c, n) { this.state.quiz[vid] = { c, n, at: Date.now() }; return this._merge({ quiz: { [vid]: this.state.quiz[vid] } }); }
  // Resumos de livros: última aula aberta e aulas marcadas como estudadas.
  async setBookLast(id, n) {
    this.state.books[id] = { ...this.state.books[id], last: n, at: Date.now() };
    return this._merge({ books: { [id]: { last: n, at: this.state.books[id].at } } });
  }
  async setBookDone(id, n, on) {
    const b = (this.state.books[id] = { done: {}, ...this.state.books[id] });
    b.done = { ...b.done };
    if (on) { b.done[n] = Date.now(); return this._merge({ books: { [id]: { done: { [n]: b.done[n] } } } }); }
    delete b.done[n];
    return this.f.updateDoc(this.ref, new this.f.FieldPath("books", id, "done", String(n)), this.f.deleteField()).catch(console.error);
  }
}

export const store = isConfigured ? new FirebaseStore() : new LocalStore();
