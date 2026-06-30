# Mayak local realtime server

Первый локальный сервер для проверки живого обмена сообщениями.

## Запуск

```sh
./script/run_local_chat.sh
```

Откройте `http://127.0.0.1:4173` в двух окнах и используйте диалог «Живой чат».

## API

- `GET /api/health` — состояние сервера;
- `GET /api/messages?chatId=live` — история сообщений;
- `POST /api/messages` — отправка сообщения;
- `GET /api/events` — поток событий для открытых клиентов.

История хранится локально в `server/.data/messages.json` и не попадает в Git.
