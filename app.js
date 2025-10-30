(function () {
  const STORAGE_KEYS = {
    users: 'bb_users', // [string]
    messages: 'bb_messages', // [{ id, from, to, body, ts, readBy: [user] }]
    presence: 'bb_presence', // { [user]: lastSeenTs }
    currentUser: 'bb_currentUser', // string
    pinHash: 'bb_pin_hash', // string (hex)
    locked: 'bb_locked' // boolean
  };

  // DOM
  const el = {
    authLoggedOut: document.getElementById('authLoggedOut'),
    authLoggedIn: document.getElementById('authLoggedIn'),
    usernameInput: document.getElementById('usernameInput'),
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    lockBtn: document.getElementById('lockBtn'),
    currentUserLabel: document.getElementById('currentUserLabel'),

    usersList: document.getElementById('usersList'),
    recipientSelect: document.getElementById('recipientSelect'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importInput: document.getElementById('importInput'),
    roomIdInput: document.getElementById('roomIdInput'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    roomLinkInput: document.getElementById('roomLinkInput'),
    copyRoomLinkBtn: document.getElementById('copyRoomLinkBtn'),

    conversationTitle: document.getElementById('conversationTitle'),
    deleteConvBtn: document.getElementById('deleteConvBtn'),
    messagesList: document.getElementById('messagesList'),
    composer: document.getElementById('composer'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),

    inboxList: document.getElementById('inboxList'),
    outboxList: document.getElementById('outboxList'),

    lockOverlay: document.getElementById('lockOverlay'),
    lockTitle: document.getElementById('lockTitle'),
    pinInput: document.getElementById('pinInput'),
    unlockBtn: document.getElementById('unlockBtn'),
    lockHint: document.getElementById('lockHint')
  };

  // State (in-memory cache)
  let currentUser = getLocal(STORAGE_KEYS.currentUser, null);
  let users = getLocal(STORAGE_KEYS.users, []);
  let messages = getLocal(STORAGE_KEYS.messages, []);
  let presence = getLocal(STORAGE_KEYS.presence, {});
  let pinHash = localStorage.getItem(STORAGE_KEYS.pinHash) || '';
  let isLocked = getLocal(STORAGE_KEYS.locked, false) === true;

  // Cloud sync (Firebase RTDB) optional
  const urlParams = new URLSearchParams(location.search);
  let roomId = urlParams.get('room') || '';
  let cloudEnabled = typeof window !== 'undefined' && !!window.FIREBASE_CONFIG;
  let db = null;
  let dbRef = null;
  let dbUnsub = null; // off listener

  function randId() {
    return Math.random().toString(36).slice(2, 10);
  }

  function buildRoomLink(id) {
    const u = new URL(location.href);
    u.searchParams.set('room', id);
    return u.toString();
  }

  function ensureFirebase() {
    if (!cloudEnabled) return false;
    try {
      if (!window.firebase?.apps?.length) {
        window.firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      db = window.firebase.database();
      return true;
    } catch (e) {
      cloudEnabled = false;
      return false;
    }
  }

  function attachRoomListener() {
    if (!cloudEnabled || !roomId || !ensureFirebase()) return;
    if (dbUnsub) dbUnsub();
    dbRef = db.ref(`/rooms/${roomId}/messages`);
    messages = [];
    dbRef.off();
    dbRef.on('child_added', (snap) => {
      const m = snap.val();
      if (m) {
        messages.push(m);
        renderConversation();
        renderMiniLists();
        renderUsers();
      }
    });
    dbUnsub = () => dbRef && dbRef.off();
  }

  // --- Simple PIN lock helpers ---
  async function sha256Hex(text) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function showLockOverlay(mode) { // mode: 'unlock' | 'set'
    el.lockTitle.textContent = mode === 'set' ? 'PIN 설정' : '잠금 해제';
    el.lockHint.textContent = mode === 'set' ? '처음 한 번만 설정합니다.' : '';
    el.pinInput.value = '';
    el.lockOverlay.classList.remove('hidden');
    setTimeout(() => el.pinInput.focus(), 0);
  }

  function hideLockOverlay() {
    el.lockOverlay.classList.add('hidden');
    el.pinInput.value = '';
  }

  async function lockApp() {
    // If no PIN yet, ask to set
    pinHash = localStorage.getItem(STORAGE_KEYS.pinHash) || '';
    if (!pinHash) {
      isLocked = true;
      setLocal(STORAGE_KEYS.locked, true);
      showLockOverlay('set');
      return;
    }
    isLocked = true;
    setLocal(STORAGE_KEYS.locked, true);
    showLockOverlay('unlock');
  }

  async function unlockWithPin(pin) {
    const input = (pin || '').trim();
    if (!input) return;
    const inputHash = await sha256Hex(input);
    pinHash = localStorage.getItem(STORAGE_KEYS.pinHash) || '';
    if (!pinHash) {
      // First-time set
      localStorage.setItem(STORAGE_KEYS.pinHash, inputHash);
      pinHash = inputHash;
      isLocked = false;
      setLocal(STORAGE_KEYS.locked, false);
      hideLockOverlay();
      return;
    }
    if (inputHash === pinHash) {
      isLocked = false;
      setLocal(STORAGE_KEYS.locked, false);
      hideLockOverlay();
    } else {
      el.lockHint.textContent = 'PIN이 올바르지 않습니다';
    }
  }

  // Presence heartbeat for buddy feel
  let presenceTimer = null;
  const PRESENCE_INTERVAL_MS = 4000;
  const ONLINE_THRESHOLD_MS = 10000;

  function now() { return Date.now(); }

  function getLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function setLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function upsertUser(name) {
    const normalized = (name || '').trim();
    if (!normalized) return;
    // Self-only app: keep only me
    users = [normalized];
    setLocal(STORAGE_KEYS.users, users);
  }

  function removeUser(name) {
    users = (users || []).filter(u => u !== name);
    setLocal(STORAGE_KEYS.users, users);
  }

  function startPresence() {
    stopPresence();
    if (!currentUser) return;
    const tick = () => {
      presence = getLocal(STORAGE_KEYS.presence, {}) || {};
      presence[currentUser] = now();
      setLocal(STORAGE_KEYS.presence, presence);
    };
    tick();
    presenceTimer = setInterval(tick, PRESENCE_INTERVAL_MS);
  }

  function stopPresence() {
    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = null;
  }

  function isOnline(user) {
    const last = (presence || {})[user];
    return typeof last === 'number' && now() - last < ONLINE_THRESHOLD_MS;
  }

  function login(name) {
    const username = (name || '').trim();
    if (!username) return;

    upsertUser(username);
    currentUser = username;
    setLocal(STORAGE_KEYS.currentUser, currentUser);
    startPresence();
    renderAll();
  }

  function logout() {
    stopPresence();
    // Keep user in list so the buddy remains; do not remove
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    renderAll();
  }

  function sendMessage(body) {
    const text = (body || '').trim();
    const to = el.recipientSelect.value;
    if (!currentUser || !to || !text) return;
    const msg = {
      id: `${now()}_${Math.random().toString(36).slice(2, 8)}`,
      from: currentUser,
      to,
      body: text,
      ts: now(),
      readBy: [currentUser]
    };
    if (cloudEnabled && roomId && ensureFirebase()) {
      const ref = db.ref(`/rooms/${roomId}/messages`).push();
      ref.set(msg);
    } else {
      messages = [...messages, msg];
      setLocal(STORAGE_KEYS.messages, messages);
      renderConversation();
      renderMiniLists();
      renderUsers();
    }
    el.messageInput.value = '';
  }

  function deleteConversation() {
    const me = currentUser;
    if (!me) return;
    if (cloudEnabled && roomId && ensureFirebase()) {
      const ref = db.ref(`/rooms/${roomId}/messages`);
      ref.remove();
    } else {
      messages = messages.filter(m => !(m.from === me && m.to === me));
      setLocal(STORAGE_KEYS.messages, messages);
      renderConversation();
      renderMiniLists();
      renderUsers();
    }
  }

  function clearAllConversations() {
    if (!confirm('모든 대화를 비우시겠습니까?')) return;
    if (cloudEnabled && roomId && ensureFirebase()) {
      const ref = db.ref(`/rooms/${roomId}/messages`);
      ref.remove();
    } else {
      messages = [];
      setLocal(STORAGE_KEYS.messages, messages);
      renderConversation();
      renderMiniLists();
      renderUsers();
    }
  }

  function getBuddyOf(user) {
    // Self inbox: buddy is me
    return user || '';
  }

  function getConversation(a, b) {
    // Self conversation
    return (messages || [])
      .filter(m => m.from === a && m.to === b)
      .sort((x, y) => x.ts - y.ts);
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  function unreadCount(from, to) {
    return (messages || []).reduce((acc, m) => {
      if (m.from === from && m.to === to && !(m.readBy || []).includes(to)) return acc + 1;
      return acc;
    }, 0);
  }

  function markConversationRead(viewer, buddy) {
    let changed = false;
    messages = (messages || []).map(m => {
      if (m.to === viewer && m.from === buddy && !(m.readBy || []).includes(viewer)) {
        changed = true;
        return { ...m, readBy: [...(m.readBy || []), viewer] };
      }
      return m;
    });
    if (changed) setLocal(STORAGE_KEYS.messages, messages);
  }

  // Rendering
  function renderAuth() {
    if (currentUser) {
      el.authLoggedOut.classList.add('hidden');
      el.authLoggedIn.classList.remove('hidden');
      el.currentUserLabel.textContent = `로그인: ${currentUser}`;
    } else {
      el.authLoggedOut.classList.remove('hidden');
      el.authLoggedIn.classList.add('hidden');
      el.currentUserLabel.textContent = '';
    }
  }

  function renderUsers() {
    // Users area + recipient select
    const list = el.usersList;
    list.innerHTML = '';

    if (!users || users.length === 0) {
      list.classList.add('empty');
      list.textContent = '로그인하면 내 카드가 표시됩니다.';
    } else {
      list.classList.remove('empty');
      const u = users[0];
      const pill = document.createElement('div');
      pill.className = 'user-pill';

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = u;

      const online = document.createElement('span');
      online.className = 'badge';
      online.textContent = isOnline(u) ? '온라인' : '오프라인';

      const unread = currentUser ? unreadCount(u, u) : 0;
      const unreadEl = document.createElement('span');
      unreadEl.className = 'badge';
      unreadEl.textContent = unread > 0 ? `안읽음 ${unread}` : '0';

      pill.appendChild(name);
      pill.appendChild(online);
      pill.appendChild(unreadEl);
      list.appendChild(pill);
    }

    // Recipient select: only buddy
    el.recipientSelect.innerHTML = '';
    if (!currentUser) {
      el.recipientSelect.disabled = true;
      el.messageInput.disabled = true;
      el.sendBtn.disabled = true;
      el.deleteConvBtn.disabled = true;
      el.clearAllBtn.disabled = messages.length === 0;
      return;
    }

    const buddy = getBuddyOf(currentUser);
    if (buddy) {
      const opt = document.createElement('option');
      opt.value = buddy;
      opt.textContent = buddy;
      el.recipientSelect.appendChild(opt);
      // Self-only: keep disabled but enable composer
      el.recipientSelect.disabled = true;
      el.messageInput.disabled = false;
      el.sendBtn.disabled = false;
      el.deleteConvBtn.disabled = false;
    } else {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '상대 사용자가 아직 없습니다';
      el.recipientSelect.appendChild(opt);
      el.recipientSelect.disabled = true;
      el.messageInput.disabled = true;
      el.sendBtn.disabled = true;
      el.deleteConvBtn.disabled = true;
    }

    el.clearAllBtn.disabled = messages.length === 0;
  }

  function renderConversation() {
    const buddy = currentUser;
    el.conversationTitle.textContent = '나와의 대화';
    el.messagesList.innerHTML = '';
    if (!currentUser || !buddy) return;

    const conv = getConversation(currentUser, currentUser);
    markConversationRead(currentUser, currentUser);

    conv.forEach(m => {
      const row = document.createElement('li');
      row.className = 'row' + (m.from === currentUser ? ' mine' : '');

      const bubble = document.createElement('div');
      bubble.className = 'bubble' + (m.from === currentUser ? ' mine' : '');
      bubble.innerHTML = `${escapeHtml(m.body)}<div class="meta"><span>${m.from}</span><span>${formatTime(m.ts)}</span></div>`;

      row.appendChild(bubble);
      el.messagesList.appendChild(row);
    });

    // Scroll to bottom
    el.messagesList.scrollTop = el.messagesList.scrollHeight;
  }

  function renderMiniLists() {
    el.inboxList.innerHTML = '';
    el.outboxList.innerHTML = '';
    if (!currentUser) return;

    const inbox = messages
      .filter(m => m.to === currentUser)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 20);
    const outbox = messages
      .filter(m => m.from === currentUser)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 20);

    inbox.forEach(m => el.inboxList.appendChild(renderMiniItem(m, 'from')));
    outbox.forEach(m => el.outboxList.appendChild(renderMiniItem(m, 'to')));
  }

  function renderMiniItem(m, field) {
    const li = document.createElement('li');
    li.className = 'mini-item';
    const who = document.createElement('span');
    who.className = 'fromto';
    who.textContent = m[field];
    const snippet = document.createElement('span');
    snippet.className = 'snippet';
    snippet.textContent = m.body;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatTime(m.ts);
    li.appendChild(who);
    li.appendChild(snippet);
    li.appendChild(time);
    return li;
  }

  function escapeHtml(s) {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderAll() {
    // Refresh latest from storage first (other tabs may have updated)
    users = getLocal(STORAGE_KEYS.users, []);
    if (!cloudEnabled || !roomId) {
      messages = getLocal(STORAGE_KEYS.messages, []);
    }
    presence = getLocal(STORAGE_KEYS.presence, {});
    pinHash = localStorage.getItem(STORAGE_KEYS.pinHash) || '';
    isLocked = getLocal(STORAGE_KEYS.locked, false) === true;
    renderAuth();
    renderUsers();
    renderConversation();
    renderMiniLists();
    // Lock overlay last so it covers UI
    if (isLocked) {
      showLockOverlay(pinHash ? 'unlock' : 'set');
    } else {
      hideLockOverlay();
    }
    // Cloud attach
    if (cloudEnabled && roomId) attachRoomListener();
  }

  // Event wiring
  el.loginBtn.addEventListener('click', () => login(el.usernameInput.value));
  el.usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login(el.usernameInput.value);
  });
  el.logoutBtn.addEventListener('click', logout);
  if (el.lockBtn) {
    el.lockBtn.addEventListener('click', () => {
      lockApp();
    });
  }

  el.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(el.messageInput.value);
  });
  el.deleteConvBtn.addEventListener('click', deleteConversation);
  el.clearAllBtn.addEventListener('click', clearAllConversations);

  // Backup / Restore
  if (el.exportBtn) {
    el.exportBtn.addEventListener('click', () => {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          users: getLocal(STORAGE_KEYS.users, []),
          messages: getLocal(STORAGE_KEYS.messages, []),
          presence: getLocal(STORAGE_KEYS.presence, {}),
          currentUser: getLocal(STORAGE_KEYS.currentUser, null),
          pinHash: localStorage.getItem(STORAGE_KEYS.pinHash) || '',
          locked: getLocal(STORAGE_KEYS.locked, false)
        }
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buddy-inbox-backup-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }
  if (el.importInput) {
    el.importInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const d = parsed && parsed.data ? parsed.data : parsed;
        if (!d) throw new Error('Invalid backup');
        // Apply
        setLocal(STORAGE_KEYS.users, d.users || []);
        setLocal(STORAGE_KEYS.messages, d.messages || []);
        setLocal(STORAGE_KEYS.presence, d.presence || {});
        if (typeof d.currentUser !== 'undefined') setLocal(STORAGE_KEYS.currentUser, d.currentUser);
        if (typeof d.locked !== 'undefined') setLocal(STORAGE_KEYS.locked, d.locked);
        if (typeof d.pinHash === 'string') localStorage.setItem(STORAGE_KEYS.pinHash, d.pinHash);
        // Refresh in-memory
        currentUser = getLocal(STORAGE_KEYS.currentUser, null);
        users = getLocal(STORAGE_KEYS.users, []);
        messages = getLocal(STORAGE_KEYS.messages, []);
        presence = getLocal(STORAGE_KEYS.presence, {});
        pinHash = localStorage.getItem(STORAGE_KEYS.pinHash) || '';
        isLocked = getLocal(STORAGE_KEYS.locked, false) === true;
        renderAll();
        alert('복원이 완료되었습니다.');
      } catch (err) {
        alert('복원에 실패했습니다. 올바른 JSON 파일인지 확인해주세요.');
      } finally {
        e.target.value = '';
      }
    });
  }

  // Lock overlay events
  if (el.unlockBtn) {
    el.unlockBtn.addEventListener('click', () => unlockWithPin(el.pinInput.value));
  }
  if (el.pinInput) {
    el.pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') unlockWithPin(el.pinInput.value);
    });
  }

  window.addEventListener('storage', (e) => {
    if (
      e.key === STORAGE_KEYS.users ||
      (!cloudEnabled || !roomId) && e.key === STORAGE_KEYS.messages ||
      e.key === STORAGE_KEYS.presence ||
      e.key === STORAGE_KEYS.pinHash ||
      e.key === STORAGE_KEYS.locked
    ) {
      renderAll();
    }
  });

  // Initialize
  if (currentUser) startPresence();
  renderAll();

  // Room UI wiring
  if (el.roomIdInput && el.roomLinkInput && el.createRoomBtn && el.copyRoomLinkBtn) {
    // Pre-fill from URL
    if (roomId) {
      el.roomIdInput.value = roomId;
      el.roomLinkInput.value = buildRoomLink(roomId);
    }
    el.createRoomBtn.addEventListener('click', () => {
      const want = (el.roomIdInput.value || '').trim() || randId();
      roomId = want;
      const link = buildRoomLink(roomId);
      el.roomLinkInput.value = link;
      const u = new URL(location.href);
      u.searchParams.set('room', roomId);
      history.replaceState({}, '', u.toString());
      if (cloudEnabled) attachRoomListener();
    });
    el.copyRoomLinkBtn.addEventListener('click', async () => {
      const link = el.roomLinkInput.value;
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        el.copyRoomLinkBtn.textContent = '복사됨!';
        setTimeout(() => el.copyRoomLinkBtn.textContent = '링크 복사', 1200);
      } catch {}
    });
  }
})();


