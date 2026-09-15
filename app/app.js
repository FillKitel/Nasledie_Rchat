const seedChats = [
  {
    id: "marina",
    name: "Марина Котова",
    initials: "МК",
    avatar: "orange",
    status: "в сети",
    handle: "@marina",
    bio: "Дизайнер. Люблю хорошую типографику и плохие шутки.",
    preview: "Тогда берём второй вариант ✨",
    time: "12:42",
    unread: 2,
    messages: [
      { direction: "in", text: "Привет! Посмотрела наброски нового экрана.", time: "12:35" },
      { direction: "in", text: "Второй вариант выглядит спокойнее и на телефоне читается лучше.", time: "12:36" },
      { direction: "out", text: "Согласен. Я ещё немного увеличу отступы и проверю тёмную тему.", time: "12:39" },
      { direction: "in", text: "Тогда берём второй вариант ✨", time: "12:42", reaction: "👍", reactionCount: 2 }
    ]
  },
  {
    id: "team",
    name: "Команда продукта",
    initials: "КП",
    avatar: "purple",
    status: "5 участников",
    handle: "Закрытая группа",
    bio: "Обсуждаем продукт, дизайн и ближайшие релизы.",
    preview: "Илья: созвон перенесли на 16:00",
    time: "11:18",
    unread: 5,
    verified: true,
    messages: [
      { direction: "in", text: "Доброе утро! Собрал вопросы к первому прототипу.", time: "10:02" },
      { direction: "out", text: "Отлично, давайте пройдёмся по ним на созвоне.", time: "10:11" },
      { direction: "in", text: "Илья: созвон перенесли на 16:00", time: "11:18" }
    ]
  },
  {
    id: "alex",
    name: "Алексей Романов",
    initials: "АР",
    avatar: "blue",
    status: "был недавно",
    handle: "@alexr",
    bio: "Разработчик мобильных приложений.",
    preview: "Вы: Хорошо, я посмотрю вечером",
    time: "Вчера",
    unread: 0,
    messages: [
      { direction: "in", text: "Я подготовил заметки по синхронизации между устройствами.", time: "19:10" },
      { direction: "out", text: "Хорошо, я посмотрю вечером", time: "19:16" }
    ]
  },
  {
    id: "saved",
    name: "Сохранённые",
    initials: "★",
    avatar: "logo-avatar",
    status: "личное облако",
    handle: "Только для вас",
    bio: "Заметки, ссылки и файлы, которые всегда под рукой.",
    preview: "https://webrtc.org/getting-started/",
    time: "Вс",
    unread: 0,
    verified: true,
    messages: [
      { direction: "out", text: "Идея: быстрые голосовые комнаты для маленьких команд.", time: "09:20" },
      { direction: "out", text: "https://webrtc.org/getting-started/", time: "09:22" }
    ]
  },
  {
    id: "lena",
    name: "Лена Воронова",
    initials: "ЛВ",
    avatar: "pink",
    status: "была вчера",
    handle: "@lenavoronova",
    bio: "Фотограф и путешественница.",
    preview: "Отправила фотографию",
    time: "Сб",
    unread: 1,
    messages: [
      { direction: "in", text: "Наконец поймала тот самый вечерний свет 📷", time: "18:43" },
      { direction: "out", text: "Очень красиво. Особенно цвет неба!", time: "18:48" }
    ]
  },
  {
    id: "nikita",
    name: "Никита Орлов",
    initials: "НО",
    avatar: "green",
    status: "был в 10:14",
    handle: "@nik_orlov",
    bio: "Музыка, кофе и бег по утрам.",
    preview: "Спасибо! Всё получилось",
    time: "Пт",
    unread: 0,
    messages: [
      { direction: "out", text: "Попробуй снова войти после обновления приложения.", time: "10:03" },
      { direction: "in", text: "Спасибо! Всё получилось", time: "10:14", reaction: "🙌", reactionCount: 1 }
    ]
  }
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const STORAGE_KEY = "mayak-chats-v2";
const PROFILE_KEY = "mayak-profile-v1";
const LIVE_CHAT_ID = "live";
const CLIENT_NAME_KEY = "mayak-client-name";
const DEVICE_ID_KEY = "mayak-device-id-v1";
const stored = localStorage.getItem(STORAGE_KEY);
let chats;

try {
  chats = stored ? JSON.parse(stored) : clone(seedChats);
  if (!Array.isArray(chats) || !chats.length) throw new Error("invalid state");
} catch {
  chats = clone(seedChats);
}

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function getLocalValue(key, fallback) {
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    localStorage.setItem(key, fallback);
  } catch {}
  return fallback;
}

function normalizeHandle(value, name = "") {
  const source = String(value || name || "mayak")
    .trim()
    .replace(/^@+/, "")
    .toLocaleLowerCase("ru");
  const clean = source
    .replace(/\s+/g, "_")
    .replace(/[^a-zа-яё0-9_]/gi, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return `@${clean || "mayak"}`;
}

function defaultDeviceName() {
  const ua = navigator.userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac/i.test(ua)) return "Mac";
  return "Устройство Маяка";
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const name = String(parsed.name || "").trim();
    const id = String(parsed.id || "").trim();
    if (!name || !id) return null;
    return {
      id,
      name: name.slice(0, 60),
      handle: normalizeHandle(parsed.handle, name),
      initials: makeInitials(name),
      bio: String(parsed.bio || "").trim().slice(0, 280),
      avatarUrl: String(parsed.avatarUrl || ""),
      deviceName: String(parsed.deviceName || defaultDeviceName()).trim().slice(0, 60),
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || parsed.createdAt || new Date().toISOString()
    };
  } catch {
    return null;
  }
}

function defaultProfileName() {
  const legacy = localStorage.getItem(CLIENT_NAME_KEY);
  if (legacy && !legacy.startsWith("Устройство ")) return legacy;
  return "";
}

const deviceId = getLocalValue(DEVICE_ID_KEY, makeId("device"));
let profile = loadProfile();
let authMode = profile ? "login" : "register";

function currentAuthorId() {
  return profile?.id || deviceId;
}

function currentAuthorName() {
  return profile?.name || defaultProfileName() || `Устройство ${deviceId.slice(-4).toLocaleUpperCase("ru")}`;
}

function currentDeviceName() {
  return profile?.deviceName || defaultDeviceName();
}

const hostedPage = location.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const realtime = {
  mode: hostedPage ? "cloud" : "local",
  inviteRequired: false,
  available: false,
  connected: false,
  requiresAuth: hostedPage,
  authenticated: false,
  serverVersion: "",
  clients: 0,
  devices: 0,
  participants: [],
  connectUrl: "",
  source: null,
  knownMessageIds: new Set()
};

function createLiveChat() {
  return {
    id: LIVE_CHAT_ID,
    serverChatId: LIVE_CHAT_ID,
    realtime: true,
    name: "Живой чат",
    initials: "LC",
    avatar: "logo-avatar",
    status: "проверка сервера",
    handle: "localhost realtime",
    bio: "Первый настоящий диалог: сообщения проходят через локальный сервер и появляются во всех открытых окнах.",
    preview: "Откройте два окна и отправьте сообщение",
    time: "v0.9",
    unread: 0,
    verified: true,
    messages: []
  };
}

function ensureLiveChat() {
  let chat = chats.find((item) => item.id === LIVE_CHAT_ID);
  if (!chat) {
    chat = createLiveChat();
    chats = [chat, ...chats];
    save();
  }
  chat.verified = true;
  chat.handle = "localhost realtime";
  chat.serverChatId = LIVE_CHAT_ID;
  chat.realtime = true;
  chat.bio = "Первый настоящий диалог: сообщения проходят через локальный сервер и появляются во всех открытых окнах.";
  return chat;
}

ensureLiveChat();

let activeChatId = LIVE_CHAT_ID;
let activeFilter = "all";
let activeSection = "chats";
let replyTimer;

const $ = (selector) => document.querySelector(selector);
const appShell = $("#appShell");
const chatList = $("#chatList");
const messages = $("#messages");
const messageArea = $("#messageArea");
const messageInput = $("#messageInput");
const searchInput = $("#searchInput");
const typingIndicator = $("#typingIndicator");
const toast = $("#toast");
const newChatModal = $("#newChatModal");
const newChatForm = $("#newChatForm");
const offlineModal = $("#offlineModal");
const offlinePacketForm = $("#offlinePacketForm");
const liveStatus = $("#liveStatus");
const connectModal = $("#connectModal");
const connectRoomButton = $("#connectRoomButton");
const connectParticipants = $("#connectParticipants");
const connectParticipantsCount = $("#connectParticipantsCount");
const presencePill = $("#presencePill");
const profileModal = $("#profileModal");
const profileForm = $("#profileForm");
const profileNameInput = $("#profileName");
const profileHandleInput = $("#profileHandle");
const profilePasswordInput = $("#profilePassword");
const profileBioInput = $("#profileBio");
const profileDeviceNameInput = $("#profileDeviceName");
const profileAvatarInput = $("#profileAvatarInput");
const profileAvatarChoose = $("#profileAvatarChoose");
const profileAvatarRemove = $("#profileAvatarRemove");
const profileLogoutButton = $("#profileLogoutButton");
const profileButtons = [$("#profileButton"), $("#inboxProfileButton")].filter(Boolean);
const chatActionsButton = $("#chatActionsButton");
const chatActionsMenu = $("#chatActionsMenu");
const clearChatButton = $("#clearChatButton");
const messageActionsMenu = $("#messageActionsMenu");
const deleteMessageButton = $("#deleteMessageButton");
const confirmModal = $("#confirmModal");
const confirmForm = $("#confirmForm");
const confirmActionButton = $("#confirmActionButton");
let profileHandleTouched = false;
let pendingAvatarBlob = null;
let pendingAvatarPreviewUrl = "";
let pendingAvatarRemoval = false;
let pendingMessageTarget = null;
let pendingConfirmAction = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function avatarInnerHtml({ avatarUrl = "", name = "", initials = "" } = {}) {
  return avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" />`
    : escapeHtml(initials || makeInitials(name));
}

function setAvatar(element, { avatarUrl = "", name = "", initials = "" } = {}) {
  if (!element) return;
  element.replaceChildren();
  if (!avatarUrl) {
    element.textContent = initials || makeInitials(name);
    return;
  }
  const image = document.createElement("img");
  image.src = avatarUrl;
  image.alt = "";
  image.addEventListener("error", () => {
    image.remove();
    element.textContent = initials || makeInitials(name);
  }, { once: true });
  element.append(image);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function activeChat() {
  return chats.find((chat) => chat.id === activeChatId) || chats[0];
}

function renderChatList() {
  const query = searchInput.value.trim().toLocaleLowerCase("ru");
  const visible = chats.filter((chat) => {
    const matchesSearch = `${chat.name} ${chat.preview || ""}`.toLocaleLowerCase("ru").includes(query);
    const matchesFilter = activeFilter === "all" || chat.unread > 0;
    return matchesSearch && matchesFilter;
  });

  $("#allCount").textContent = chats.length;
  $("#unreadCount").textContent = chats.filter((chat) => chat.unread > 0).length;

  if (!visible.length) {
    chatList.innerHTML = '<div class="empty-search">Ничего не найдено.<br>Попробуйте другой запрос.</div>';
    return;
  }

  chatList.innerHTML = visible.map((chat) => `
    <button class="chat-item ${chat.id === activeChatId ? "active" : ""}" data-chat-id="${chat.id}">
      <span class="avatar ${chat.avatar}">${avatarInnerHtml(chat)}</span>
      <span class="chat-copy">
        <strong>${escapeHtml(chat.name)} ${chat.verified ? '<span class="verified">✓</span>' : ""}</strong>
        <p>${(chat.preview || "").startsWith("Вы:") ? `<span class="you">Вы:</span>${escapeHtml(chat.preview.slice(3))}` : escapeHtml(chat.preview || "Пока нет сообщений")}</p>
      </span>
      <span class="chat-meta"><time>${escapeHtml(chat.time)}</time>${chat.unread ? `<b class="unread-badge">${chat.unread}</b>` : ""}</span>
    </button>
  `).join("");

  chatList.querySelectorAll("[data-chat-id]").forEach((button) => {
    button.addEventListener("click", () => openChat(button.dataset.chatId));
  });
}

function renderMessages() {
  const chat = activeChat();
  closeMessageActions();
  const emptyText = chat.id === LIVE_CHAT_ID
    ? "Откройте этот же адрес во втором окне и отправьте сообщение. Если сервер запущен, оно появится там автоматически."
    : chat.realtime
      ? "Это личный чат. Сообщения идут через сервер Маяка."
    : "Здесь пока нет сообщений.";
  messages.innerHTML = `
    <div class="day-divider">Сегодня</div>
    ${chat.messages.length ? chat.messages.map((message, index) => {
      const previous = chat.messages[index - 1];
      const grouped = previous && previous.direction === message.direction;
      const messageAction = message.direction === "out"
        ? `<button class="message-action-button" type="button" data-message-action data-message-index="${index}" data-message-id="${escapeHtml(message.id || "")}" aria-label="Действия с сообщением" aria-expanded="false"><svg><use href="#i-more"/></svg></button>`
        : "";
      return `
        <div class="message ${message.direction} ${grouped ? "grouped" : ""}">
          <div class="message-row">${messageAction}<div class="bubble">${message.authorName && message.direction === "in" ? `<strong class="message-author">${escapeHtml(message.authorName)}</strong>` : ""}${escapeHtml(message.text).replaceAll("\n", "<br>")}<span class="message-time">${escapeHtml(message.time)}${message.direction === "out" ? '<span class="checks">✓✓</span>' : ""}</span></div></div>
          ${message.reaction ? `<button class="reaction" aria-label="Реакция ${escapeHtml(message.reaction)}">${escapeHtml(message.reaction)} <small>${message.reactionCount || 1}</small></button>` : ""}
        </div>
      `;
    }).join("") : `<div class="empty-chat"><strong>Ждём первое сообщение</strong>${escapeHtml(emptyText)}</div>`}
  `;

  messages.querySelectorAll(".reaction").forEach((button) => {
    button.addEventListener("click", () => {
      const count = button.querySelector("small");
      count.textContent = Number(count.textContent) + 1;
      showToast("Реакция добавлена");
    });
  });

  messages.querySelectorAll("[data-message-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openMessageActions(button);
    });
  });

  requestAnimationFrame(() => { messageArea.scrollTop = messageArea.scrollHeight; });
}

function updateHeader() {
  const chat = activeChat();
  $("#headerAvatar").className = `avatar ${chat.avatar}`;
  setAvatar($("#headerAvatar"), chat);
  $("#headerName").textContent = chat.name;
  $("#headerStatus").textContent = chat.status;
  $("#detailsAvatar").className = `avatar profile-avatar ${chat.avatar}`;
  setAvatar($("#detailsAvatar"), chat);
  $("#detailsName").textContent = chat.name;
  $("#detailsHandle").textContent = chat.handle;
  $("#detailsBio").textContent = chat.bio;
  connectRoomButton.hidden = chat.id !== LIVE_CHAT_ID;
  const headerOnlineDot = $(".person-heading .online-dot");
  if (headerOnlineDot) headerOnlineDot.style.display = chat.status === "в сети" ? "block" : "none";
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 820px)").matches;
}

function renderActiveChat() {
  renderChatList();
  updateHeader();
  renderMessages();
}

function openConversationPanel({ pushHistory = true } = {}) {
  appShell.classList.add("chat-open");
  if (!pushHistory || !isMobileLayout()) return;
  if (history.state?.mayakChatOpen) {
    history.replaceState({ mayakChatOpen: true, chatId: activeChatId }, "", location.href);
    return;
  }
  history.pushState({ mayakChatOpen: true, chatId: activeChatId }, "", location.href);
}

function closeConversationPanel() {
  if (isMobileLayout() && history.state?.mayakChatOpen) {
    history.back();
    return;
  }
  appShell.classList.remove("chat-open");
}

function openChat(id) {
  const chat = chats.find((item) => item.id === id);
  if (!chat) return;
  closeChatActions();
  closeMessageActions();
  activeChatId = id;
  activeSection = "chats";
  chat.unread = 0;
  save();
  setSection("chats");
  renderActiveChat();
  openConversationPanel();
  if (chat.realtime && realtime.available) loadServerChatHistory(chat);
  if (window.innerWidth > 820) messageInput.focus();
}

function currentTime() {
  return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

async function sendMessage(text) {
  const chat = activeChat();
  const cleanText = text.trim();
  if (!cleanText) return false;

  if (chat.id === LIVE_CHAT_ID || chat.realtime) {
    return sendRealtimeMessage(cleanText, chat);
  }

  const time = currentTime();
  chat.messages.push({ direction: "out", text: cleanText, time });
  chat.preview = `Вы: ${cleanText}`;
  chat.time = time;
  chats = [chat, ...chats.filter((item) => item.id !== chat.id)];
  save();
  renderChatList();
  renderMessages();
  simulateReply(chat.id);
  return true;
}

function simulateReply(chatId) {
  clearTimeout(replyTimer);
  if (chatId === "saved") return;
  typingIndicator.classList.add("visible");
  replyTimer = setTimeout(() => {
    if (activeChatId !== chatId) return typingIndicator.classList.remove("visible");
    const chat = activeChat();
    const replies = [
      "Отлично, договорились 👍",
      "Звучит хорошо! Давай так и сделаем.",
      "Вижу сообщение. Вернусь с ответом чуть позже.",
      "Да, мне нравится этот вариант ✨"
    ];
    const reply = replies[Math.floor(Math.random() * replies.length)];
    const time = currentTime();
    chat.messages.push({ direction: "in", text: reply, time });
    chat.preview = reply;
    chat.time = time;
    typingIndicator.classList.remove("visible");
    save();
    renderChatList();
    renderMessages();
  }, 1300);
}

function resizeComposer() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 116)}px`;
}

let toastTimer;
function showToast(text) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1700);
}

function closeChatActions() {
  chatActionsMenu.hidden = true;
  chatActionsButton.setAttribute("aria-expanded", "false");
}

function toggleChatActions() {
  const willOpen = chatActionsMenu.hidden;
  closeMessageActions();
  chatActionsMenu.hidden = !willOpen;
  chatActionsButton.setAttribute("aria-expanded", String(willOpen));
}

function closeMessageActions() {
  messageActionsMenu.hidden = true;
  messages.querySelectorAll('[data-message-action][aria-expanded="true"]').forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function openMessageActions(button) {
  closeMessageActions();
  closeChatActions();
  const chat = activeChat();
  pendingMessageTarget = {
    localChatId: chat.id,
    chatId: chat.serverChatId || chat.id,
    messageId: button.dataset.messageId || "",
    messageIndex: Number(button.dataset.messageIndex)
  };
  button.setAttribute("aria-expanded", "true");
  messageActionsMenu.hidden = false;
  const rect = button.getBoundingClientRect();
  const menuWidth = Math.max(messageActionsMenu.offsetWidth, 190);
  const menuHeight = Math.max(messageActionsMenu.offsetHeight, 48);
  const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
  const below = rect.bottom + 6;
  const top = below + menuHeight <= window.innerHeight - 8
    ? below
    : Math.max(8, rect.top - menuHeight - 6);
  messageActionsMenu.style.left = `${left}px`;
  messageActionsMenu.style.top = `${top}px`;
}

function closeConfirmModal() {
  confirmModal.hidden = true;
  pendingConfirmAction = null;
  confirmActionButton.disabled = false;
}

function openConfirmModal({ title, text, actionLabel, action }) {
  closeChatActions();
  closeMessageActions();
  $("#confirmTitle").textContent = title;
  $("#confirmText").textContent = text;
  confirmActionButton.textContent = actionLabel;
  pendingConfirmAction = action;
  confirmModal.hidden = false;
  $("#confirmCancelButton").focus();
}

function updateChatAfterHistoryChange(chat) {
  const last = chat.messages.at(-1);
  if (last) {
    chat.preview = `${last.direction === "out" ? "Вы: " : ""}${last.text}`;
    chat.time = last.time;
  } else {
    chat.preview = chat.realtime ? realtimeEmptyPreview(chat) : "Пока нет сообщений";
    chat.time = chat.realtime && realtime.available ? "online" : "";
  }
  chat.unread = 0;
}

function applyMessageDeleted({ chatId, messageId }, { localChatId = "", messageIndex = -1 } = {}) {
  const chat = chats.find((item) => item.serverChatId === chatId || item.id === chatId || item.id === localChatId);
  if (!chat) return;
  if (messageId) {
    chat.messages = chat.messages.filter((message) => message.id !== messageId);
    realtime.knownMessageIds.delete(messageId);
  } else if (messageIndex >= 0 && messageIndex < chat.messages.length) {
    chat.messages.splice(messageIndex, 1);
  }
  updateChatAfterHistoryChange(chat);
  save();
  renderChatList();
  if (chat.id === activeChatId) renderMessages();
}

function applyChatCleared({ chatId, beforeSequence }, { localChatId = "" } = {}) {
  const chat = chats.find((item) => item.serverChatId === chatId || item.id === chatId || item.id === localChatId);
  if (!chat) return;
  if (Number.isFinite(beforeSequence)) chat.clearedBeforeSequence = Math.max(chat.clearedBeforeSequence || 0, beforeSequence);
  chat.messages = chat.messages.filter((message) => {
    const keep = Number.isFinite(beforeSequence) && message.sequence > chat.clearedBeforeSequence;
    if (!keep && message.id) realtime.knownMessageIds.delete(message.id);
    return keep;
  });
  updateChatAfterHistoryChange(chat);
  save();
  renderChatList();
  if (chat.id === activeChatId) renderMessages();
}

async function deleteSelectedMessage(target) {
  const chat = chats.find((item) => item.id === target.localChatId);
  if (!chat) return;
  if (chat.realtime) {
    if (!target.messageId) throw new Error("Сообщение ещё не синхронизировано");
    const { deleted } = await fetchJson(`/api/messages/${encodeURIComponent(target.messageId)}`, {
      method: "DELETE",
      timeout: 3000
    });
    applyMessageDeleted(deleted);
  } else {
    applyMessageDeleted({ chatId: chat.id, messageId: "" }, target);
  }
  showToast("Сообщение удалено");
}

function confirmMessageDeletion(target) {
  const chat = chats.find((item) => item.id === target.localChatId);
  if (!chat) return;
  openConfirmModal({
    title: "Удалить сообщение?",
    text: chat.realtime
      ? "Сообщение исчезнет у всех участников этого диалога."
      : "Сообщение исчезнет из этого локального демо-чата.",
    actionLabel: "Удалить",
    action: () => deleteSelectedMessage(target)
  });
}

async function clearSelectedChat(target) {
  const chat = chats.find((item) => item.id === target.localChatId);
  if (!chat) return;
  if (chat.realtime) {
    const { cleared } = await fetchJson(`/api/conversations/${encodeURIComponent(target.chatId)}/messages`, {
      method: "DELETE",
      timeout: 3000
    });
    applyChatCleared(cleared, target);
  } else {
    applyChatCleared({ chatId: chat.id }, target);
  }
  showToast("История чата очищена");
}

function confirmChatClear() {
  const chat = activeChat();
  if (!chat.messages.length) {
    closeChatActions();
    showToast("В этом чате пока нечего очищать");
    return;
  }
  const target = { localChatId: chat.id, chatId: chat.serverChatId || chat.id };
  openConfirmModal({
    title: "Очистить историю?",
    text: chat.realtime
      ? "Сообщения исчезнут на всех ваших устройствах. У остальных участников история сохранится."
      : "Все сообщения в этом локальном демо-чате будут удалены.",
    actionLabel: "Очистить",
    action: () => clearSelectedChat(target)
  });
}

function pluralRu(number, one, few, many) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function participantLabel(participant) {
  const device = participant.deviceName || "Устройство Маяка";
  const handle = participant.handle || "локальный профиль";
  return `${device} · ${handle}`;
}

function participantPeerId(participant) {
  return participant?.profileId || participant?.id || "";
}

function isOwnParticipant(participant) {
  const peerId = participantPeerId(participant);
  return peerId === currentAuthorId() || participant?.id === deviceId;
}

function participantById(id) {
  return realtime.participants.find((participant) => participant.id === id);
}

function upsertParticipantChat(participant, conversation) {
  const serverChatId = conversation.id;
  const peer = conversation.peer || {};
  const name = peer.name || participant.name || "Локальный контакт";
  const handle = peer.handle || participant.handle || "локальная сеть";
  const bio = peer.bio || participant.bio || "";
  const avatarUrl = peer.avatarUrl || participant.avatarUrl || "";
  const device = participant.deviceName || "устройство Маяка";
  let chat = chats.find((item) => item.serverChatId === serverChatId || item.id === serverChatId);

  if (!chat) {
    chat = {
      id: serverChatId,
      serverChatId,
      realtime: true,
      name,
      initials: makeInitials(name),
      avatar: "logo-avatar",
      avatarUrl,
      status: "локальная сеть · онлайн",
      handle,
      bio: bio || `Личный чат с ${device}. Работает через локальный сервер, пока устройства видят одну сеть.`,
      preview: "Личный чат готов — напишите первое сообщение",
      time: "online",
      unread: 0,
      messages: [],
      peer: {
        id: participant.id,
        profileId: participant.profileId,
        deviceName: device
      }
    };
  }

  chat.serverChatId = serverChatId;
  chat.realtime = true;
  chat.name = name;
  chat.initials = makeInitials(name);
  chat.avatarUrl = avatarUrl;
  chat.status = "локальная сеть · онлайн";
  chat.handle = handle;
  chat.bio = bio || `Личный чат с ${device}. Работает через локальный сервер, пока устройства видят одну сеть.`;
  chat.peer = {
    id: participant.id,
    profileId: participant.profileId,
    deviceName: device
  };
  chats = [chat, ...chats.filter((item) => item.id !== chat.id)];
  save();
  return chat;
}

function syncServerConversations(serverConversations = []) {
  const allowed = new Set(serverConversations.map((conversation) => conversation.id));
  chats = chats.filter((chat) => !chat.realtime || chat.id === LIVE_CHAT_ID || allowed.has(chat.serverChatId || chat.id));
  for (const conversation of serverConversations) {
    if (conversation.id === LIVE_CHAT_ID) ensureLiveChat().clearedBeforeSequence = conversation.clearedBeforeSequence || 0;
    if (!conversation?.id || conversation.id === LIVE_CHAT_ID || conversation.kind !== "direct") continue;
    const peer = conversation.peer || {};
    const participant = {
      id: peer.id || conversation.id,
      profileId: peer.id,
      name: peer.name || "Локальный контакт",
      handle: peer.handle || "локальный аккаунт",
      bio: peer.bio || "",
      avatarUrl: peer.avatarUrl || "",
      deviceName: "Устройство Маяка"
    };
    const chat = upsertParticipantChat(participant, conversation);
    chat.clearedBeforeSequence = conversation.clearedBeforeSequence || 0;
    chat.messages = chat.messages.filter((message) => !message.sequence || message.sequence > chat.clearedBeforeSequence);
    chat.status = "аккаунт Маяка";
    chat.bio = peer.bio || "Личный диалог с серверной проверкой участников.";
    if (conversation.lastMessage) {
      const mapped = mapServerMessage(conversation.lastMessage);
      chat.preview = `${mapped.direction === "out" ? "Вы: " : ""}${mapped.text}`;
      chat.time = mapped.time;
    } else {
      chat.messages = [];
      chat.preview = realtimeEmptyPreview(chat);
      chat.time = realtime.available ? "online" : "offline";
    }
  }
  save();
  renderChatList();
}

async function openParticipantChat(participantId) {
  const participant = participantById(participantId);
  if (!participant) return showToast("Устройство уже отключилось");
  if (isOwnParticipant(participant)) return showToast("Это ваше устройство");
  if (!realtime.authenticated) {
    openProfileModal({ required: true });
    return showToast("Сначала войдите в аккаунт");
  }

  try {
    const { conversation } = await fetchJson("/api/conversations/direct", {
      method: "POST",
      body: JSON.stringify({ peerUserId: participantPeerId(participant) }),
      timeout: 3000
    });
    const chat = upsertParticipantChat(participant, conversation);
    closeConnectModal();
    openChat(chat.id);
    showToast(`Открыт личный чат: ${participant.name || "локальный контакт"}`);
  } catch (error) {
    showToast(error.message || "Не удалось создать личный чат");
  }
}

function renderParticipants() {
  const participants = realtime.participants || [];
  const deviceCount = realtime.devices || participants.length;
  const clientCount = realtime.clients || 0;
  if (presencePill) {
    presencePill.textContent = `${deviceCount} ${pluralRu(deviceCount, "устройство", "устройства", "устройств")}`;
  }
  if (connectParticipantsCount) {
    connectParticipantsCount.textContent = clientCount
      ? `${clientCount} ${pluralRu(clientCount, "подключение", "подключения", "подключений")} · ${deviceCount} ${pluralRu(deviceCount, "устройство", "устройства", "устройств")}`
      : "Ждём подключение устройств";
  }
  if (!connectParticipants) return;
  if (!participants.length) {
    connectParticipants.innerHTML = '<div class="participant-empty">Когда телефон или второй компьютер откроет эту ссылку, он появится здесь.</div>';
    return;
  }
  connectParticipants.innerHTML = participants.map((participant) => {
    const name = participant.name || "Локальное устройство";
    const device = participant.deviceName || "Устройство Маяка";
    const handle = participant.handle || "локальный профиль";
    const connections = participant.connections > 1 ? ` · ${participant.connections} вкладки` : "";
    const isSelf = isOwnParticipant(participant);
    return `
      <div class="participant-item">
        <span class="participant-avatar">${avatarInnerHtml({ name, avatarUrl: participant.avatarUrl })}</span>
        <span class="participant-copy">
          <strong>${escapeHtml(name)}</strong>
          <p>${escapeHtml(participantLabel(participant))}${escapeHtml(connections)}</p>
        </span>
        <span class="participant-side">
          <span class="participant-status">онлайн</span>
          <button type="button" class="participant-action" data-participant-id="${escapeHtml(participant.id || "")}" ${isSelf ? "disabled" : ""}>${isSelf ? "Это вы" : "Написать"}</button>
        </span>
      </div>
    `;
  }).join("");

  connectParticipants.querySelectorAll("[data-participant-id]").forEach((button) => {
    button.addEventListener("click", () => openParticipantChat(button.dataset.participantId));
  });
}

function updatePresence(data = {}) {
  realtime.clients = Number(data.clients || 0);
  realtime.devices = Number(data.devices || data.participants?.length || realtime.clients || 0);
  realtime.participants = Array.isArray(data.participants) ? data.participants : [];
  renderParticipants();
}

function setLiveStatus(state, title, text) {
  const dot = liveStatus?.querySelector(".live-dot");
  $("#liveStatusTitle").textContent = title;
  $("#liveStatusText").textContent = text;
  dot?.classList.remove("online", "offline", "checking");
  dot?.classList.add(state);

  const chat = ensureLiveChat();
  const onlineDevices = realtime.devices || realtime.clients || 1;
  chat.status = state === "online" ? `онлайн · ${onlineDevices} ${pluralRu(onlineDevices, "устройство", "устройства", "устройств")}` : state === "checking" ? "проверка сервера" : "сервер не подключён";
  if (!chat.messages.length) {
    chat.preview = state === "online" ? "Сервер подключён — можно писать" : "Запустите локальный сервер для живого режима";
    chat.time = state === "online" ? "online" : "offline";
  }
  renderChatList();
  if (activeChatId === LIVE_CHAT_ID) updateHeader();
}

function setConnectCardUnavailable() {
  realtime.connectUrl = "";
  $("#connectUrl").href = "#";
  $("#connectUrl").textContent = "запустите локальный сервер";
  $("#connectQr").removeAttribute("src");
}

function selectConnectUrl() {
  const link = $("#connectUrl");
  const selection = window.getSelection();
  if (!link || !selection) return;
  const range = document.createRange();
  range.selectNodeContents(link);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function loadConnectInfo() {
  try {
    const info = await fetchJson("/api/connect", { timeout: 1800 });
    realtime.connectUrl = info.primaryUrl;
    const connectUrl = $("#connectUrl");
    const connectQr = $("#connectQr");
    connectUrl.href = info.primaryUrl;
    connectUrl.textContent = info.primaryUrl;
    realtime.mode = info.mode || "local";
    const roomTitle = realtime.mode === "cloud" ? "Участники и приглашение" : "Локальная комната";
    $("#connectRoomTitle").textContent = roomTitle;
    $("#connectRoomButton span").textContent = roomTitle;
    $("#connectRoomButton").setAttribute("aria-label", roomTitle);
    $("#connectHint").textContent = info.hint;
    connectQr.src = `${info.qrSvgUrl}${info.qrSvgUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
  } catch {
    setConnectCardUnavailable();
  }
}

async function openConnectModal() {
  connectModal.hidden = false;
  renderParticipants();
  await loadConnectInfo();
  if (!realtime.connectUrl) showToast("Не удалось получить адрес локальной комнаты");
}

function closeConnectModal() {
  connectModal.hidden = true;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto 0";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function formatServerTime(value) {
  return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function mapServerMessage(message) {
  const direction = message.authorId === currentAuthorId() ? "out" : "in";
  return {
    id: message.id,
    sequence: message.sequence,
    serverChatId: message.chatId || LIVE_CHAT_ID,
    direction,
    authorName: message.authorName,
    text: message.text,
    time: formatServerTime(message.createdAt)
  };
}

function chatForServerMessage(serverChatId = LIVE_CHAT_ID, message = null) {
  if (serverChatId === LIVE_CHAT_ID) return ensureLiveChat();

  let chat = chats.find((item) => item.serverChatId === serverChatId || item.id === serverChatId);
  if (chat || !message) return chat;

  const mapped = mapServerMessage(message);
  const name = mapped.direction === "out" ? "Локальный диалог" : (message.authorName || "Локальный контакт");
  chat = {
    id: serverChatId,
    serverChatId,
    realtime: true,
    name,
    initials: makeInitials(name),
    avatar: "logo-avatar",
    status: "локальная сеть",
    handle: message.authorHandle || "direct",
    bio: "Личный чат, созданный автоматически из локального сообщения.",
    preview: "Новое локальное сообщение",
    time: "",
    unread: 0,
    messages: []
  };
  chats = [chat, ...chats];
  return chat;
}

function realtimeEmptyPreview(chat) {
  if (chat.id === LIVE_CHAT_ID) {
    return realtime.available ? "Сервер подключён — можно писать" : "Запустите локальный сервер для живого режима";
  }
  return "Личный чат готов — напишите первое сообщение";
}

function applyServerMessages(serverMessages, { replace = false, chatId = "" } = {}) {
  const fallbackChatId = chatId || serverMessages[0]?.chatId || LIVE_CHAT_ID;
  const touchedChatIds = new Set();

  if (replace) {
    const replacementTargets = new Set(serverMessages.map((message) => message?.chatId || fallbackChatId));
    if (!replacementTargets.size) replacementTargets.add(fallbackChatId);
    replacementTargets.forEach((serverChatId) => {
      const chat = chatForServerMessage(serverChatId);
      if (chat) {
        for (const message of chat.messages) if (message.id) realtime.knownMessageIds.delete(message.id);
        chat.messages = [];
        touchedChatIds.add(chat.id);
      }
    });
  }

  for (const message of serverMessages) {
    if (!message?.id || realtime.knownMessageIds.has(message.id)) continue;
    const serverChatId = message.chatId || fallbackChatId || LIVE_CHAT_ID;
    const chat = chatForServerMessage(serverChatId, message);
    if (!chat) continue;
    if (message.sequence <= (chat.clearedBeforeSequence || 0)) continue;
    realtime.knownMessageIds.add(message.id);
    const mapped = mapServerMessage(message);
    chat.messages.push(mapped);
    chat.preview = `${mapped.direction === "out" ? "Вы: " : ""}${mapped.text}`;
    chat.time = mapped.time;
    if (mapped.direction === "in" && activeChatId !== chat.id) chat.unread += 1;
    touchedChatIds.add(chat.id);
  }

  if (!serverMessages.length && replace) {
    const chat = chatForServerMessage(fallbackChatId);
    if (!chat) return;
    chat.preview = realtimeEmptyPreview(chat);
    chat.time = realtime.available ? "online" : "offline";
    touchedChatIds.add(chat.id);
  }

  save();
  renderChatList();
  if (touchedChatIds.has(activeChatId)) {
    updateHeader();
    renderMessages();
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const waitMs = realtime.mode === "cloud" ? Math.max(options.timeout || 0, 20000) : options.timeout || 5000;
  const timeout = setTimeout(() => controller.abort(), waitMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = payload.code || "request_failed";
      error.retryAfter = Number(response.headers.get("retry-after") || 0);
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadServerChatHistory(chat) {
  const serverChatId = chat?.serverChatId || (chat?.id === LIVE_CHAT_ID ? LIVE_CHAT_ID : "");
  if (!serverChatId || !realtime.available) return;

  try {
    const snapshot = await fetchJson(`/api/messages?chatId=${encodeURIComponent(serverChatId)}`, { timeout: 1600 });
    applyServerMessages(snapshot.messages || [], { replace: true, chatId: serverChatId });
  } catch {
    if (chat.id !== LIVE_CHAT_ID) showToast("Не удалось обновить личный чат");
  }
}

async function sendRealtimeMessage(text, chat = activeChat()) {
  if (realtime.requiresAuth && !realtime.authenticated) {
    openProfileModal({ required: true });
    showToast("Сначала войдите в аккаунт");
    return false;
  }
  if (!profile) {
    openProfileModal({ required: true });
    showToast("Сначала создайте профиль");
    return false;
  }

  if (!realtime.available) {
    showToast("Локальный сервер не подключён");
    return false;
  }

  try {
    const { message } = await fetchJson("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        chatId: chat.serverChatId || chat.id || LIVE_CHAT_ID,
        text
      }),
      timeout: 3500
    });
    applyServerMessages([message]);
    return true;
  } catch (error) {
    if (error.status === 401) {
      handleSessionExpired();
      return false;
    }
    if (error.status && error.status < 500) { showToast(error.message); return false; }
    realtime.available = false;
    realtime.connected = false;
    setLiveStatus("offline", "Сервер потерян", "Сообщение не ушло. Запустите локальный сервер и попробуйте ещё раз.");
    showToast("Не удалось отправить на сервер");
    return false;
  }
}

function connectEventStream() {
  realtime.source?.close();
  if (realtime.requiresAuth && !realtime.authenticated) return;
  const params = new URLSearchParams({ clientId: deviceId });
  const source = new EventSource(`/api/events?${params.toString()}`);
  realtime.source = source;
  let syncing = false;
  let queued = [];
  const applyEvent = (callback, payload) => {
    if (source !== realtime.source) return;
    if (syncing) queued.push(() => callback(payload));
    else callback(payload);
  };

  source.addEventListener("hello", async (event) => {
    if (source !== realtime.source) return;
    const data = JSON.parse(event.data);
    realtime.available = true;
    realtime.connected = true;
    updatePresence(data);
    syncing = true;
    try {
      const { conversations } = await fetchJson("/api/conversations");
      if (source !== realtime.source) return;
      syncServerConversations(conversations || []);
      const targets = [ensureLiveChat()];
      if (activeChat().realtime && activeChatId !== LIVE_CHAT_ID) targets.push(activeChat());
      for (const chat of targets) {
        const chatId = chat.serverChatId || chat.id;
        const history = await fetchJson(`/api/messages?chatId=${encodeURIComponent(chatId)}`);
        if (source !== realtime.source) return;
        applyServerMessages(history.messages || [], { replace: true, chatId });
      }
    } catch (error) {
      if (error.status === 401) { handleSessionExpired(); return; }
      showToast("Связь восстановлена, но историю пока не удалось обновить. Откройте чат ещё раз.");
    } finally {
      syncing = false;
      if (source === realtime.source) queued.forEach((apply) => apply());
      queued = [];
    }
    const onlineDevices = realtime.devices || realtime.clients || 1;
    setLiveStatus("online", "Сервер подключён", `В комнате ${onlineDevices} ${pluralRu(onlineDevices, "устройство", "устройства", "устройств")}. Сообщения идут в реальном времени.`);
  });

  source.addEventListener("snapshot", (event) => {
    if (syncing || source !== realtime.source) return;
    const data = JSON.parse(event.data);
    applyServerMessages(data.messages || [], { replace: true, chatId: LIVE_CHAT_ID });
  });

  source.addEventListener("message", (event) => {
    applyEvent((message) => applyServerMessages([message]), JSON.parse(event.data));
  });

  source.addEventListener("message_deleted", (event) => {
    applyEvent(applyMessageDeleted, JSON.parse(event.data));
  });

  source.addEventListener("chat_cleared", (event) => {
    applyEvent(applyChatCleared, JSON.parse(event.data));
  });

  source.addEventListener("presence", (event) => {
    const data = JSON.parse(event.data);
    updatePresence(data);
    if (realtime.available) {
      const onlineDevices = realtime.devices || realtime.clients || 1;
      setLiveStatus("online", "Сервер подключён", `В комнате ${onlineDevices} ${pluralRu(onlineDevices, "устройство", "устройства", "устройств")}. Сообщения идут в реальном времени.`);
    }
  });

  source.onerror = () => {
    realtime.connected = false;
    if (realtime.available) {
      setLiveStatus("checking", "Переподключаюсь…", "Поток сообщений временно оборвался, браузер пробует восстановить связь.");
    }
    fetchJson("/api/auth/me").catch((error) => {
      if (source === realtime.source && error.status === 401) handleSessionExpired();
    });
  };
}

function clearAccountChatCache() {
  chats = chats.filter((chat) => !chat.realtime || chat.id === LIVE_CHAT_ID);
  const live = ensureLiveChat();
  live.messages = [];
  live.clearedBeforeSequence = 0;
  live.preview = "Войдите, чтобы загрузить историю";
  realtime.knownMessageIds.clear();
  if (!chats.some((chat) => chat.id === activeChatId)) activeChatId = LIVE_CHAT_ID;
  save();
  renderChatList();
  renderMessages();
}

function applyAuthenticatedSession({ user, session }) {
  if (profile?.id !== user.id) clearAccountChatCache();
  const now = new Date().toISOString();
  profile = {
    id: user.id,
    name: user.name,
    handle: user.handle,
    initials: makeInitials(user.name),
    bio: String(user.bio || "").slice(0, 280),
    avatarUrl: String(user.avatarUrl || ""),
    deviceName: session.deviceName || defaultDeviceName(),
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now,
    serverAccount: true
  };
  realtime.authenticated = true;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localStorage.setItem(CLIENT_NAME_KEY, profile.name);
  renderProfileChrome();
  updateHeader();
  renderMessages();
}

function handleSessionExpired() {
  realtime.authenticated = false;
  realtime.connected = false;
  realtime.source?.close();
  setLiveStatus("checking", "Нужно войти в аккаунт", "Сессия устройства завершилась. Войдите снова, чтобы продолжить обмен сообщениями.");
  authMode = "login";
  openProfileModal({ required: true });
}

async function startAuthenticatedRealtime() {
  const { conversations } = await fetchJson("/api/conversations", { timeout: 2200 });
  syncServerConversations(conversations || []);
  const snapshot = await fetchJson(`/api/messages?chatId=${LIVE_CHAT_ID}`, { timeout: 2200 });
  applyServerMessages(snapshot.messages || [], { replace: true, chatId: LIVE_CHAT_ID });
  connectEventStream();
}

async function initRealtime() {
  setLiveStatus("checking", "Подключаюсь к серверу…", "Бесплатный сервер после простоя может запускаться около минуты. Подождите немного.");
  try {
    const health = await fetchJson("/api/health", { timeout: hostedPage ? 75000 : 5000 });
    realtime.available = Boolean(health.ok);
    realtime.requiresAuth = health.auth === "sessions";
    realtime.serverVersion = health.version || "";
    realtime.mode = health.mode || "local";
    $("#serverModeLabel").textContent = `${realtime.mode === "cloud" ? "Интернет-пилот" : "Локальный сервер"} v${realtime.serverVersion}`;
    realtime.inviteRequired = Boolean(health.inviteRequired);
    updatePresence(health);
    await loadConnectInfo();

    if (realtime.requiresAuth) {
      try {
        const auth = await fetchJson("/api/auth/me", { timeout: 1800 });
        applyAuthenticatedSession(auth);
        await startAuthenticatedRealtime();
      } catch (error) {
        if (error.status !== 401) throw error;
        realtime.authenticated = false;
        setLiveStatus("checking", "Сервер готов", "Создайте аккаунт или войдите — после этого откроется живая комната.");
        authMode = profile ? "login" : "register";
        openProfileModal({ required: true });
      }
      return;
    }

    const snapshot = await fetchJson(`/api/messages?chatId=${LIVE_CHAT_ID}`, { timeout: 1600 });
    applyServerMessages(snapshot.messages || [], { replace: true, chatId: LIVE_CHAT_ID });
    connectEventStream();
    if (!profile) openProfileModal({ required: true });
  } catch (error) {
    realtime.available = false;
    realtime.connected = false;
    if (hostedPage) {
      realtime.requiresAuth = true;
      setLiveStatus("offline", "Не удалось подключиться", "Проверьте интернет. Сервер может запускаться после простоя; попробуем снова через 15 секунд.");
      setTimeout(initRealtime, 15000);
      return;
    }
    realtime.requiresAuth = false;
    setConnectCardUnavailable();
    setLiveStatus("offline", "Живой сервер не запущен", "Запустите ./script/run_local_chat.sh и откройте http://127.0.0.1:4173.");
    if (!profile) openProfileModal({ required: true });
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("mayak-theme", theme);
}

function setSection(section) {
  activeSection = section;
  document.querySelectorAll("[data-section-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.sectionPanel === section);
  });
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === section);
  });
  const chatsOnly = section === "chats";
  $(".filter-row").hidden = !chatsOnly;
  $("#prototypeCard").hidden = !chatsOnly;
  searchInput.placeholder = section === "calls" ? "Поиск звонков" : section === "contacts" ? "Поиск людей" : "Поиск";
  if (section === "chats") renderChatList();
}

function makeInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "??";
  return words.slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase("ru");
}

function shortDeviceId() {
  return deviceId.replace(/^device-/, "").slice(0, 18);
}

function clearAvatarDraft() {
  if (pendingAvatarPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(pendingAvatarPreviewUrl);
  pendingAvatarBlob = null;
  pendingAvatarPreviewUrl = "";
  pendingAvatarRemoval = false;
  profileAvatarInput.value = "";
}

function profilePreviewAvatarUrl() {
  if (pendingAvatarRemoval) return "";
  return pendingAvatarPreviewUrl || profile?.avatarUrl || "";
}

function updateBioCount() {
  $("#profileBioCount").textContent = profileBioInput.value.length;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать изображение"));
    };
    image.src = url;
  });
}

async function resizeAvatar(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error("Выберите JPEG, PNG или WebP");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("Исходное фото должно быть меньше 10 МБ");

  let source;
  let release = () => {};
  if (globalThis.createImageBitmap) {
    source = await createImageBitmap(file);
    release = () => source.close();
  } else {
    const loaded = await fileToImage(file);
    source = loaded.image;
    release = () => URL.revokeObjectURL(loaded.url);
  }

  try {
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    const side = Math.min(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    context.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, 256, 256);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
    if (!blob) throw new Error("Не удалось подготовить изображение");
    return blob;
  } finally {
    release();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось сохранить изображение"));
    reader.readAsDataURL(blob);
  });
}

async function saveServerAvatarDraft() {
  if (!pendingAvatarBlob && !pendingAvatarRemoval) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("/api/auth/avatar", {
      method: pendingAvatarRemoval ? "DELETE" : "PUT",
      headers: pendingAvatarBlob ? { "content-type": pendingAvatarBlob.type || "image/webp" } : {},
      body: pendingAvatarBlob || undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function updateProfilePreview() {
  const loginOnly = realtime.requiresAuth && !realtime.authenticated && authMode === "login";
  const name = loginOnly
    ? (profile?.name || "Вход в Маяк")
    : (profileNameInput.value.trim() || "Аккаунт Маяка");
  const handle = normalizeHandle(profileHandleInput.value, name);
  const deviceName = profileDeviceNameInput.value.trim() || defaultDeviceName();
  setAvatar($("#profilePreviewAvatar"), { name, avatarUrl: profilePreviewAvatarUrl() });
  $("#profilePreviewName").textContent = name;
  $("#profilePreviewMeta").textContent = `${handle} · ${deviceName}`;
  profileAvatarRemove.hidden = !profilePreviewAvatarUrl();
  updateBioCount();
}

function renderProfileChrome() {
  const name = currentAuthorName();
  const initials = makeInitials(name);
  const label = realtime.authenticated
    ? `${profile.name} ${profile.handle}`
    : profile
      ? `${profile.name} · требуется вход`
      : "Создать аккаунт";
  profileButtons.forEach((button) => {
    setAvatar(button, { name, initials, avatarUrl: profile?.avatarUrl || "" });
    button.title = label;
    button.setAttribute("aria-label", label);
  });
}

function showProfileError(message = "") {
  const error = $("#profileError");
  error.textContent = message;
  error.hidden = !message;
}

function fillProfileForm({ required = false, preserveValues = false } = {}) {
  const serverAuth = realtime.requiresAuth;
  const editingAccount = serverAuth && realtime.authenticated;
  const loginOnly = serverAuth && !editingAccount && authMode === "login";
  profileHandleTouched = Boolean(profile?.handle);
  profileModal.dataset.required = required ? "true" : "false";
  $("#authTabs").hidden = !serverAuth || editingAccount;
  $("#profileNameField").hidden = loginOnly;
  $("#profileCustomizationFields").hidden = loginOnly;
  $("#profilePasswordField").hidden = !serverAuth || editingAccount;
  $("#profileInviteField").hidden = !serverAuth || editingAccount || loginOnly || !realtime.inviteRequired;
  profilePasswordInput.required = serverAuth && !editingAccount;
  profilePasswordInput.autocomplete = loginOnly ? "current-password" : "new-password";
  profileHandleInput.disabled = editingAccount;
  profileLogoutButton.hidden = !editingAccount;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === authMode);
  });

  if (!preserveValues) {
    clearAvatarDraft();
    profileNameInput.value = profile?.name || defaultProfileName();
    profileHandleInput.value = profile?.handle || normalizeHandle("", profileNameInput.value);
    profilePasswordInput.value = "";
    profileBioInput.value = profile?.bio || "";
    profileDeviceNameInput.value = profile?.deviceName || defaultDeviceName();
  }

  if (editingAccount) {
    $("#profileEyebrow").textContent = "Аккаунт v0.9";
    $("#profileTitle").textContent = "Ваш профиль";
    $("#profileSubmitButton").innerHTML = '<svg><use href="#i-lock"/></svg>Сохранить';
    $("#profileNote").textContent = "Имя хранится на сервере, а это устройство использует отдельную защищённую сессию.";
  } else if (serverAuth && loginOnly) {
    $("#profileEyebrow").textContent = "С возвращением";
    $("#profileTitle").textContent = "Войти в Маяк";
    $("#profileSubmitButton").innerHTML = '<svg><use href="#i-lock"/></svg>Войти';
    $("#profileNote").textContent = "Введите тот же username и пароль. Для этого устройства будет создана отдельная сессия.";
  } else if (serverAuth) {
    $("#profileEyebrow").textContent = "Первый аккаунт";
    $("#profileTitle").textContent = "Создать аккаунт";
    $("#profileSubmitButton").innerHTML = '<svg><use href="#i-lock"/></svg>Зарегистрироваться';
    $("#profileNote").textContent = "Пароль сохраняется на сервере только как scrypt-хеш. Минимальная длина — 8 символов.";
  } else {
    $("#profileEyebrow").textContent = profile ? "Локальный профиль" : "Демо-режим";
    $("#profileTitle").textContent = profile ? "Ваш профиль" : "Создать локальный профиль";
    $("#profileSubmitButton").innerHTML = profile
      ? '<svg><use href="#i-lock"/></svg>Сохранить'
      : '<svg><use href="#i-lock"/></svg>Создать профиль';
    $("#profileNote").textContent = "Сервер не запущен, поэтому профиль сохранится только в этом браузере.";
  }

  showProfileError();
  $("#profileDeviceId").textContent = shortDeviceId();
  updateProfilePreview();
}

function openProfileModal({ required = false } = {}) {
  const authRequired = realtime.requiresAuth && !realtime.authenticated;
  fillProfileForm({ required: required || authRequired || !profile });
  profileModal.hidden = false;
  requestAnimationFrame(() => {
    const loginOnly = realtime.requiresAuth && !realtime.authenticated && authMode === "login";
    (loginOnly ? profileHandleInput : profileNameInput).focus();
  });
}

function closeProfileModal() {
  const missingIdentity = realtime.requiresAuth ? !realtime.authenticated : !profile;
  if (profileModal.dataset.required === "true" && missingIdentity) return;
  profileModal.hidden = true;
}

async function saveProfileFromForm() {
  if (hostedPage && !realtime.available) { showProfileError("Подождите подключения к серверу и повторите попытку"); return false; }
  const name = profileNameInput.value.trim().replace(/\s+/g, " ").slice(0, 60);
  const bio = profileBioInput.value.trim().slice(0, 280);
  const serverAuth = realtime.available && realtime.requiresAuth;
  const editingAccount = serverAuth && realtime.authenticated;
  const loginOnly = serverAuth && !editingAccount && authMode === "login";
  if (!loginOnly && name.length < 2) {
    showToast("Введите имя профиля");
    profileNameInput.focus();
    return false;
  }

  if (serverAuth) {
    const handle = normalizeHandle(profileHandleInput.value, name);
    const password = profilePasswordInput.value;
    const deviceName = (profileDeviceNameInput.value.trim() || defaultDeviceName()).slice(0, 60);
    if (!editingAccount && password.length < 8) {
      showProfileError("Пароль должен содержать не менее 8 символов");
      profilePasswordInput.focus();
      return false;
    }

    const submitButton = $("#profileSubmitButton");
    submitButton.disabled = true;
    showProfileError();
    try {
      const endpoint = editingAccount
        ? "/api/auth/me"
        : loginOnly
          ? "/api/auth/login"
          : "/api/auth/register";
      const payload = editingAccount
        ? { name, bio, deviceName }
        : loginOnly
          ? { handle, password, deviceId, deviceName }
          : { name, handle, password, bio, deviceId, deviceName, inviteCode: $("#profileInvite").value.trim() };
      const auth = await fetchJson(endpoint, {
        method: editingAccount ? "PATCH" : "POST",
        body: JSON.stringify(payload),
        timeout: 7000
      });
      applyAuthenticatedSession(auth);
      $("#profileInvite").value = "";
      profilePasswordInput.value = "";
      if (!loginOnly) {
        const avatarResult = await saveServerAvatarDraft();
        if (avatarResult?.user) applyAuthenticatedSession({ user: avatarResult.user, session: auth.session });
      }
      clearAvatarDraft();
      profileModal.hidden = true;
      if (!editingAccount) await startAuthenticatedRealtime();
      else connectEventStream();
      showToast(editingAccount ? "Профиль сохранён" : loginOnly ? "Вход выполнен" : "Аккаунт создан");
      return true;
    } catch (error) {
      if (realtime.authenticated) fillProfileForm({ preserveValues: true });
      showProfileError(error.message || "Не удалось сохранить аккаунт");
      return false;
    } finally {
      submitButton.disabled = false;
    }
  }

  const now = new Date().toISOString();
  const avatarUrl = pendingAvatarRemoval
    ? ""
    : pendingAvatarBlob
      ? await blobToDataUrl(pendingAvatarBlob)
      : profile?.avatarUrl || "";
  profile = {
    id: profile?.id || makeId("profile"),
    name,
    handle: normalizeHandle(profileHandleInput.value, name),
    initials: makeInitials(name),
    bio,
    avatarUrl,
    deviceName: (profileDeviceNameInput.value.trim() || defaultDeviceName()).slice(0, 60),
    createdAt: profile?.createdAt || now,
    updatedAt: now
  };

  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localStorage.setItem(CLIENT_NAME_KEY, profile.name);
  renderProfileChrome();
  updateHeader();
  renderMessages();
  if (realtime.available) connectEventStream();
  clearAvatarDraft();
  profileModal.hidden = true;
  showToast("Профиль сохранён");
  return true;
}

async function logoutAccount() {
  try {
    await fetchJson("/api/auth/logout", { method: "POST", body: "{}", timeout: 2500 });
  } catch { showToast("Не удалось завершить сессию на сервере. Проверьте связь и повторите выход."); return; }
  realtime.source?.close();
  realtime.connected = false;
  realtime.authenticated = false;
  profile = null;
  clearAccountChatCache();
  localStorage.removeItem(PROFILE_KEY);
  renderProfileChrome();
  authMode = "login";
  profileModal.hidden = true;
  setLiveStatus("checking", "Вы вышли из аккаунта", "Войдите снова, чтобы получать и отправлять сообщения.");
  openProfileModal({ required: true });
}

function openNewChatModal() {
  newChatModal.hidden = false;
  $("#newChatName").focus();
}

function closeNewChatModal() {
  newChatModal.hidden = true;
  newChatForm.reset();
}

function createLocalChat({ name, handle, message }) {
  const cleanName = name.trim() || "Новый контакт";
  const cleanHandle = handle.trim() || `@${cleanName.toLocaleLowerCase("ru").replaceAll(" ", "_")}`;
  const cleanMessage = message.trim() || "Привет! Это локальный демо-чат.";
  const time = currentTime();
  const chat = {
    id: `local-${Date.now()}`,
    name: cleanName,
    initials: makeInitials(cleanName),
    avatar: ["green", "blue", "pink", "orange", "purple"][Math.floor(Math.random() * 5)],
    status: "локальный контакт",
    handle: cleanHandle,
    bio: "Создано прямо в localhost-прототипе. После backend такие чаты будут храниться на сервере.",
    preview: cleanMessage,
    time,
    unread: 0,
    messages: [{ direction: "out", text: cleanMessage, time }]
  };
  chats = [chat, ...chats];
  activeChatId = chat.id;
  save();
  closeNewChatModal();
  openChat(chat.id);
  showToast("Локальный чат создан");
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveOfflineKey(secret, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 180000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptOfflinePayload(payload, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveOfflineKey(secret, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  return {
    type: "mayak.offline.packet",
    version: 1,
    createdAt: new Date().toISOString(),
    hint: {
      to: payload.to,
      relay: "Можно передавать через посредников: содержимое зашифровано.",
      ttl: "7d"
    },
    crypto: {
      kdf: "PBKDF2-SHA256",
      cipher: "AES-256-GCM",
      iterations: 180000,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext)
    }
  };
}

async function decryptOfflinePacket(packet, secret) {
  if (!packet || packet.type !== "mayak.offline.packet" || packet.version !== 1) {
    throw new Error("bad packet");
  }
  const salt = base64ToBytes(packet.crypto.salt);
  const iv = base64ToBytes(packet.crypto.iv);
  const ciphertext = base64ToBytes(packet.crypto.ciphertext);
  const key = await deriveOfflineKey(secret, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function openOfflineModal() {
  offlineModal.hidden = false;
  $("#offlineTo").value ||= activeChat().handle || activeChat().name;
  $("#offlineMessage").value ||= messageInput.value.trim();
  $("#offlineTo").focus();
}

function closeOfflineModal() {
  offlineModal.hidden = true;
}

function addImportedPacketToChat(payload) {
  const name = payload.fromName || "Офлайн доставка";
  const existing = chats.find((chat) => chat.id === "offline-relay");
  const chat = existing || {
    id: "offline-relay",
    name: "Офлайн доставка",
    initials: "OD",
    avatar: "logo-avatar",
    status: "store & forward",
    handle: "encrypted-packets",
    bio: "Сюда попадают расшифрованные сообщения, принесённые офлайн-пакетами.",
    preview: "",
    time: "",
    unread: 0,
    verified: true,
    messages: []
  };
  const time = currentTime();
  chat.messages.push({
    direction: "in",
    text: `${name} → ${payload.to}\n${payload.text}`,
    time
  });
  chat.preview = `Пакет: ${payload.text}`;
  chat.time = time;
  if (!existing) chats = [chat, ...chats];
  activeChatId = chat.id;
  save();
  openChat(chat.id);
}

$("#composer").addEventListener("submit", async (event) => {
  event.preventDefault();
  const sent = await sendMessage(messageInput.value);
  if (sent) {
    messageInput.value = "";
    resizeComposer();
  }
});

messageInput.addEventListener("input", resizeComposer);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("#composer").requestSubmit();
  }
});

searchInput.addEventListener("input", renderChatList);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    renderChatList();
  });
});

document.querySelectorAll(".theme-toggle").forEach((button) => {
  button.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
});

profileButtons.forEach((button) => {
  button.addEventListener("click", () => openProfileModal({ required: false }));
});

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    authMode = button.dataset.authMode;
    fillProfileForm({ required: true, preserveValues: true });
  });
});

profileNameInput.addEventListener("input", () => {
  if (!profileHandleTouched) profileHandleInput.value = normalizeHandle("", profileNameInput.value);
  updateProfilePreview();
});

profileHandleInput.addEventListener("input", () => {
  profileHandleTouched = true;
  profileHandleInput.value = normalizeHandle(profileHandleInput.value, profileNameInput.value);
  updateProfilePreview();
});

profileDeviceNameInput.addEventListener("input", updateProfilePreview);
profileBioInput.addEventListener("input", updateBioCount);

profileAvatarChoose.addEventListener("click", () => {
  profileAvatarInput.value = "";
  profileAvatarInput.click();
});

profileAvatarInput.addEventListener("change", async () => {
  const [file] = profileAvatarInput.files || [];
  if (!file) return;
  profileAvatarChoose.disabled = true;
  showProfileError();
  try {
    const resized = await resizeAvatar(file);
    if (pendingAvatarPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(pendingAvatarPreviewUrl);
    pendingAvatarBlob = resized;
    pendingAvatarPreviewUrl = URL.createObjectURL(resized);
    pendingAvatarRemoval = false;
    updateProfilePreview();
  } catch (error) {
    showProfileError(error.message || "Не удалось подготовить изображение");
  } finally {
    profileAvatarChoose.disabled = false;
  }
});

profileAvatarRemove.addEventListener("click", () => {
  if (pendingAvatarPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(pendingAvatarPreviewUrl);
  pendingAvatarBlob = null;
  pendingAvatarPreviewUrl = "";
  pendingAvatarRemoval = Boolean(profile?.avatarUrl);
  profileAvatarInput.value = "";
  updateProfilePreview();
});

document.querySelectorAll("[data-profile-close]").forEach((button) => {
  button.addEventListener("click", closeProfileModal);
});

profileModal.addEventListener("click", (event) => {
  if (event.target === profileModal) closeProfileModal();
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveProfileFromForm();
});

profileLogoutButton.addEventListener("click", () => void logoutAccount());

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => setSection(button.dataset.section));
});

$(".back-button").addEventListener("click", closeConversationPanel);
$(".compose-button").addEventListener("click", openNewChatModal);
$(".attach-button").addEventListener("click", () => showToast("Фото, видео и файлы добавим на следующем этапе"));
$(".emoji-button").addEventListener("click", () => {
  messageInput.value += ["🙂", "✨", "👍", "🔥"][Math.floor(Math.random() * 4)];
  messageInput.focus();
  resizeComposer();
});
chatActionsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleChatActions();
});
clearChatButton.addEventListener("click", confirmChatClear);
deleteMessageButton.addEventListener("click", () => {
  const target = pendingMessageTarget;
  closeMessageActions();
  if (target) confirmMessageDeletion(target);
});
$("#confirmCancelButton").addEventListener("click", closeConfirmModal);
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) closeConfirmModal();
});
confirmForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = pendingConfirmAction;
  if (!action) return;
  confirmActionButton.disabled = true;
  try {
    await action();
    closeConfirmModal();
  } catch (error) {
    confirmActionButton.disabled = false;
    showToast(error.message || "Не удалось выполнить действие");
  }
});
document.addEventListener("click", (event) => {
  if (!chatActionsMenu.hidden && !event.target.closest(".chat-actions-wrap")) closeChatActions();
  if (!messageActionsMenu.hidden && !event.target.closest("#messageActionsMenu") && !event.target.closest("[data-message-action]")) {
    closeMessageActions();
  }
});
document.querySelectorAll(".header-actions .icon-button:not(#chatActionsButton), .profile-actions button").forEach((button) => {
  button.addEventListener("click", () => showToast("Этот раздел скоро появится"));
});
document.querySelectorAll("[data-demo-toast]").forEach((button) => {
  button.addEventListener("click", () => showToast(button.dataset.demoToast));
});
document.querySelectorAll("[data-open-chat]").forEach((button) => {
  button.addEventListener("click", () => openChat(button.dataset.openChat));
});
connectRoomButton.addEventListener("click", openConnectModal);
$("#copyConnectUrl").addEventListener("click", async () => {
  if (!realtime.connectUrl) return showToast("Сначала запустите локальный сервер");
  const copied = await copyText(realtime.connectUrl);
  if (!copied) selectConnectUrl();
  showToast(copied ? "Ссылка для телефона скопирована" : "Ссылка выделена — скопируйте вручную");
});
$("#refreshConnectInfo").addEventListener("click", async () => {
  await loadConnectInfo();
  showToast(realtime.connectUrl ? "QR обновлён" : "Не удалось получить адрес");
});
document.querySelectorAll("[data-connect-close]").forEach((button) => {
  button.addEventListener("click", closeConnectModal);
});
connectModal.addEventListener("click", (event) => {
  if (event.target === connectModal) closeConnectModal();
});
document.querySelectorAll("[data-modal-close]").forEach((button) => {
  button.addEventListener("click", closeNewChatModal);
});
newChatModal.addEventListener("click", (event) => {
  if (event.target === newChatModal) closeNewChatModal();
});
newChatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createLocalChat({
    name: $("#newChatName").value,
    handle: $("#newChatHandle").value,
    message: $("#newChatMessage").value
  });
});
$("#emergencyButton").addEventListener("click", openOfflineModal);
document.querySelectorAll("[data-offline-close]").forEach((button) => {
  button.addEventListener("click", closeOfflineModal);
});
offlineModal.addEventListener("click", (event) => {
  if (event.target === offlineModal) closeOfflineModal();
});
offlinePacketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const to = $("#offlineTo").value.trim();
  const secret = $("#offlineKey").value.trim();
  const text = $("#offlineMessage").value.trim();
  if (!to || !secret || !text) return showToast("Заполните получателя, ключ и сообщение");
  if (!crypto.subtle) return showToast("В этом браузере недоступна Web Crypto");
  const packet = await encryptOfflinePayload({
    id: `msg-${Date.now()}`,
    fromName: currentAuthorName(),
    to,
    text,
    createdAt: new Date().toISOString(),
    hops: []
  }, secret);
  $("#offlinePacketOutput").value = JSON.stringify(packet, null, 2);
  showToast("Пакет зашифрован");
});
$("#copyPacketButton").addEventListener("click", async () => {
  const packet = $("#offlinePacketOutput").value.trim();
  if (!packet) return showToast("Сначала соберите пакет");
  await navigator.clipboard.writeText(packet);
  showToast("Пакет скопирован");
});
$("#importPacketButton").addEventListener("click", async () => {
  const raw = $("#incomingPacket").value.trim();
  const secret = $("#incomingKey").value.trim();
  if (!raw || !secret) return showToast("Вставьте пакет и ключ комнаты");
  try {
    const payload = await decryptOfflinePacket(JSON.parse(raw), secret);
    addImportedPacketToChat(payload);
    closeOfflineModal();
    showToast("Пакет принят");
  } catch {
    showToast("Не удалось расшифровать: неверный пакет или ключ");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !newChatModal.hidden) closeNewChatModal();
  if (event.key === "Escape" && !offlineModal.hidden) closeOfflineModal();
  if (event.key === "Escape" && !connectModal.hidden) closeConnectModal();
  if (event.key === "Escape" && !profileModal.hidden) closeProfileModal();
  if (event.key === "Escape" && !confirmModal.hidden) closeConfirmModal();
  if (event.key === "Escape") {
    closeChatActions();
    closeMessageActions();
  }
});

window.addEventListener("popstate", (event) => {
  if (!isMobileLayout()) return;
  if (event.state?.mayakChatOpen) {
    const chat = chats.find((item) => item.id === event.state.chatId);
    if (chat) activeChatId = chat.id;
    setSection("chats");
    renderActiveChat();
    appShell.classList.add("chat-open");
    return;
  }
  appShell.classList.remove("chat-open");
});

const preferredTheme = localStorage.getItem("mayak-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
setTheme(preferredTheme);
setSection(activeSection);
renderProfileChrome();
renderChatList();
updateHeader();
renderMessages();
initRealtime();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
