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
const stored = localStorage.getItem(STORAGE_KEY);
let chats;

try {
  chats = stored ? JSON.parse(stored) : clone(seedChats);
  if (!Array.isArray(chats) || !chats.length) throw new Error("invalid state");
} catch {
  chats = clone(seedChats);
}

let activeChatId = chats[0].id;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    const matchesSearch = `${chat.name} ${chat.preview}`.toLocaleLowerCase("ru").includes(query);
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
      <span class="avatar ${chat.avatar}">${escapeHtml(chat.initials)}</span>
      <span class="chat-copy">
        <strong>${escapeHtml(chat.name)} ${chat.verified ? '<span class="verified">✓</span>' : ""}</strong>
        <p>${chat.preview.startsWith("Вы:") ? `<span class="you">Вы:</span>${escapeHtml(chat.preview.slice(3))}` : escapeHtml(chat.preview)}</p>
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
  messages.innerHTML = `
    <div class="day-divider">Сегодня</div>
    ${chat.messages.map((message, index) => {
      const previous = chat.messages[index - 1];
      const grouped = previous && previous.direction === message.direction;
      return `
        <div class="message ${message.direction} ${grouped ? "grouped" : ""}">
          <div class="bubble">${escapeHtml(message.text).replaceAll("\n", "<br>")}<span class="message-time">${escapeHtml(message.time)}${message.direction === "out" ? '<span class="checks">✓✓</span>' : ""}</span></div>
          ${message.reaction ? `<button class="reaction" aria-label="Реакция ${escapeHtml(message.reaction)}">${escapeHtml(message.reaction)} <small>${message.reactionCount || 1}</small></button>` : ""}
        </div>
      `;
    }).join("")}
  `;

  messages.querySelectorAll(".reaction").forEach((button) => {
    button.addEventListener("click", () => {
      const count = button.querySelector("small");
      count.textContent = Number(count.textContent) + 1;
      showToast("Реакция добавлена");
    });
  });

  requestAnimationFrame(() => { messageArea.scrollTop = messageArea.scrollHeight; });
}

function updateHeader() {
  const chat = activeChat();
  $("#headerAvatar").textContent = chat.initials;
  $("#headerAvatar").className = `avatar ${chat.avatar}`;
  $("#headerName").textContent = chat.name;
  $("#headerStatus").textContent = chat.status;
  $("#detailsAvatar").textContent = chat.initials;
  $("#detailsAvatar").className = `avatar profile-avatar ${chat.avatar}`;
  $("#detailsName").textContent = chat.name;
  $("#detailsHandle").textContent = chat.handle;
  $("#detailsBio").textContent = chat.bio;
  const headerOnlineDot = $(".person-heading .online-dot");
  if (headerOnlineDot) headerOnlineDot.style.display = chat.status === "в сети" ? "block" : "none";
}

function openChat(id) {
  const chat = chats.find((item) => item.id === id);
  if (!chat) return;
  activeChatId = id;
  activeSection = "chats";
  chat.unread = 0;
  save();
  setSection("chats");
  renderChatList();
  updateHeader();
  renderMessages();
  appShell.classList.add("chat-open");
  if (window.innerWidth > 820) messageInput.focus();
}

function currentTime() {
  return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function sendMessage(text) {
  const chat = activeChat();
  const cleanText = text.trim();
  if (!cleanText) return;
  const time = currentTime();
  chat.messages.push({ direction: "out", text: cleanText, time });
  chat.preview = `Вы: ${cleanText}`;
  chat.time = time;
  chats = [chat, ...chats.filter((item) => item.id !== chat.id)];
  save();
  renderChatList();
  renderMessages();
  simulateReply(chat.id);
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

$("#composer").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(messageInput.value);
  messageInput.value = "";
  resizeComposer();
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

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => setSection(button.dataset.section));
});

$(".back-button").addEventListener("click", () => appShell.classList.remove("chat-open"));
$(".compose-button").addEventListener("click", openNewChatModal);
$(".attach-button").addEventListener("click", () => showToast("Фото, видео и файлы добавим на следующем этапе"));
$(".emoji-button").addEventListener("click", () => {
  messageInput.value += ["🙂", "✨", "👍", "🔥"][Math.floor(Math.random() * 4)];
  messageInput.focus();
  resizeComposer();
});
document.querySelectorAll(".header-actions .icon-button, .profile-actions button").forEach((button) => {
  button.addEventListener("click", () => showToast("Этот раздел скоро появится"));
});
document.querySelectorAll("[data-demo-toast]").forEach((button) => {
  button.addEventListener("click", () => showToast(button.dataset.demoToast));
});
document.querySelectorAll("[data-open-chat]").forEach((button) => {
  button.addEventListener("click", () => openChat(button.dataset.openChat));
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
    fromName: "Локальное устройство",
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
});

const preferredTheme = localStorage.getItem("mayak-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
setTheme(preferredTheme);
setSection(activeSection);
renderChatList();
updateHeader();
renderMessages();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
