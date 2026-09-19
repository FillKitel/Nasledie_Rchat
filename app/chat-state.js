(function (root) {
  const demoIds = new Set(['marina', 'team', 'alex', 'lena', 'nikita']);
  const demoNotes = new Map([
    ['Идея: быстрые голосовые комнаты для маленьких команд.', '09:20'],
    ['https://webrtc.org/getting-started/', '09:22']
  ]);

  function savedChat(messages = []) {
    const last = messages.at(-1);
    return {
      id: 'saved', name: 'Сохранённые', initials: '★', avatar: 'logo-avatar',
      status: 'на этом устройстве', handle: 'Личные заметки',
      bio: 'Заметки и ссылки хранятся в этом браузере. Синхронизации между устройствами пока нет.',
      preview: last ? `Вы: ${last.text}` : 'Заметки и ссылки для себя',
      time: last?.time || '', unread: 0, messages
    };
  }

  function cleanChats(value) {
    const source = Array.isArray(value) ? value : [];
    const saved = source.find((chat) => chat?.id === 'saved');
    const notes = (Array.isArray(saved?.messages) ? saved.messages : []).filter((message) =>
      message && !(message.direction === 'out' && !message.id && demoNotes.get(message.text) === message.time)
    );
    const rest = source.filter((chat) => chat && typeof chat.id === 'string' &&
      chat.id !== 'saved' && (!demoIds.has(chat.id) || chat.realtime) && Array.isArray(chat.messages));
    return [...rest, savedChat(notes)];
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { cleanChats, savedChat };
  else root.MayakChatState = { cleanChats, savedChat };
})(globalThis);
