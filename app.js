// ==================== CONFIG ====================
const SUPABASE_URL = 'https://vbqjtpfqrktwgfefzmbf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZicWp0cGZxcmt0d2dmZWZ6bWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NDU5MjAsImV4cCI6MjEwNTEyMTkyMH0._Obsduv7-cHn52jg6-Lsg1DVfdn6_khaYHHjBfT1NBE';
const CLAUDE_API = '/api/groq';
const GROQ_MODEL = 'openai/gpt-oss-120b';

const SUBJECTS = [
  { name: 'Mathematics', emoji: '📐', color: '#6366f1', tag: 'tag-math' },
  { name: 'Science', emoji: '🔬', color: '#10b981', tag: 'tag-science' },
  { name: 'Social Studies', emoji: '🌍', color: '#f59e0b', tag: 'tag-sst' },
  { name: 'English', emoji: '📖', color: '#ef4444', tag: 'tag-english' },
  { name: 'Hindi', emoji: '🇮🇳', color: '#a855f7', tag: 'tag-hindi' },
  { name: 'Sanskrit', emoji: '🕉️', color: '#f97316', tag: 'tag-sanskrit' }
];

// ==================== STATE ====================
let books = [];
let sessions = [];
let quizData = { questions: [], current: 0, score: 0, selectedSubject: null };
let fcData = { cards: [], current: 0, correct: 0, flipped: false, selectedBook: null };
let selectedDoubtBook = null;
let chatHistory = [];
let isAILoading = false;

// ==================== SUPABASE ====================
async function sbFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.status === 204 ? null : res.json();
}

async function initDB() {
  // Create tables via SQL endpoint if needed
  // Tables: books (id, name, subject, pages, text_content, created_at)
  //         sessions (id, subject, topic, duration, date, notes, created_at)
  //         flashcards (id, book_id, front, back, created_at)
  //         quiz_results (id, subject, score, total, created_at)
  try {
    await sbFetch('books?limit=1');
  } catch(e) {
    await createTables();
  }
}

async function createTables() {
  const sql = `
    create table if not exists books (
      id uuid default gen_random_uuid() primary key,
      name text not null,
      subject text,
      pages integer default 0,
      text_content text default '',
      pdf_url text default '',
      created_at timestamptz default now()
    );
    create table if not exists sessions (
      id uuid default gen_random_uuid() primary key,
      subject text not null,
      topic text not null,
      duration integer not null,
      date date not null,
      notes text default '',
      created_at timestamptz default now()
    );
    create table if not exists flashcards (
      id uuid default gen_random_uuid() primary key,
      book_id uuid references books(id) on delete cascade,
      front text not null,
      back text not null,
      created_at timestamptz default now()
    );
    create table if not exists quiz_results (
      id uuid default gen_random_uuid() primary key,
      subject text not null,
      score integer not null,
      total integer not null,
      created_at timestamptz default now()
    );
    create table if not exists saved_answers (
      id uuid default gen_random_uuid() primary key,
      text text not null,
      subject text default 'General',
      chapter text default 'General',
      saved_at timestamptz default now()
    );
    create table if not exists copy_records (
      id uuid default gen_random_uuid() primary key,
      book_id uuid references books(id) on delete cascade,
      completed boolean default false,
      pdf_url text default '',
      student_remark text default '',
      senior_remark text default '',
      completed_at timestamptz,
      updated_at timestamptz default now()
    );
  `;
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
}

// ==================== NAVIGATION ====================
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  const tabs = ['dashboard','books','copies','quiz','flashcards','doubt','saved'];
  document.querySelectorAll('.nav-tab')[tabs.indexOf(page)].classList.add('active');
  if (page === 'dashboard') renderDashboard();
  if (page === 'books') renderBooks();
  if (page === 'quiz') renderQuizSetup();
  if (page === 'flashcards') renderFCSetup();
  if (page === 'saved') renderSaved();
  if (page === 'copies') renderCopies();
  if (page === 'doubt') renderDoubtBooks();
}

// ==================== GREETING ====================
function setGreeting() {
  const h = new Date().getHours();
  const greet = h >= 0 && h < 6 ? 'Hello' :
                h < 12 ? 'Good Morning' :
                h < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetEl = document.getElementById('greetingText');
  if (greetEl) greetEl.innerHTML = `${greet},<br><span>Master Aarav!</span>`;
  const dateEl = document.getElementById('greetingDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ==================== DASHBOARD ====================
function renderDashboard() {
  setGreeting();
  renderStats();
  renderSubjectProgress();
  renderTodayPlan();
  renderRecentSessions();
  renderHeatmap();
}

function renderStats() {
  const weekSessions = sessions.filter(s => {
    const d = new Date(s.date);
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000);
    return d >= weekAgo;
  });
  const totalMins = weekSessions.reduce((a, b) => a + (b.duration || 0), 0);
  document.getElementById('statHours').textContent = (totalMins / 60).toFixed(1);
  document.getElementById('statTopics').textContent = sessions.length;
  document.getElementById('statBooks').textContent = books.length;

  // Quiz accuracy from localStorage
  const results = JSON.parse(localStorage.getItem('quiz_results') || '[]');
  if (results.length > 0) {
    const avg = results.reduce((a, b) => a + (b.score / b.total * 100), 0) / results.length;
    document.getElementById('statScore').textContent = Math.round(avg) + '%';
  }

  // Streak
  const streak = calcStreak();
  document.getElementById('streakBadge').innerHTML = `🔥 ${streak} day${streak !== 1 ? 's' : ''}`;
}

function calcStreak() {
  if (!sessions.length) return 0;
  const dates = [...new Set(sessions.map(s => s.date))].sort().reverse();
  let streak = 0;
  let check = new Date();
  check.setHours(0,0,0,0);
  for (const d of dates) {
    const sd = new Date(d);
    sd.setHours(0,0,0,0);
    const diff = (check - sd) / 86400000;
    if (diff <= 1) { streak++; check = sd; }
    else break;
  }
  return streak;
}

function renderSubjectProgress() {
  const container = document.getElementById('subjectProgress');
  const counts = {};
  sessions.forEach(s => { counts[s.subject] = (counts[s.subject] || 0) + 1; });
  const max = Math.max(...Object.values(counts), 1);

  container.innerHTML = SUBJECTS.map(sub => {
    const count = counts[sub.name] || 0;
    const pct = Math.round((count / max) * 100);
    return `
      <div class="subject-row">
        <div class="subject-icon" style="background:${sub.color}22">${sub.emoji}</div>
        <div class="subject-info">
          <div class="subject-name">${sub.name}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%;background:${sub.color}"></div>
          </div>
        </div>
        <div class="subject-pct">${count}h</div>
      </div>`;
  }).join('');
}

function renderTodayPlan() {
  const container = document.getElementById('todayList');
  const today = sessions.filter(s => s.date === new Date().toISOString().split('T')[0]);

  let html = '';

  // Show live session timer if active
  if (activeSession) {
    html += `<div style="background:rgba(33,102,192,0.1);border:1px solid rgba(33,102,192,0.3);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse-dot 1s infinite"></div>
          <span style="font-size:11px;font-weight:800;color:var(--green);text-transform:uppercase;letter-spacing:1px">Session Live</span>
        </div>
        <button onclick="endSession(false)" style="background:var(--ca-red);color:white;border:none;border-radius:6px;padding:3px 10px;font-size:10px;font-weight:800;cursor:pointer;font-family:inherit;text-transform:uppercase">End ✕</button>
      </div>
      <div style="font-family:'Bangers',cursive;font-size:32px;color:var(--text);letter-spacing:2px;line-height:1;margin-bottom:4px" id="sessionTimerDisplay">00:00</div>
      <div style="font-size:11px;color:var(--text-muted);font-weight:600">📚 Subjects: <span id="sessionSubjectsDisplay">No subjects yet</span></div>
    </div>`;
  }

  if (!today.length && !activeSession) {
    html += `<div style="text-align:center;padding:16px 0">
      <div style="font-size:32px;margin-bottom:8px">🤖</div>
      <div style="background:rgba(33,102,192,0.12);border:1px solid rgba(33,102,192,0.25);border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;color:var(--text-dim);margin-bottom:10px;font-style:italic">"Avengers assemble! Log your study session before you start, soldier!"</div>
      <button onclick="startAutoSession()" style="background:var(--ca-red);color:white;border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;text-transform:uppercase;letter-spacing:1px">⚡ Start Session</button>
    </div>`;
  } else if (today.length) {
    html += today.map(s => `
      <div class="today-item">
        <div class="today-check done">✓</div>
        <div class="today-text">${s.topic}</div>
        <div class="today-tag ${getTagClass(s.subject)}" style="padding:3px 8px;border-radius:20px;font-size:11px;font-weight:500">${s.subject.split(' ')[0]}</div>
      </div>`).join('');
  }

  container.innerHTML = html;
}

function getTagClass(subject) {
  const map = { 'Mathematics': 'tag-math', 'Science': 'tag-science', 'Social Studies': 'tag-sst', 'English': 'tag-english', 'Hindi': 'tag-hindi', 'Sanskrit': 'tag-sanskrit' };
  return map[subject] || 'tag-math';
}

function renderRecentSessions() {
  const container = document.getElementById('recentSessions');
  const recent = [...sessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
  if (!recent.length) {
    container.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:8px 0">No sessions yet. Start your first session!</div>`;
    return;
  }
  container.innerHTML = recent.map(s => `
    <div class="log-entry" id="session-row-${s.id}">
      <div class="log-entry-left">
        <div style="font-weight:600">${s.topic}</div>
        <div style="font-size:11px;color:var(--text-muted)">${s.subject?.split(' ')[0] || '—'} ${s.notes ? '· ' + s.notes : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="log-entry-right">${s.duration}m · ${formatDate(s.date)}</div>
        <button onclick="seniorDeleteSession('${s.id}')" title="Senior delete (PIN required)"
          style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;padding:2px 4px;border-radius:4px;opacity:0.5;transition:opacity 0.15s"
          onmouseover="this.style.opacity=1;this.style.color='var(--ca-red)'"
          onmouseout="this.style.opacity=0.5;this.style.color='var(--text-muted)'">🔒✕</button>
      </div>
    </div>`).join('');
}

function seniorDeleteSession(sessionId) {
  // Require PIN
  const overlay = document.createElement('div');
  overlay.className = 'pin-modal-overlay';
  overlay.id = 'sessionDeletePin';
  overlay.innerHTML = `<div class="pin-modal">
    <h3>🔒 Senior Access</h3>
    <p>Enter PIN to delete this session</p>
    <input class="pin-input" type="password" maxlength="4" id="delPinInput" placeholder="••••"
      oninput="if(this.value.length===4)confirmDeleteSession('${sessionId}')">
    <div class="pin-modal-btns">
      <button class="btn btn-ghost" onclick="document.getElementById('sessionDeletePin').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmDeleteSession('${sessionId}')">Delete</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('delPinInput')?.focus(), 100);
}

async function confirmDeleteSession(sessionId) {
  const val = document.getElementById('delPinInput')?.value;
  if (val !== SENIOR_PIN) {
    const inp = document.getElementById('delPinInput');
    if (inp) { inp.style.borderColor = 'var(--ca-red)'; inp.value = ''; inp.placeholder = 'Wrong PIN'; }
    return;
  }
  document.getElementById('sessionDeletePin')?.remove();
  sessions = sessions.filter(s => String(s.id) !== String(sessionId));
  try { await sbFetch(`sessions?id=eq.${sessionId}`, 'DELETE'); } catch(e) {}
  renderDashboard();
  showToast('Session deleted ✓', 'success');
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function renderHeatmap() {
  const container = document.getElementById('heatmap');
  const days = 28;
  const counts = {};
  sessions.forEach(s => { counts[s.date] = (counts[s.date] || 0) + s.duration; });
  const maxMins = Math.max(...Object.values(counts), 1);

  let html = '';
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const mins = counts[key] || 0;
    const level = mins === 0 ? '' : mins / maxMins < 0.25 ? 'h1' : mins / maxMins < 0.5 ? 'h2' : mins / maxMins < 0.75 ? 'h3' : 'h4';
    html += `<div class="heatmap-day ${level}" title="${key}: ${mins}min"></div>`;
  }
  container.innerHTML = html;
}

// ==================== AUTO SESSION SYSTEM ====================
const SESSION_INACTIVITY_MS = 4 * 60 * 1000;
const SESSION_POPUP_INTERVAL_MS = 2 * 60 * 1000;
const SESSION_POST_END_DELAY_MS = 10 * 60 * 1000;
const SESSION_DRAFT_KEY = 'aarav_session_draft';

let activeSession = null;
let inactivityTimer = null;
let popupTimer = null;
let draftSaveInterval = null;

function startAutoSession() {
  if (activeSession) return;
  if (popupTimer) { clearInterval(popupTimer); popupTimer = null; }
  closeSRPopup();

  activeSession = { startTime: Date.now(), subjects: new Set(), timerInterval: null };
  if (selectedDoubtBook?.subject) activeSession.subjects.add(selectedDoubtBook.subject);
  activeSession.timerInterval = setInterval(updateSessionTimer, 1000);

  resetInactivityTimer();
  ['mousemove','keydown','click','scroll','touchstart'].forEach(evt => {
    document.addEventListener(evt, onUserActivity, { passive: true });
  });

  draftSaveInterval = setInterval(saveDraftSession, 60000);

  updateSessionTimer();
  renderTodayPlan();
  showToast('Session started! Study hard, soldier! 🛡️', 'success');
}

function saveDraftSession() {
  if (!activeSession) return;
  localStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify({
    startTime: activeSession.startTime,
    subjects: [...activeSession.subjects],
    savedAt: Date.now()
  }));
}

function clearDraftSession() { localStorage.removeItem(SESSION_DRAFT_KEY); }

function checkForDraftSession() {
  const raw = localStorage.getItem(SESSION_DRAFT_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    const ageMs = Date.now() - draft.savedAt;
    if (ageMs > 12 * 60 * 60 * 1000) { clearDraftSession(); return; }
    const mins = Math.max(1, Math.round((draft.savedAt - draft.startTime) / 60000));
    const subjects = draft.subjects || [];
    const overlay = document.createElement('div');
    overlay.className = 'pin-modal-overlay';
    overlay.id = 'draftRecoveryOverlay';
    overlay.innerHTML = `<div class="pin-modal" style="max-width:320px">
      <div style="font-size:28px;margin-bottom:8px">📋</div>
      <h3 style="color:var(--ca-gold)">Unsaved Session Found!</h3>
      <p style="margin:8px 0 4px">Looks like you closed the app without saving.</p>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px"><strong>${mins} min</strong> · ${subjects.join(', ') || 'General Study'}</p>
      <div class="pin-modal-btns">
        <button class="btn btn-ghost" onclick="discardDraft()">Discard</button>
        <button class="btn btn-primary" onclick="recoverDraft(${draft.startTime}, ${JSON.stringify(subjects).replace(/"/g,"'")}, ${mins})">💾 Save It</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  } catch(e) { clearDraftSession(); }
}

async function recoverDraft(startTime, subjects, mins) {
  document.getElementById('draftRecoveryOverlay')?.remove();
  clearDraftSession();
  const date = new Date(startTime).toISOString().split('T')[0];
  const topic = subjects.length ? subjects.join(', ') : 'General Study';
  const session = { subject: subjects[0] || 'General', topic, duration: mins, date, notes: 'Recovered from unsaved session' };
  try {
    const saved = await sbFetch('sessions', 'POST', session);
    sessions.push(Array.isArray(saved) ? saved[0] : { ...session, id: Date.now(), created_at: new Date().toISOString() });
  } catch(e) { sessions.push({ ...session, id: Date.now(), created_at: new Date().toISOString() }); }
  renderDashboard();
  showToast(`Recovered session saved! ${mins} min ✓`, 'success');
}

function discardDraft() {
  document.getElementById('draftRecoveryOverlay')?.remove();
  clearDraftSession();
}

function onUserActivity() { if (activeSession) resetInactivityTimer(); }

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (activeSession) { showToast('No activity — auto-saving session!', ''); endSession(true); }
  }, SESSION_INACTIVITY_MS);
}

function updateSessionTimer() {
  if (!activeSession) return;
  const elapsed = Math.floor((Date.now() - activeSession.startTime) / 1000);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  const el = document.getElementById('sessionTimerDisplay');
  if (el) el.textContent = `${m}:${s}`;
  const subEl = document.getElementById('sessionSubjectsDisplay');
  if (subEl) subEl.textContent = activeSession.subjects.size ? [...activeSession.subjects].join(', ') : 'No subjects yet';
}

function trackSubjectInSession(subject) {
  if (!activeSession || !subject) return;
  activeSession.subjects.add(subject);
  updateSessionTimer();
}

async function endSession(auto = false) {
  if (!activeSession) return;
  const elapsed = Math.floor((Date.now() - activeSession.startTime) / 1000);
  const durationMins = Math.max(1, Math.round(elapsed / 60));
  const subjects = [...activeSession.subjects];
  const date = new Date().toISOString().split('T')[0];
  const topic = subjects.length ? subjects.join(', ') : 'General Study';

  clearInterval(activeSession.timerInterval);
  clearTimeout(inactivityTimer);
  clearInterval(draftSaveInterval);
  clearDraftSession();
  ['mousemove','keydown','click','scroll','touchstart'].forEach(evt => {
    document.removeEventListener(evt, onUserActivity);
  });
  activeSession = null;

  const session = { subject: subjects[0] || 'General', topic, duration: durationMins, date, notes: auto ? 'Auto-saved (inactivity)' : '' };
  try {
    const saved = await sbFetch('sessions', 'POST', session);
    sessions.push(Array.isArray(saved) ? saved[0] : { ...session, id: Date.now(), created_at: new Date().toISOString() });
  } catch(e) {
    const local = { ...session, id: Date.now(), created_at: new Date().toISOString() };
    sessions.push(local);
    const ls = JSON.parse(localStorage.getItem('sessions') || '[]');
    ls.push(local); localStorage.setItem('sessions', JSON.stringify(ls));
  }

  renderDashboard();
  showToast(`Session saved! ${durationMins} min — ${topic} ✓`, 'success');
  // Wait 10 min before next popup
  setTimeout(() => startPopupReminder(), SESSION_POST_END_DELAY_MS);
}

// beforeunload — save draft when tab closes
window.addEventListener('beforeunload', () => { if (activeSession) saveDraftSession(); });

function startPopupReminder() {
  if (popupTimer) clearInterval(popupTimer);
  popupTimer = setInterval(() => { if (!activeSession) showSessionReminderPopup(); }, SESSION_POPUP_INTERVAL_MS);
  setTimeout(() => { if (!activeSession) showSessionReminderPopup(); }, 3000);
}

function showSessionReminderPopup() {
  if (document.getElementById('srPopup')) return;
  if (document.getElementById('draftRecoveryOverlay')) return; // Don't show if recovery modal is open
  const popup = document.createElement('div');
  popup.id = 'srPopup';
  popup.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--card);border:1px solid rgba(33,102,192,0.4);border-radius:16px;padding:16px 18px;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.5);animation:slideInPopup 0.3s ease';
  popup.innerHTML = `<style>@keyframes slideInPopup{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}</style>
    <div style="display:flex;align-items:flex-start;gap:10px">
      <div style="font-size:28px;flex-shrink:0">🛡️</div>
      <div>
        <div style="font-family:'Bangers',cursive;font-size:16px;letter-spacing:1px;color:var(--ca-gold);margin-bottom:4px">Hey Master Aarav!</div>
        <div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:10px">Don't forget to start your study session! Avengers always track their training. 💪</div>
        <div style="display:flex;gap:6px">
          <button onclick="startAutoSession()" style="background:var(--ca-red);color:white;border:none;border-radius:8px;padding:6px 14px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;text-transform:uppercase;letter-spacing:1px">⚡ Start</button>
          <button onclick="closeSRPopup()" style="background:var(--surface);color:var(--text-muted);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">Later</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function closeSRPopup() { document.getElementById('srPopup')?.remove(); }

// ==================== LOG SESSION ====================
function openLogModal() {
  document.getElementById('logDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('logModal').classList.add('open');
}

function closeLogModal() {
  document.getElementById('logModal').classList.remove('open');
}

async function saveSession() {
  const subject = document.getElementById('logSubject').value;
  const topic = document.getElementById('logTopic').value.trim();
  const duration = parseInt(document.getElementById('logDuration').value);
  const date = document.getElementById('logDate').value;
  const notes = document.getElementById('logNotes').value.trim();

  if (!topic || !duration || !date) { showToast('Fill in all required fields', 'error'); return; }

  const session = { subject, topic, duration, date, notes };
  try {
    const saved = await sbFetch('sessions', 'POST', session);
    sessions.push(Array.isArray(saved) ? saved[0] : { ...session, id: Date.now(), created_at: new Date().toISOString() });
    closeLogModal();
    renderDashboard();
    showToast('Session logged ✓', 'success');
    document.getElementById('logTopic').value = '';
    document.getElementById('logDuration').value = '';
    document.getElementById('logNotes').value = '';
  } catch(e) {
    // Fallback to local
    const localSession = { ...session, id: Date.now(), created_at: new Date().toISOString() };
    sessions.push(localSession);
    closeLogModal();
    renderDashboard();
    showToast('Session logged (offline mode) ✓', 'success');
  }
}

// ==================== BOOKS ====================
async function loadBooks() {
  try {
    const data = await sbFetch('books?order=created_at.desc&limit=1000');
    books = data || [];
  } catch(e) {
    books = JSON.parse(localStorage.getItem('books') || '[]');
  }
  renderBooks();
}

function renderBooks() {
  document.getElementById('statBooks').textContent = books.length;
  const grid = document.getElementById('booksGrid');
  if (!books.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="emoji">📚</div>
      <h3>No books yet</h3>
      <p>Upload your CBSE textbooks to get started.<br>AI will extract content for quizzes, flashcards, and doubt solving.</p>
    </div>`;
    return;
  }
  grid.innerHTML = books.map(b => `
    <div class="book-card" onclick="openBook('${b.id}')">
      <button class="book-delete" onclick="event.stopPropagation();deleteBook('${b.id}')">✕</button>
      <span class="book-emoji">${getSubjectEmoji(b.subject)}</span>
      <div class="book-title">${b.name}</div>
      <div class="book-meta">${b.subject || 'Unknown subject'} · ${b.pages || 0} pages</div>
      <div style="display:flex;gap:6px;margin-top:10px;align-items:center">
        <div class="book-status ready">Ready</div>
        <button onclick="event.stopPropagation();reuploadBook('${b.id}')" style="font-size:10px;font-weight:500;padding:3px 8px;border-radius:20px;background:rgba(99,102,241,0.12);color:var(--accent);border:1px solid rgba(99,102,241,0.2);cursor:pointer;font-family:inherit" title="Re-extract with page markers">↻ Re-extract</button>
      </div>
    </div>`).join('');
}

function getSubjectEmoji(sub) {
  const map = { 'Mathematics': '📐', 'Science': '🔬', 'Social Studies': '🌍', 'English': '📖', 'Hindi': '📕', 'Sanskrit': '🕉️' };
  return map[sub] || '📚';
}

async function handleFileUpload(files) {
  for (const file of files) {
    if (!file.name.endsWith('.pdf')) { showToast('Only PDFs supported', 'error'); continue; }
    await processPDF(file);
  }
}

async function processPDF(file) {
  const tempId = `temp-${Date.now()}`;

  // Add processing card
  const grid = document.getElementById('booksGrid');
  const tempCard = document.createElement('div');
  tempCard.className = 'book-card processing';
  tempCard.id = tempId;
  tempCard.innerHTML = `
    <div class="progress-overlay">
      <div class="progress-ring"></div>
      <div>Extracting text...</div>
    </div>
    <span class="book-emoji">📄</span>
    <div class="book-title">${file.name}</div>
    <div class="book-status processing">Processing</div>`;
  grid.prepend(tempCard);

  try {
    // Extract text with PDF.js — with page markers
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = pdf.numPages;
    let fullText = '';

    for (let i = 1; i <= Math.min(pages, 200); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items;
      let pageText = '';
      let lastY = null;
      for (const item of items) {
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && Math.abs(y - lastY) > 5) pageText += '\n';
        pageText += item.str;
        lastY = y;
      }
      fullText += `\n[PAGE ${i}]\n${pageText.trim()}\n`;
      const pct = Math.round((i / Math.min(pages, 200)) * 100);
      tempCard.querySelector('.progress-overlay div').textContent = `${pct}% extracted...`;
    }

    // Upload PDF file to Supabase Storage
    tempCard.querySelector('.progress-overlay div').textContent = 'Uploading PDF...';
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    let pdf_url = null;
    try {
      const formData = new FormData();
      formData.append('', file, fileName);
      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/books/${fileName}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: file
      });
      const uploadData = await uploadRes.json();
      console.log('Storage upload response:', uploadRes.status, uploadData);
      if (uploadRes.ok || uploadRes.status === 200) {
        pdf_url = `${SUPABASE_URL}/storage/v1/object/public/books/${fileName}`;
      } else {
        console.warn('Storage upload failed:', uploadData);
      }
    } catch(e) { console.warn('PDF upload error:', e); }

    // Detect subject
    const subject = detectSubject(file.name, fullText);

    // Save to Supabase
    const book = {
      name: file.name.replace('.pdf', ''),
      subject,
      pages,
      text_content: fullText.substring(0, 200000),
      pdf_url
    };

    let saved;
    try {
      const resp = await sbFetch('books', 'POST', book);
      saved = Array.isArray(resp) ? resp[0] : resp;
    } catch(e) {
      saved = { ...book, id: tempId, created_at: new Date().toISOString() };
      const local = JSON.parse(localStorage.getItem('books') || '[]');
      local.push(saved);
      localStorage.setItem('books', JSON.stringify(local));
    }

    books.unshift(saved);
    renderBooks();
    showToast(`${book.name} uploaded ✓`, 'success');

    // Auto-generate flashcards
    generateFlashcardsForBook(saved);

  } catch(e) {
    tempCard.remove();
    showToast('Failed to process PDF. Try a smaller file.', 'error');
    console.error(e);
  }
}

function detectSubject(filename, text) {
  const f = filename.toLowerCase() + text.toLowerCase().substring(0, 500);
  if (f.includes('sanskrit') || f.includes('संस्कृत')) return 'Sanskrit';
  if (f.includes('math') || f.includes('algebra') || f.includes('geometry') || f.includes('polynomial')) return 'Mathematics';
  if (f.includes('social science') || f.includes('social_science') || f.includes('history') || f.includes('geography') || f.includes('civics') || f.includes('economics') || f.includes('sst')) return 'Social Studies';
  if (f.includes('science') || f.includes('physics') || f.includes('chemistry') || f.includes('biology')) return 'Science';
  if (f.includes('english') || f.includes('grammar') || f.includes('literature')) return 'English';
  if (f.includes('hindi') || f.includes('हिंदी')) return 'Hindi';
  return 'General';
}

async function reuploadBook(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Delete old, re-process
    await deleteBook(id, true);
    await processPDF(file);
  };
  input.click();
}

async function deleteBook(id, silent = false) {
  if (!silent && !confirm('Delete this book and all its flashcards?')) return;
  try { await sbFetch(`books?id=eq.${id}`, 'DELETE'); } catch(e) {}
  books = books.filter(b => b.id !== id);
  renderBooks();
  if (!silent) showToast('Book deleted', 'success');
}

function openBook(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;
  selectedDoubtBook = book;
  navigate('doubt');
}

// ==================== AI FLASHCARD GENERATION ====================
async function generateFlashcardsForBook(book) {
  if (!book.text_content || book.text_content.length < 100) return;

  const langInstruction = book.subject === 'Hindi'
    ? 'Generate all flashcards in Hindi only. Questions and answers must be in Hindi (Devanagari script).'
    : book.subject === 'Sanskrit'
    ? 'Generate all flashcards in Sanskrit/Hindi only. Questions and answers must be in Devanagari script as they appear in the textbook.'
    : 'Generate flashcards in English.';

  const prompt = `You are a CBSE Class 9 ${book.subject} teacher. From the following textbook content, generate 15 high-quality flashcards for students.

${langInstruction}

Subject: ${book.subject}
Content: ${book.text_content.substring(0, 8000)}

Respond ONLY with valid JSON array, no markdown, no explanation:
[{"front": "question/term", "back": "answer/definition"}, ...]

Make questions clear, concise, and exam-relevant. Include definitions, important facts, and conceptual questions. Preserve the original language of the textbook exactly.`;

  try {
    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text || data?.choices?.[0]?.message?.content || '';
    const cards = JSON.parse(text.replace(/```json|```/g, '').trim());

    for (const card of cards) {
      try {
        await sbFetch('flashcards', 'POST', { book_id: book.id, front: card.front, back: card.back });
      } catch(e) {
        const local = JSON.parse(localStorage.getItem('flashcards') || '[]');
        local.push({ book_id: book.id, front: card.front, back: card.back, id: Date.now() + Math.random() });
        localStorage.setItem('flashcards', JSON.stringify(local));
      }
    }
    showToast(`${cards.length} flashcards generated for ${book.name}`, 'success');
  } catch(e) {
    console.error('Flashcard gen failed:', e);
  }
}

// ==================== QUIZ ====================
function renderQuizSetup() {
  const mascots = {
    'Mathematics': '⚡ Thor says: Calculate or be zapped!',
    'Science': '🕷️ Spidey senses tingling — science time!',
    'Social Studies': '🌍 Captain Planet needs you!',
    'English': '📖 Hermione approves this subject!',
    'Hindi': '🦁 Simba roars in Hindi!',
    'Sanskrit': '🕉️ Ancient wisdom unlocked!'
  };
  const container = document.getElementById('quizSubjectPicker');
  container.innerHTML = SUBJECTS.map(sub => {
    const bookCount = books.filter(b => b.subject === sub.name).length;
    const selected = quizData.selectedSubject === sub.name;
    const mascot = mascots[sub.name] || '';
    return `
      <button class="quiz-opt ${selected ? 'selected' : ''}" onclick="selectQuizSubject('${sub.name}')">
        <span class="opt-emoji">${sub.emoji}</span>
        <div class="opt-name">${sub.name}</div>
        <div class="opt-count" style="font-size:10px;font-style:italic;margin-top:4px;color:var(--text-muted)">${mascot}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${bookCount} book${bookCount !== 1 ? 's' : ''}</div>
      </button>`;
  }).join('');
}

function selectQuizSubject(name) {
  quizData.selectedSubject = name;
  document.querySelectorAll('.quiz-opt').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  document.getElementById('startQuizBtn').disabled = false;
}

async function startQuiz() {
  const subject = quizData.selectedSubject;
  const count = parseInt(document.getElementById('quizCount').value);
  const book = books.find(b => b.subject === subject);

  // Track subject in session
  if (subject) trackSubjectInSession(subject);

  document.getElementById('quizSetup').style.display = 'none';
  document.getElementById('quizActive').style.display = 'block';
  document.getElementById('quizQuestion').textContent = 'Generating questions with AI...';
  document.getElementById('quizChoices').innerHTML = '';

  const textContent = book ? book.text_content.substring(0, 8000) : '';

  const prompt = `You are a CBSE Class 9 ${subject} teacher. Generate ${count} multiple choice questions.
${textContent ? `Use this book content: ${textContent}` : `Use standard CBSE Class 9 ${subject} curriculum.`}

Respond ONLY with valid JSON, no markdown:
{"questions": [{"q": "question text", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "why this is correct"}]}

- answer is 0-indexed position of correct option
- Make questions varied in difficulty
- Cover different topics/chapters`;

  try {
    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    quizData.questions = parsed.questions;
    quizData.current = 0;
    quizData.score = 0;
    renderQuestion();
  } catch(e) {
    document.getElementById('quizQuestion').textContent = 'Failed to generate questions. Check your connection and try again.';
    console.error(e);
  }
}

function renderQuestion() {
  const q = quizData.questions[quizData.current];
  const total = quizData.questions.length;
  const idx = quizData.current;

  document.getElementById('quizCounter').textContent = `Question ${idx + 1} of ${total}`;
  document.getElementById('quizProgressFill').style.width = `${(idx / total) * 100}%`;
  document.getElementById('quizQuestion').textContent = q.q;

  const letters = ['A', 'B', 'C', 'D'];
  document.getElementById('quizChoices').innerHTML = q.options.map((opt, i) => `
    <button class="quiz-choice" onclick="answerQuiz(${i})">
      <span class="choice-letter">${letters[i]}</span>
      ${opt}
    </button>`).join('');

  document.getElementById('quizFeedback').className = 'quiz-feedback';
  document.getElementById('quizFeedback').textContent = '';
  document.getElementById('quizNextWrap').style.display = 'none';
}

function answerQuiz(idx) {
  const q = quizData.questions[quizData.current];
  const choices = document.querySelectorAll('.quiz-choice');
  choices.forEach(c => c.disabled = true);

  const feedback = document.getElementById('quizFeedback');
  if (idx === q.answer) {
    choices[idx].classList.add('correct');
    feedback.textContent = `✓ Correct! ${q.explanation}`;
    feedback.className = 'quiz-feedback show correct';
    quizData.score++;
  } else {
    choices[idx].classList.add('wrong');
    choices[q.answer].classList.add('correct');
    feedback.textContent = `✗ The correct answer is "${q.options[q.answer]}". ${q.explanation}`;
    feedback.className = 'quiz-feedback show wrong';
  }
  document.getElementById('quizNextWrap').style.display = 'block';
}

function nextQuestion() {
  quizData.current++;
  if (quizData.current >= quizData.questions.length) {
    showQuizResult();
  } else {
    renderQuestion();
  }
}

function showQuizResult() {
  document.getElementById('quizActive').style.display = 'none';
  document.getElementById('quizResult').style.display = 'block';

  const score = quizData.score;
  const total = quizData.questions.length;
  const pct = Math.round((score / total) * 100);

  document.getElementById('quizFinalScore').textContent = `${score}/${total}`;
  document.getElementById('quizFinalAcc').textContent = `${pct}%`;

  if (pct >= 80) {
    document.getElementById('quizResultEmoji').textContent = '🎉';
    document.getElementById('quizResultTitle').textContent = 'Excellent!';
    document.getElementById('quizResultSub').textContent = 'Outstanding performance. Keep it up!';
  } else if (pct >= 60) {
    document.getElementById('quizResultEmoji').textContent = '👍';
    document.getElementById('quizResultTitle').textContent = 'Good job!';
    document.getElementById('quizResultSub').textContent = 'Solid effort. Review the ones you missed.';
  } else {
    document.getElementById('quizResultEmoji').textContent = '📚';
    document.getElementById('quizResultTitle').textContent = 'Keep practicing';
    document.getElementById('quizResultSub').textContent = 'Revisit the chapter and try again.';
  }

  // Save result
  const result = { subject: quizData.selectedSubject, score, total, created_at: new Date().toISOString() };
  const local = JSON.parse(localStorage.getItem('quiz_results') || '[]');
  local.push(result);
  localStorage.setItem('quiz_results', JSON.stringify(local));
  try { sbFetch('quiz_results', 'POST', result); } catch(e) {}
}

function endQuiz() {
  resetQuiz();
}

function resetQuiz() {
  document.getElementById('quizSetup').style.display = 'block';
  document.getElementById('quizActive').style.display = 'none';
  document.getElementById('quizResult').style.display = 'none';
  quizData = { questions: [], current: 0, score: 0, selectedSubject: quizData.selectedSubject };
  renderQuizSetup();
}

// ==================== FLASHCARDS ====================
async function renderFCSetup() {
  const container = document.getElementById('fcBookPicker');
  if (!books.length) {
    container.innerHTML = `<div class="empty-state" style="padding:16px 0">
      <p>No books uploaded yet. <a onclick="navigate('books')" style="color:var(--accent);cursor:pointer">Upload a book</a> to generate flashcards.</p>
    </div>`;
    return;
  }

  function isSkippable(name) {
    const n = name.toLowerCase().replace(/_/g, ' ');
    return /\bintro\b|\bappendix\b|\bpreface\b|\bforeword\b/.test(n) ||
           /\b0\.\b|\bchapter 0\b/.test(n);
  }

  const validBooks = books.filter(b => !isSkippable(b.name));
  const SUBJECT_ORDER = ['Mathematics', 'Science', 'Social Studies', 'English', 'Hindi', 'Sanskrit'];
  const grouped = {};
  validBooks.forEach(b => {
    const s = b.subject || 'Other';
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push(b);
  });
  Object.keys(grouped).forEach(s => {
    grouped[s].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  });

  const orderedSubjects = [
    ...SUBJECT_ORDER.filter(s => grouped[s]),
    ...Object.keys(grouped).filter(s => !SUBJECT_ORDER.includes(s))
  ];

  const activeSubject = fcData.selectedBook?.subject || null;

  container.innerHTML = orderedSubjects.map(subject => {
    const emoji = getSubjectEmoji(subject);
    const subBooks = grouped[subject];
    const isOpen = subject === activeSubject;

    const chapters = subBooks.map(b => {
      const cleanName = b.name.replace(/_/g, ' ')
        .replace(/^(Mathematics|Mathematcis|Science|Social\s*Studies?|Social\s*Science|English|Hindi|Sanskrit)\s*\.?\s*/i, '')
        .trim();
      const isSelected = fcData.selectedBook?.id === b.id;
      return `<div class="fc-chapter-row ${isSelected ? 'fc-chapter-selected' : ''}"
        onclick="selectFCBook('${b.id}', this)"
        ondblclick="selectFCBook('${b.id}', this); startFlashcards()">
        <span style="font-size:12px">📄</span>
        <span style="flex:1;font-size:13px;font-weight:600">${cleanName}</span>
        <span style="font-size:10px;color:var(--text-muted)">Double-click to start</span>
      </div>`;
    }).join('');

    return `<div class="fc-accordion-item">
      <div class="fc-accordion-header ${isOpen ? 'open' : ''}" onclick="toggleFCAccordion(this)">
        <span style="font-size:20px">${emoji}</span>
        <span style="flex:1;font-size:14px;font-weight:700">${subject}</span>
        <span style="font-size:11px;color:var(--text-muted)">${subBooks.length} chapters</span>
        <span class="fc-accordion-arrow">›</span>
      </div>
      <div class="fc-accordion-body" ${isOpen ? '' : 'style="display:none"'}>${chapters}</div>
    </div>`;
  }).join('');
}

function toggleFCAccordion(header) {
  const body = header.nextElementSibling;
  const arrow = header.querySelector('.fc-accordion-arrow');
  const isOpen = body.style.display !== 'none';
  // Close all
  document.querySelectorAll('.fc-accordion-header').forEach(h => {
    h.classList.remove('open');
    h.querySelector('.fc-accordion-arrow').style.transform = '';
    h.nextElementSibling.style.display = 'none';
  });
  if (!isOpen) {
    header.classList.add('open');
    body.style.display = 'block';
    arrow.style.transform = 'rotate(90deg)';
  }
}

function toggleFCSubjectTab(btn, subject) {} // kept for safety

function selectFCBook(id, el) {
  fcData.selectedBook = books.find(b => b.id === id);
  document.querySelectorAll('.fc-chapter-row').forEach(e => e.classList.remove('fc-chapter-selected'));
  if (el) el.classList.add('fc-chapter-selected');
  document.getElementById('startFCBtn').disabled = false;
}

async function startFlashcards() {
  document.getElementById('fcSetup').style.display = 'none';
  document.getElementById('fcActive').style.display = 'block';

  // Load flashcards for this book
  let cards = [];
  try {
    cards = await sbFetch(`flashcards?book_id=eq.${fcData.selectedBook.id}&order=created_at.asc`);
  } catch(e) {
    const local = JSON.parse(localStorage.getItem('flashcards') || '[]');
    cards = local.filter(c => c.book_id === fcData.selectedBook.id);
  }

  if (!cards || !cards.length) {
    // Generate on the fly
    document.getElementById('fcFront').textContent = 'Generating flashcards...';
    await generateFlashcardsForBook(fcData.selectedBook);
    try {
      cards = await sbFetch(`flashcards?book_id=eq.${fcData.selectedBook.id}`);
    } catch(e) {
      const local = JSON.parse(localStorage.getItem('flashcards') || '[]');
      cards = local.filter(c => c.book_id === fcData.selectedBook.id);
    }
  }

  fcData.cards = cards || [];
  fcData.current = 0;
  fcData.correct = 0;
  fcData.flipped = false;
  renderCard();
}

function renderCard() {
  const card = fcData.cards[fcData.current];
  if (!card) return;
  document.getElementById('fcCounter').textContent = `Card ${fcData.current + 1} of ${fcData.cards.length}`;
  document.getElementById('fcFront').textContent = card.front;
  document.getElementById('fcBack').textContent = card.back;
  document.getElementById('flashcard').classList.remove('flipped');
  document.getElementById('fcControls').style.display = 'none';
  fcData.flipped = false;
}

function flipCard() {
  if (fcData.flipped) return;
  document.getElementById('flashcard').classList.add('flipped');
  document.getElementById('fcControls').style.display = 'flex';
  fcData.flipped = true;
}

function fcAnswer(correct) {
  if (correct) fcData.correct++;
  fcData.current++;
  if (fcData.current >= fcData.cards.length) {
    const pct = Math.round((fcData.correct / fcData.cards.length) * 100);
    showToast(`Session done! ${fcData.correct}/${fcData.cards.length} correct (${pct}%)`, 'success');
    endFlashcards();
  } else {
    renderCard();
  }
}

function endFlashcards() {
  document.getElementById('fcSetup').style.display = 'block';
  document.getElementById('fcActive').style.display = 'none';
}

// ==================== DOUBT SOLVER ====================
function renderDoubtBooks() {
  const list = document.getElementById('doubtBookList');
  if (!books.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px">No books uploaded yet</div>`;
    return;
  }

  const SUBJECT_ORDER = ['Mathematics', 'Science', 'Social Studies', 'English', 'Hindi', 'Sanskrit'];

  // Sort books within each subject by name (natural sort for chapter numbers)
  function naturalSort(a, b) {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  }

  // Group by subject
  const grouped = {};
  books.forEach(b => {
    const subj = b.subject || 'Other';
    if (!grouped[subj]) grouped[subj] = [];
    grouped[subj].push(b);
  });
  Object.keys(grouped).forEach(subj => grouped[subj].sort(naturalSort));

  // Ordered subjects
  const orderedSubjects = [
    ...SUBJECT_ORDER.filter(s => grouped[s]),
    ...Object.keys(grouped).filter(s => !SUBJECT_ORDER.includes(s))
  ];

  // Find which subject is currently selected book's subject
  const activeSubject = selectedDoubtBook?.subject || null;

  let html = `<div class="book-select-item ${!selectedDoubtBook ? 'selected' : ''}" onclick="selectDoubtBook(null)">
    <div class="book-select-name">🌐 General (Any topic)</div>
    <div class="book-select-sub">Ask anything</div>
  </div>`;

  orderedSubjects.forEach(subject => {
    const subBooks = grouped[subject];
    const isOpen = subject === activeSubject;
    const emoji = getSubjectEmoji(subject);
    html += `<div class="subject-accordion">
      <div class="subject-accordion-header ${isOpen ? 'open' : ''}" onclick="toggleSubjectAccordion(this)">
        <span>${emoji} ${subject}</span>
        <span class="subject-accordion-arrow">›</span>
      </div>
      <div class="subject-accordion-books">
      ${subBooks.map(b => {
        // Strip subject prefix from name for cleaner display
        const cleanName = b.name.replace(/_/g, ' ')
          .replace(/^(Mathematics|Mathematcis|Science|Social\s*Studies?|Social\s*Science|English|Hindi|Sanskrit)\s*\.?\s*/i, '')
          .trim();
        return `
        <div class="book-select-item ${selectedDoubtBook?.id === b.id ? 'selected' : ''}" onclick="selectDoubtBook('${b.id}')">
          <div class="book-select-name">${cleanName}</div>
        </div>`;
      }).join('')}
      </div>
    </div>`;
  });

  list.innerHTML = html;
}

function toggleSubjectAccordion(header) {
  // Close all others
  document.querySelectorAll('.subject-accordion-header.open').forEach(h => {
    if (h !== header) h.classList.remove('open');
  });
  header.classList.toggle('open');
}

function toggleBooksSidebar() {
  const layout = document.getElementById('doubtLayout');
  const sidebar = document.getElementById('doubtSidebar');
  const toggle = document.getElementById('sidebarToggle');
  const collapsed = sidebar.classList.toggle('collapsed');
  layout.classList.toggle('books-collapsed', collapsed);
  toggle.textContent = collapsed ? '›' : '‹';
  toggle.title = collapsed ? 'Expand' : 'Collapse';
}

function selectDoubtBook(id) {
  selectedDoubtBook = id ? books.find(b => b.id === id) : null;
  renderDoubtBooks();
  const title = selectedDoubtBook ? selectedDoubtBook.name : 'Ask AI Tutor';
  const sub = selectedDoubtBook ? `Answering from this book · Class 9 ${selectedDoubtBook.subject}` : 'Select a book or ask anything';
  document.getElementById('chatBookTitle').textContent = title;
  document.getElementById('chatBookSub').textContent = sub;

  // Track subject in active session
  if (selectedDoubtBook?.subject) trackSubjectInSession(selectedDoubtBook.subject);

  renderChapterPreview();
}


// ==================== PDF VIEWER ====================
let pdfViewerDoc = null;
let pdfCurrentPage = 1;
let pdfTotalPages = 0;
let pdfRendering = false;
let currentView = 'pdf'; // 'pdf' or 'text'

function renderChapterPreview() {
  const body = document.getElementById('previewBody');
  const titleEl = document.getElementById('previewTitle');
  const searchBar = document.getElementById('readerSearchBar');
  const pdfControls = document.getElementById('pdfControls');
  const viewToggle = document.getElementById('viewToggle');

  pdfViewerDoc = null;
  pdfCurrentPage = 1;
  currentView = 'pdf';

  if (!selectedDoubtBook) {
    titleEl.textContent = 'Chapter Text';
    if (searchBar) searchBar.style.display = 'none';
    if (pdfControls) pdfControls.style.display = 'none';
    if (viewToggle) viewToggle.style.display = 'none';
    body.innerHTML = `<div class="chapter-empty">
      <div style="font-size:28px;margin-bottom:12px">📖</div>
      <p>Select a book from the left to preview its content here.</p>
    </div>`;
    return;
  }

  titleEl.textContent = selectedDoubtBook.name.replace(/_/g, ' ');

  if (selectedDoubtBook.pdf_url) {
    if (searchBar) searchBar.style.display = 'flex';
    if (pdfControls) pdfControls.style.display = 'flex';
    if (viewToggle) viewToggle.style.display = 'flex';
    body.innerHTML = `<div class="chapter-empty"><div class="progress-ring" style="width:32px;height:32px;margin-bottom:12px"></div><p style="color:var(--text-muted);font-size:13px">Loading PDF…</p></div>`;
    pdfjsLib.getDocument(selectedDoubtBook.pdf_url).promise.then(pdf => {
      pdfViewerDoc = pdf;
      pdfTotalPages = pdf.numPages;
      pdfCurrentPage = 1;
      renderPdfPage(1);
    }).catch(() => {
      body.innerHTML = `<div class="chapter-empty"><p style="color:var(--red)">Failed to load PDF. Try re-uploading.</p></div>`;
    });
    return;
  }

  // No PDF URL — show text only
  if (pdfControls) pdfControls.style.display = 'none';
  if (viewToggle) viewToggle.style.display = 'none';
  if (searchBar) searchBar.style.display = selectedDoubtBook.text_content ? 'flex' : 'none';
  renderTextView();
}

function switchView(view) {
  currentView = view;
  const pdfControls = document.getElementById('pdfControls');
  const btnPdf = document.getElementById('btnPdfView');
  const btnText = document.getElementById('btnTextView');

  btnPdf.style.background = view === 'pdf' ? 'var(--accent)' : 'transparent';
  btnPdf.style.color = view === 'pdf' ? 'white' : 'var(--text-muted)';
  btnText.style.background = view === 'text' ? 'var(--accent)' : 'transparent';
  btnText.style.color = view === 'text' ? 'white' : 'var(--text-muted)';

  if (view === 'pdf') {
    if (pdfControls) pdfControls.style.display = 'flex';
    if (pdfViewerDoc) renderPdfPage(pdfCurrentPage);
  } else {
    if (pdfControls) pdfControls.style.display = 'flex'; // keep page nav visible
    renderTextView(pdfCurrentPage);
  }
}

function renderTextView(pageNum) {
  const body = document.getElementById('previewBody');
  const pageInfo = document.getElementById('pdfPageInfo');

  if (!selectedDoubtBook?.text_content) {
    body.innerHTML = `<div class="chapter-empty"><p>No text available for this book.</p></div>`;
    return;
  }

  if (pageInfo) pageInfo.textContent = `Page ${pageNum || 1} / ${pdfTotalPages || '?'}`;

  body.style.background = '';
  body.style.padding = '0';

  const rawText = selectedDoubtBook.text_content;
  const pageNums = [];
  let m; const pp = /\[PAGE (\d+)\]/g;
  while ((m = pp.exec(rawText)) !== null) pageNums.push(parseInt(m[1]));
  const pageParts = rawText.split(/\[PAGE \d+\]/);
  const pageBlocks = rawText.includes('[PAGE') ?
    pageParts.slice(1).map((part, i) => ({ num: pageNums[i], text: part })) :
    [{ num: 1, text: rawText }];

  function cleanLine(l) {
    return l.replace(/[\uFFFD\u25A1\u25A0□▯]/g, '').trim();
  }

  function processLines(text) {
    const lines = text.split('\n').map(cleanLine).filter(l => l.length > 2 && !/^\d{1,2}$/.test(l));
    const joined = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = lines[i + 1];
      if (next && !/[.!?:]\s*$/.test(line) && /^[a-z,]/.test(next)) {
        joined.push(line + ' ' + next);
        i++;
      } else {
        joined.push(line);
      }
    }
    return joined;
  }

  let html = '';
  pageBlocks.forEach(page => {
    const joined = processLines(page.text);
    if (!joined.length) {
      html += `<div id="text-page-${page.num}" style="padding:12px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent);background:var(--accent-soft);padding:2px 10px;border-radius:20px;display:inline-block;margin-bottom:8px">Page ${page.num || ''}</div>
        <div style="font-size:12px;color:var(--text-muted);font-style:italic">🖼️ This page contains diagrams — switch to PDF view.</div>
      </div>`;
      return;
    }
    html += `<div id="text-page-${page.num}" style="padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent);background:var(--accent-soft);padding:2px 10px;border-radius:20px;display:inline-block;margin-bottom:8px">Page ${page.num || ''}</div>
      <div style="font-size:13px;line-height:1.9;color:var(--text-dim);user-select:text;cursor:text">${joined.map(l => `<p style="margin:0 0 4px">${escapeHtml(l)}</p>`).join('')}</div>
    </div>`;
  });

  body.innerHTML = html;

  // Scroll to requested page
  if (pageNum) {
    setTimeout(() => {
      const target = document.getElementById(`text-page-${pageNum}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  // Update page counter on scroll
  body.onscroll = () => {
    const pages = [...body.querySelectorAll('[id^="text-page-"]')];
    let current = 1;
    pages.forEach(p => {
      if (p.offsetTop <= body.scrollTop + body.clientHeight / 2) {
        const num = parseInt(p.id.replace('text-page-', ''));
        if (num) current = num;
      }
    });
    if (pageInfo) pageInfo.textContent = `Page ${current} / ${pdfTotalPages || '?'}`;
    pdfCurrentPage = current;
  };
}

async function renderPdfPage(pageNum) {
  if (!pdfViewerDoc) return;

  const body = document.getElementById('previewBody');
  const pageInfo = document.getElementById('pdfPageInfo');

  // If already rendered all pages, just scroll to the target page
  const existing = document.getElementById(`pdf-canvas-page-${pageNum}`);
  if (existing && body.querySelectorAll('.pdf-page-canvas').length === pdfTotalPages) {
    existing.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (pageInfo) pageInfo.textContent = `Page ${pageNum} / ${pdfTotalPages}`;
    pdfCurrentPage = pageNum;
    return;
  }

  // Render all pages scrollably
  if (pageInfo) pageInfo.textContent = `Loading… / ${pdfTotalPages}`;
  body.innerHTML = '';
  body.style.padding = '8px';
  body.style.background = '#525659';

  const containerWidth = body.clientWidth - 16 || 400;

  for (let i = 1; i <= pdfTotalPages; i++) {
    try {
      const page = await pdfViewerDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const wrapper = document.createElement('div');
      wrapper.id = `pdf-canvas-page-${i}`;
      wrapper.className = 'pdf-page-canvas';
      wrapper.style.cssText = 'margin-bottom:8px;position:relative;';

      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = scaledViewport.width * dpr;
      canvas.height = scaledViewport.height * dpr;
      canvas.style.cssText = `width:${scaledViewport.width}px;height:${scaledViewport.height}px;display:block;border-radius:4px;`;

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      wrapper.appendChild(canvas);
      body.appendChild(wrapper);

      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

      if (pageInfo) pageInfo.textContent = `Page ${i} / ${pdfTotalPages}`;
    } catch(e) { console.warn('Page render error:', i, e); }
  }

  if (pageInfo) pageInfo.textContent = `Page ${pageNum} / ${pdfTotalPages}`;
  pdfCurrentPage = pageNum;

  // Scroll to requested page
  setTimeout(() => {
    const target = document.getElementById(`pdf-canvas-page-${pageNum}`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);

  // Update page counter on scroll
  body.onscroll = () => {
    const canvases = [...body.querySelectorAll('.pdf-page-canvas')];
    const bodyScrollTop = body.scrollTop;
    const bodyHeight = body.clientHeight;
    let currentVisible = 1;
    canvases.forEach(c => {
      if (c.offsetTop <= bodyScrollTop + bodyHeight / 2) {
        const num = parseInt(c.id.replace('pdf-canvas-page-', ''));
        if (num) currentVisible = num;
      }
    });
    if (currentVisible !== pdfCurrentPage) {
      pdfCurrentPage = currentVisible;
      if (pageInfo) pageInfo.textContent = `Page ${pdfCurrentPage} / ${pdfTotalPages}`;
    }
  };
}

function pdfNextPage() {
  if (!pdfViewerDoc || pdfCurrentPage >= pdfTotalPages) return;
  pdfCurrentPage++;
  const target = document.getElementById(`pdf-canvas-page-${pdfCurrentPage}`);
  const body = document.getElementById('previewBody');
  if (target && body) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (currentView === 'pdf') renderPdfPage(pdfCurrentPage);
  else renderTextView(pdfCurrentPage);
  const pageInfo = document.getElementById('pdfPageInfo');
  if (pageInfo) pageInfo.textContent = `Page ${pdfCurrentPage} / ${pdfTotalPages}`;
}

function pdfPrevPage() {
  if (!pdfViewerDoc || pdfCurrentPage <= 1) return;
  pdfCurrentPage--;
  const target = document.getElementById(`pdf-canvas-page-${pdfCurrentPage}`);
  const body = document.getElementById('previewBody');
  if (target && body) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (currentView === 'pdf') renderPdfPage(pdfCurrentPage);
  else renderTextView(pdfCurrentPage);
  const pageInfo = document.getElementById('pdfPageInfo');
  if (pageInfo) pageInfo.textContent = `Page ${pdfCurrentPage} / ${pdfTotalPages}`;
}

function readerSearch() {
  const query = document.getElementById('readerSearchInput').value.trim().toLowerCase();
  const resultEl = document.getElementById('readerSearchResult');
  if (!query || !selectedDoubtBook?.text_content) { resultEl.textContent = ''; return; }
  const rawText = selectedDoubtBook.text_content;
  const pageNums = [];
  let m; const pp = /\[PAGE (\d+)\]/g;
  while ((m = pp.exec(rawText)) !== null) pageNums.push(parseInt(m[1]));
  const parts = rawText.split(/\[PAGE \d+\]/);
  const pageBlocks = rawText.includes('[PAGE') ?
    parts.slice(1).map((part, i) => ({ num: pageNums[i], text: part })) :
    [{ num: null, text: rawText }];
  const hit = pageBlocks.find(p => p.text.toLowerCase().includes(query));
  if (hit) {
    pdfCurrentPage = hit.num || 1;
    resultEl.textContent = `Jumped to page ${pdfCurrentPage}`;
    if (currentView === 'pdf' && pdfViewerDoc) renderPdfPage(pdfCurrentPage);
    else renderTextView(pdfCurrentPage);
  } else {
    resultEl.textContent = 'Not found';
  }
}



function getRelevantChunks(text, query, maxChars) {
  maxChars = maxChars || 6000;
  if (!text) return 'Not available';
  const pagePattern = /\[PAGE \d+\]/g;
  const pageLabels = text.match(pagePattern) || [];
  const pages = text.split(pagePattern);
  if (pages.length <= 1) return text.substring(0, maxChars);

  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const scored = pages.map((pageText, i) => {
    const lower = pageText.toLowerCase();
    const score = keywords.reduce((s, kw) => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return s + (lower.match(new RegExp(escaped, 'g')) || []).length;
    }, 0);
    return { pageText, label: pageLabels[i-1] || '', score, index: i };
  });

  // Get top scoring pages
  const topPages = scored
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // Add neighbouring pages for context
  const indices = new Set(topPages.map(p => p.index));
  topPages.forEach(p => {
    if (p.index > 1) indices.add(p.index - 1);
    if (p.index < pages.length - 1) indices.add(p.index + 1);
  });

  // If no matches found, return first 6 pages
  if (!topPages.length) {
    return pages.slice(1, 7).map((p, i) => (pageLabels[i] || '') + '\n' + p).join('\n').substring(0, maxChars);
  }

  const result = Array.from(indices)
    .sort((a, b) => a - b)
    .map(i => (scored[i].label || '') + '\n' + scored[i].pageText)
    .join('\n');

  return result.substring(0, maxChars);
}

async function sendDoubt() {
  const input = document.getElementById('chatInput');
  const question = input.value.trim();
  if (!question || isAILoading) return;

  input.value = '';
  input.style.height = 'auto';
  addMessage('user', question, false, null);
  chatHistory.push({ role: 'user', content: question });

  isAILoading = true;
  document.getElementById('chatSendBtn').disabled = true;
  const typingEl = addMessage('ai', '', true);

  const systemPrompt = `You are Buddy — a warm, witty, and deeply knowledgeable CBSE Class 9 tutor for a 14-year-old student in India.

YOUR PERSONALITY:
- Friendly and encouraging, like a cool older sibling who is also a genius
- Never condescending, never boring
- Use relatable Indian references, everyday examples, and analogies (cricket, food, Bollywood, daily life)
- Celebrate when the student gets something right
- When they are confused, try a completely different explanation angle

HOW YOU EXPLAIN:
- Always start with the BIG PICTURE — what is this concept and why does it matter in real life?
- Break every concept into small, numbered steps
- Use emoji occasionally to make it visually scannable 📌
- Use analogies before formulas
- After explaining, always ask: "Does this make sense? Want me to try a different example?" or "Want to test yourself on this?"
- If a student says they don't understand, NEVER repeat the same explanation — rephrase it completely with a fresh analogy
- For Maths: show full working step by step, explain WHY each step happens, not just what
- For Science: connect concepts to what they can see/touch/feel in daily life
- For History/SST: tell it like a story with characters and consequences
- For English: be conversational and practical
- For Hindi/Sanskrit: explain grammar rules with fun mnemonics

CONVERSATION STYLE:
- Keep responses conversational, not essay-like
- Use short paragraphs, never walls of text
- Bold key terms using **term**
- For math: use $ for inline equations like $x^2 + 2x + 1$ and $$ for block equations. Always explain what each symbol means in plain English alongside the formula
- NEVER show raw LaTeX without explanation. Always say "this means..." after any formula
- After every explanation, end with ONE follow-up question or prompt to keep the conversation going
- If asked a vague question, ask a clarifying question before answering

${selectedDoubtBook ? `BOOK CONTEXT: You are answering based on "${selectedDoubtBook.name}" (${selectedDoubtBook.subject}).
Answer from the complete chapter text below. The student is currently viewing Page ${pdfCurrentPage}.
Answer ONLY from what is present in the text — do not add outside information.

Full chapter text:
${(() => {
  const raw = selectedDoubtBook.text_content || '';
  // Strip page markers and compress whitespace to save tokens
  return raw
    .replace(/\[PAGE \d+\]/g, '\n---\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, 28000);
})()}` : 'Use standard CBSE Class 9 curriculum.'}`;

  try {
    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          ...chatHistory.slice(-10, -1),
          { role: 'user', content: question }
        ]
      })
    });
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content
      || data?.content?.[0]?.text
      || 'Sorry, I could not generate a response. Please try again.';
    chatHistory.push({ role: 'assistant', content: reply });
    typingEl.remove();
    addMessage('ai', reply, false, null);
  } catch(e) {
    typingEl.remove();
    addMessage('ai', 'Connection error: ' + e.message, false, null);
  }

  isAILoading = false;
  document.getElementById('chatSendBtn').disabled = false;
}

function addMessage(role, text, typing = false, imageSrc = null) {
  const container = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = `msg ${role} ${typing ? 'msg-typing' : ''}`;
  const imgHtml = imageSrc ? `<img src="${imageSrc}" style="max-width:200px;max-height:160px;border-radius:8px;margin-bottom:6px;display:block" />` : '';
  const formattedText = typing ? '' : formatMessage(text);
  const saveBtn = (role === 'ai' && !typing) ? `<button class="msg-save-btn" onclick="saveAnswer(this)" data-text="${encodeURIComponent(text)}" title="Save this answer">🔖</button>` : '';
  el.innerHTML = `
    <div class="msg-avatar">${role === 'ai' ? '🤖' : '👤'}</div>
    <div class="msg-bubble-wrap">
      <div class="msg-bubble">${imgHtml}${formattedText}</div>
      ${saveBtn}
    </div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

// ==================== COPIES ====================
const SENIOR_PIN = '1984';
let copyRecords = {};
let seniorUnlocked = false;
let pendingSeniorBookId = null;

function toggleCopiesAccordion(header) {
  const books = header.nextElementSibling;
  const arrow = header.querySelector('.subject-accordion-arrow');
  const isOpen = books.style.display !== 'none';
  books.style.display = isOpen ? 'none' : 'block';
  arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

async function renderCopies() {
  const container = document.getElementById('copiesContainer');
  container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Loading…</div>`;

  // Load copy records
  try {
    const records = await sbFetch('copy_records');
    copyRecords = {};
    (records || []).forEach(r => { copyRecords[r.book_id] = r; });
  } catch(e) {}

  if (!books.length) {
    container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:13px">No books uploaded yet.</div>`;
    return;
  }

  const SUBJECT_ORDER = ['Mathematics', 'Science', 'Social Studies', 'English', 'Hindi', 'Sanskrit'];
  const grouped = {};
  books.forEach(b => {
    const s = b.subject || 'Other';
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push(b);
  });
  Object.keys(grouped).forEach(s => {
    grouped[s].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  });
  const orderedSubjects = [
    ...SUBJECT_ORDER.filter(s => grouped[s]),
    ...Object.keys(grouped).filter(s => !SUBJECT_ORDER.includes(s))
  ];

  let html = '';
  orderedSubjects.forEach(subject => {
    const subBooks = grouped[subject];
    const doneCount = subBooks.filter(b => (copyRecords[b.id] || {}).completed).length;
    html += `<div class="copies-subject-group">
      <div class="copies-subject-title" onclick="toggleCopiesAccordion(this)" style="cursor:pointer;user-select:none">
        <span>${getSubjectEmoji(subject)} ${subject}</span>
        <span style="margin-left:auto;font-size:11px;font-weight:500;color:var(--text-muted)">${doneCount}/${subBooks.length} done</span>
        <span class="subject-accordion-arrow" style="margin-left:8px;font-size:11px">›</span>
      </div>
      <div class="copies-subject-books" style="display:none">`;

    subBooks.forEach(book => {
      const rec = copyRecords[book.id] || {};
      const cleanName = book.name.replace(/_/g, ' ')
        .replace(/^(Mathematics|Mathematcis|Science|Social\s*Studies?|Social\s*Science|English|Hindi|Sanskrit)\s*\.?\s*/i, '')
        .trim();
      const isCompleted = rec.completed || false;
      const hasPdf = rec.pdf_url && rec.pdf_url.length > 0;

      html += `<div class="copy-item ${isCompleted ? 'completed' : ''}" id="copy-${book.id}">
        <div class="copy-item-header">
          <div class="copy-checkbox ${isCompleted ? 'checked' : ''}" onclick="toggleCopyComplete('${book.id}')">${isCompleted ? '✓' : ''}</div>
          <div class="copy-title">${cleanName}</div>
          <span class="copy-status-badge ${isCompleted ? 'done' : 'pending'}">${isCompleted ? 'Done' : 'Pending'}</span>
          ${hasPdf ? `<span class="copy-status-badge uploaded">📎 PDF</span>` : ''}
        </div>
        <div class="copy-actions">
          <label class="copy-upload-btn ${hasPdf ? 'has-file' : ''}" title="Upload copy PDF">
            ${hasPdf ? '📎 Replace PDF' : '📎 Upload Copy'}
            <input type="file" accept="application/pdf" style="display:none" onchange="uploadCopyPdf('${book.id}', this)">
          </label>
          ${hasPdf ? `<a class="copy-pdf-link" href="${rec.pdf_url}" target="_blank" download>⬇ View / Download</a>` : ''}
        </div>
        <div class="copy-remarks">
          <div>
            <div class="copy-remark-label">Aarav's Remark</div>
            <textarea class="copy-remark-input" rows="2" placeholder="Why wasn't it completed on time?" onblur="saveStudentRemark('${book.id}', this.value)">${escapeHtml(rec.student_remark || '')}</textarea>
          </div>
          <div>
            <div class="copy-senior-lock" onclick="unlockSenior('${book.id}')">
              🔒 Senior Remark ${seniorUnlocked ? '(unlocked)' : '— tap to unlock'}
            </div>
            <textarea class="copy-remark-input" rows="2" placeholder="Senior's observation…" id="senior-remark-${book.id}"
              ${seniorUnlocked ? '' : 'disabled'}
              onblur="saveSeniorRemark('${book.id}', this.value)">${escapeHtml(rec.senior_remark || '')}</textarea>
          </div>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });

  container.innerHTML = html;
}

async function toggleCopyComplete(bookId) {
  const rec = copyRecords[bookId] || {};
  const newVal = !rec.completed;
  const now = new Date().toISOString();

  // Optimistic UI
  copyRecords[bookId] = { ...rec, completed: newVal, completed_at: newVal ? now : null };
  const item = document.getElementById(`copy-${bookId}`);
  if (item) {
    item.classList.toggle('completed', newVal);
    const cb = item.querySelector('.copy-checkbox');
    cb.classList.toggle('checked', newVal);
    cb.textContent = newVal ? '✓' : '';
    const badge = item.querySelector('.copy-status-badge');
    badge.className = `copy-status-badge ${newVal ? 'done' : 'pending'}`;
    badge.textContent = newVal ? 'Done' : 'Pending';
  }

  try {
    if (rec.id) {
      await sbFetch(`copy_records?id=eq.${rec.id}`, 'PATCH', { completed: newVal, completed_at: newVal ? now : null, updated_at: now });
    } else {
      const created = await sbFetch('copy_records', 'POST', { book_id: bookId, completed: newVal, completed_at: newVal ? now : null });
      if (created?.[0]) copyRecords[bookId] = { ...copyRecords[bookId], id: created[0].id };
    }
  } catch(e) { console.warn('Toggle failed:', e); }
}

async function uploadCopyPdf(bookId, input) {
  const file = input.files[0];
  if (!file) return;
  showToast('Uploading PDF…', '');

  const fileName = `copies/${bookId}_${Date.now()}.pdf`;
  try {
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/books/${fileName}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      body: file
    });
    if (!uploadRes.ok) throw new Error('Upload failed');

    const pdf_url = `${SUPABASE_URL}/storage/v1/object/public/books/${fileName}`;
    const rec = copyRecords[bookId] || {};
    const now = new Date().toISOString();

    if (rec.id) {
      await sbFetch(`copy_records?id=eq.${rec.id}`, 'PATCH', { pdf_url, updated_at: now });
    } else {
      const created = await sbFetch('copy_records', 'POST', { book_id: bookId, pdf_url });
      if (created?.[0]) copyRecords[bookId] = { ...rec, id: created[0].id };
    }
    copyRecords[bookId] = { ...copyRecords[bookId], pdf_url };
    showToast('PDF uploaded ✓', 'success');
    renderCopies();
  } catch(e) {
    showToast('Upload failed: ' + e.message, 'error');
  }
}

async function saveStudentRemark(bookId, value) {
  const rec = copyRecords[bookId] || {};
  const now = new Date().toISOString();
  try {
    if (rec.id) {
      await sbFetch(`copy_records?id=eq.${rec.id}`, 'PATCH', { student_remark: value, updated_at: now });
    } else {
      const created = await sbFetch('copy_records', 'POST', { book_id: bookId, student_remark: value });
      if (created?.[0]) copyRecords[bookId] = { ...rec, id: created[0].id };
    }
    copyRecords[bookId] = { ...copyRecords[bookId], student_remark: value };
  } catch(e) {}
}

async function saveSeniorRemark(bookId, value) {
  if (!seniorUnlocked) return;
  const rec = copyRecords[bookId] || {};
  const now = new Date().toISOString();
  try {
    if (rec.id) {
      await sbFetch(`copy_records?id=eq.${rec.id}`, 'PATCH', { senior_remark: value, updated_at: now });
    } else {
      const created = await sbFetch('copy_records', 'POST', { book_id: bookId, senior_remark: value });
      if (created?.[0]) copyRecords[bookId] = { ...rec, id: created[0].id };
    }
    copyRecords[bookId] = { ...copyRecords[bookId], senior_remark: value };
  } catch(e) {}
}

function unlockSenior(bookId) {
  if (seniorUnlocked) return;
  pendingSeniorBookId = bookId;
  const overlay = document.createElement('div');
  overlay.className = 'pin-modal-overlay';
  overlay.id = 'pinModalOverlay';
  overlay.innerHTML = `<div class="pin-modal">
    <h3>🔒 Senior Access</h3>
    <p>Enter PIN to unlock senior remarks</p>
    <input class="pin-input" type="password" maxlength="4" id="pinInput" placeholder="••••" oninput="if(this.value.length===4)checkPin()">
    <div class="pin-modal-btns">
      <button class="btn btn-ghost" onclick="closePinModal()">Cancel</button>
      <button class="btn btn-primary" onclick="checkPin()">Unlock</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('pinInput')?.focus(), 100);
}

function checkPin() {
  const val = document.getElementById('pinInput')?.value;
  if (val === SENIOR_PIN) {
    seniorUnlocked = true;
    closePinModal();
    showToast('Senior access unlocked ✓', 'success');
    renderCopies();
  } else {
    document.getElementById('pinInput').style.borderColor = 'var(--red)';
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput').placeholder = 'Wrong PIN';
  }
}

function closePinModal() {
  document.getElementById('pinModalOverlay')?.remove();
}

// ==================== SAVED ANSWERS ====================
let savedAnswers = [];

async function saveAnswer(btn) {
  const text = decodeURIComponent(btn.getAttribute('data-text'));
  const subject = selectedDoubtBook?.subject || 'General';
  const chapter = selectedDoubtBook?.name?.replace(/_/g, ' ') || 'General';
  const entry = {
    text,
    subject,
    chapter,
    saved_at: new Date().toISOString()
  };
  try {
    const resp = await sbFetch('saved_answers', 'POST', entry);
    const saved = Array.isArray(resp) ? resp[0] : resp;
    savedAnswers.unshift(saved || entry);
  } catch(e) {
    entry.id = `local-${Date.now()}`;
    savedAnswers.unshift(entry);
  }
  btn.textContent = '✅ Saved';
  btn.classList.add('saved');
  btn.disabled = true;
  showToast('Answer saved!', 'success');
}

async function deleteSavedAnswer(id) {
  savedAnswers = savedAnswers.filter(a => a.id !== id);
  try { await sbFetch(`saved_answers?id=eq.${id}`, 'DELETE'); } catch(e) {}
  renderSaved();
}

function toggleSavedExpand(el) {
  el.classList.toggle('expanded');
}

async function renderSaved() {
  const container = document.getElementById('savedContainer');
  container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Loading…</div>`;

  try {
    const data = await sbFetch('saved_answers?order=saved_at.desc');
    savedAnswers = data || [];
  } catch(e) { /* use in-memory */ }

  if (!savedAnswers.length) {
    container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:13px">No saved answers yet. Hit the 🔖 icon on any AI response to save it.</div>`;
    return;
  }

  // Group by subject → chapter
  const grouped = {};
  savedAnswers.forEach(a => {
    const subj = a.subject || 'General';
    const chap = a.chapter || 'General';
    if (!grouped[subj]) grouped[subj] = {};
    if (!grouped[subj][chap]) grouped[subj][chap] = [];
    grouped[subj][chap].push(a);
  });

  let html = '';
  Object.entries(grouped).forEach(([subject, chapters]) => {
    html += `<div class="saved-subject-group">
      <div class="saved-subject-title">
        <span>${subject}</span>
        <button class="saved-export-btn" onclick="exportSubject('${subject}')">⬇ Export</button>
      </div>`;
    Object.entries(chapters).forEach(([chapter, answers]) => {
      html += `<div class="saved-chapter-group">
        <div class="saved-chapter-title">
          <span>📄 ${chapter}</span>
          <span style="font-size:10px">${answers.length} saved</span>
        </div>`;
      answers.forEach(a => {
        const date = new Date(a.saved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const preview = a.text.substring(0, 300);
        html += `<div class="saved-answer-item">
          <div class="saved-answer-text" onclick="this.classList.toggle('expanded')" style="cursor:pointer" title="Click to expand">${escapeHtml(preview)}${a.text.length > 300 ? '…' : ''}</div>
          <div class="saved-answer-meta">
            <span>${date}</span>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="saved-export-btn" onclick="exportOne(${JSON.stringify(a.text).replace(/"/g,'&quot;')}, '${escapeHtml(chapter)}')">⬇</button>
              <button class="saved-delete-btn" onclick="deleteSavedAnswer('${a.id}')">✕ Delete</button>
            </div>
          </div>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  });

  container.innerHTML = html;
}

function exportSubject(subject) {
  const answers = savedAnswers.filter(a => (a.subject || 'General') === subject);
  const grouped = {};
  answers.forEach(a => {
    const chap = a.chapter || 'General';
    if (!grouped[chap]) grouped[chap] = [];
    grouped[chap].push(a);
  });
  let content = `STUDYSPACE — SAVED ANSWERS\nSubject: ${subject}\nExported: ${new Date().toLocaleDateString('en-IN')}\n${'='.repeat(60)}\n\n`;
  Object.entries(grouped).forEach(([chapter, list]) => {
    content += `\n📄 ${chapter}\n${'-'.repeat(40)}\n`;
    list.forEach((a, i) => {
      content += `\n[${i+1}] ${new Date(a.saved_at).toLocaleDateString('en-IN')}\n${a.text}\n`;
    });
  });
  downloadText(content, `StudySpace_${subject}_Saved.txt`);
}

function exportAllSaved() {
  if (!savedAnswers.length) { showToast('Nothing saved yet', ''); return; }
  let content = `STUDYSPACE — ALL SAVED ANSWERS\nExported: ${new Date().toLocaleDateString('en-IN')}\n${'='.repeat(60)}\n`;
  const grouped = {};
  savedAnswers.forEach(a => {
    const key = `${a.subject || 'General'} > ${a.chapter || 'General'}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });
  Object.entries(grouped).forEach(([key, list]) => {
    content += `\n\n📚 ${key}\n${'='.repeat(40)}\n`;
    list.forEach((a, i) => { content += `\n[${i+1}] ${new Date(a.saved_at).toLocaleDateString('en-IN')}\n${a.text}\n`; });
  });
  downloadText(content, 'StudySpace_All_Saved.txt');
}

function exportOne(text, chapter) {
  const content = `STUDYSPACE — SAVED ANSWER\nChapter: ${chapter}\nExported: ${new Date().toLocaleDateString('en-IN')}\n${'='.repeat(60)}\n\n${text}`;
  downloadText(content, `StudySpace_${chapter}_Answer.txt`);
}

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function formatMessage(text) {
  // Step 1: Extract and protect LaTeX blocks before any escaping
  const latexBlocks = [];
  let protected_text = text;

  // Protect \[...\] display blocks
  protected_text = protected_text.replace(/\\\[([\s\S]*?)\\\]/g, (match) => {
    latexBlocks.push(match);
    return `%%LATEX${latexBlocks.length - 1}%%`;
  });

  // Protect \(...\) inline blocks
  protected_text = protected_text.replace(/\\\(([\s\S]*?)\\\)/g, (match) => {
    latexBlocks.push(match);
    return `%%LATEX${latexBlocks.length - 1}%%`;
  });

  // Protect $$...$$ display blocks
  protected_text = protected_text.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
    latexBlocks.push(match);
    return `%%LATEX${latexBlocks.length - 1}%%`;
  });

  // Protect $...$ inline (not lone $)
  protected_text = protected_text.replace(/\$([^$\n]+?)\$/g, (match) => {
    latexBlocks.push(match);
    return `%%LATEX${latexBlocks.length - 1}%%`;
  });

  // Step 2: Convert markdown tables before escaping
  protected_text = protected_text.replace(/^\|(.+)\|$/gm, (line) => line); // keep table lines
  
  // Detect and convert markdown tables
  const tableRegex = /(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+)/g;
  protected_text = protected_text.replace(tableRegex, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    const headers = rows[0].split('|').filter(c => c.trim()).map(c => `<th style="padding:6px 10px;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:12px;text-align:left;border-bottom:2px solid var(--ca-blue)">${c.trim()}</th>`).join('');
    const body = rows.slice(2).map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td style="padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-dim)">${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `%%TABLE<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;margin:8px 0;border:1px solid var(--border)"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>TABLE%%`;
  });

  // Step 3: Now safely escape HTML and apply markdown formatting
  let html = protected_text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<strong style="font-size:15px">$1</strong>')
    .replace(/^## (.+)$/gm, '<strong style="font-size:15px">$1</strong>')
    .replace(/^# (.+)$/gm, '<strong style="font-size:16px">$1</strong>')
    .replace(/^- (.+)$/gm, '&bull; $1')
    .replace(/^\d+\. (.+)$/gm, (m, p1) => {
      const num = m.match(/^(\d+)\./)[1];
      return `<span style="color:var(--accent);font-weight:600">${num}.</span> ${p1}`;
    })
    .replace(/---/g, '<hr style="border:none;border-top:1px solid var(--border);margin:8px 0">')
    .replace(/\n/g, '<br>');

  // Restore tables (unescaped)
  html = html.replace(/%%TABLE([\s\S]*?)TABLE%%/g, (_, t) => t.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));

  // Step 4: Restore LaTeX blocks (unescaped)
  html = html.replace(/%%LATEX(\d+)%%/g, (_, i) => latexBlocks[parseInt(i)]);

  // Step 4: Render KaTeX
  const div = document.createElement('div');
  div.innerHTML = html;
  try {
    renderMathInElement(div, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    });
    return div.innerHTML;
  } catch(e) {
    return html;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function clearChat() {
  chatHistory = [];
  document.getElementById('chatMessages').innerHTML = `
    <div class="msg ai">
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">Fresh start! What are we tackling today? 💪</div>
    </div>`;
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ==================== UTILS ====================
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 3000);
}

// ==================== DRAG AND DROP ====================
const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag');
  handleFileUpload(e.dataTransfer.files);
});

// ==================== INIT ====================
async function init() {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  try {
    const [booksData, sessionsData] = await Promise.all([
      sbFetch('books?order=created_at.desc&limit=1000').catch(() => []),
      sbFetch('sessions?order=created_at.desc').catch(() => [])
    ]);
    books = booksData || [];
    sessions = sessionsData || [];
  } catch(e) {
    books = JSON.parse(localStorage.getItem('books') || '[]');
    sessions = JSON.parse(localStorage.getItem('sessions') || '[]');
  }

  renderDashboard();

  // Check for unsaved draft session from previous tab close
  setTimeout(checkForDraftSession, 1500);

  // Start session popup reminder — delayed so draft recovery shows first
  setTimeout(startPopupReminder, 5000);
}

init();