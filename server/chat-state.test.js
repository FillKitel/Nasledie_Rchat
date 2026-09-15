const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanChats } = require('../app/chat-state');

test('fresh and invalid chat state starts with empty saved notes, no fictional accounts', () => {
  for (const input of [null, [], {}, 'invalid']) {
    const chats = cleanChats(input);
    assert.deepEqual(chats.map((chat) => chat.id), ['saved']);
    assert.deepEqual(chats[0].messages, []);
    assert.equal(chats[0].unread, 0);
  }
});

test('migration removes old demo contacts and seed notes but keeps real chats and user notes', () => {
  const note = { direction: 'out', text: 'Моя заметка', time: '12:00' };
  const repeatedLink = { direction: 'out', text: 'https://webrtc.org/getting-started/', time: '15:00' };
  const live = { id: 'live', realtime: true, messages: [{ id: 'server-message', text: 'Привет' }] };
  const direct = { id: 'direct-real-user', realtime: true, messages: [] };
  const local = { id: 'local-user-note', messages: [note] };
  const input = [
    ...['marina', 'team', 'alex', 'lena', 'nikita'].map((id) => ({ id, messages: [] })),
    live, direct, local,
    { id: 'saved', messages: [
      { direction: 'out', text: 'Идея: быстрые голосовые комнаты для маленьких команд.', time: '09:20' },
      { direction: 'out', text: 'https://webrtc.org/getting-started/', time: '09:22' },
      note, repeatedLink
    ] }
  ];
  const before = JSON.stringify(input);
  const result = cleanChats(input);
  assert.deepEqual(result.map((chat) => chat.id), ['live', 'direct-real-user', 'local-user-note', 'saved']);
  assert.deepEqual(result.at(-1).messages, [note, repeatedLink]);
  assert.deepEqual(cleanChats(result), result, 'migration must be idempotent');
  assert.equal(JSON.stringify(input), before, 'do not mutate original input');
  assert.equal(result[0], live);
  assert.equal(result[1], direct);
});
