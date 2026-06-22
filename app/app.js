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
const stored = localStorage.getItem("mayak-chats-v1");
let chats;

try {
  chats = stored ? JSON.parse(stored) : clone(seedChats);
  if (!Array.isArray(chats) || !chats.length) throw new Error("invalid state");
} catch {
  chats = clone(seedChats);
}

let activeChatId = chats[0].id;
let activeFilter = "all";
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function save() {
  localStorage.setItem("mayak-chats-v1", JSON.stringify(chats));
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
  $(".online-dot").style.display = chat.status === "в сети" ? "block" : "none";
}

function openChat(id) {
  const chat = chats.find((item) => item.id === id);
  if (!chat) return;
  activeChatId = id;
  chat.unread = 0;
  save();
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

$(".back-button").addEventListener("click", () => appShell.classList.remove("chat-open"));
$(".compose-button").addEventListener("click", () => showToast("Создание диалога — следующий экран"));
$(".attach-button").addEventListener("click", () => showToast("Фото, видео и файлы добавим на следующем этапе"));
$(".emoji-button").addEventListener("click", () => {
  messageInput.value += ["🙂", "✨", "👍", "🔥"][Math.floor(Math.random() * 4)];
  messageInput.focus();
  resizeComposer();
});
document.querySelectorAll(".header-actions .icon-button, .profile-actions button, .rail-actions .rail-button:not(.active)").forEach((button) => {
  button.addEventListener("click", () => showToast("Этот раздел скоро появится"));
});

const preferredTheme = localStorage.getItem("mayak-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
setTheme(preferredTheme);
renderChatList();
updateHeader();
renderMessages();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
