import '../models/conversation.dart';
import '../models/message.dart';

DateTime _today(int hour, int minute) {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day, hour, minute);
}

List<Conversation> createDemoConversations() => [
      Conversation(
        id: 'marina',
        title: 'Марина Котова',
        initials: 'МК',
        status: 'в сети',
        handle: '@marina',
        bio: 'Дизайнер. Люблю хорошую типографику и плохие шутки.',
        colorValue: 0xFFEB8A72,
        unreadCount: 2,
        messages: [
          ChatMessage(
            id: 'm1',
            text: 'Привет! Посмотрела наброски нового экрана.',
            sentAt: _today(12, 35),
            direction: MessageDirection.incoming,
          ),
          ChatMessage(
            id: 'm2',
            text: 'Второй вариант спокойнее и на телефоне читается лучше.',
            sentAt: _today(12, 36),
            direction: MessageDirection.incoming,
          ),
          ChatMessage(
            id: 'm3',
            text: 'Согласен. Ещё проверю отступы и тёмную тему.',
            sentAt: _today(12, 39),
            direction: MessageDirection.outgoing,
          ),
          ChatMessage(
            id: 'm4',
            text: 'Тогда берём второй вариант ✨',
            sentAt: _today(12, 42),
            direction: MessageDirection.incoming,
            reaction: '👍 2',
          ),
        ],
      ),
      Conversation(
        id: 'product',
        title: 'Команда продукта',
        initials: 'КП',
        status: '5 участников',
        handle: 'Закрытая группа',
        bio: 'Продукт, дизайн и ближайшие релизы.',
        colorValue: 0xFF8875E1,
        unreadCount: 5,
        isGroup: true,
        messages: [
          ChatMessage(
            id: 'p1',
            text: 'Доброе утро! Собрал вопросы к первому прототипу.',
            sentAt: _today(10, 2),
            direction: MessageDirection.incoming,
          ),
          ChatMessage(
            id: 'p2',
            text: 'Отлично, давайте пройдёмся по ним на созвоне.',
            sentAt: _today(10, 11),
            direction: MessageDirection.outgoing,
          ),
          ChatMessage(
            id: 'p3',
            text: 'Илья: созвон перенесли на 16:00',
            sentAt: _today(11, 18),
            direction: MessageDirection.incoming,
          ),
        ],
      ),
      Conversation(
        id: 'alex',
        title: 'Алексей Романов',
        initials: 'АР',
        status: 'был недавно',
        handle: '@alexr',
        bio: 'Разработчик мобильных приложений.',
        colorValue: 0xFF5D8CE3,
        messages: [
          ChatMessage(
            id: 'a1',
            text: 'Подготовил заметки по синхронизации устройств.',
            sentAt: _today(9, 10),
            direction: MessageDirection.incoming,
          ),
          ChatMessage(
            id: 'a2',
            text: 'Хорошо, я посмотрю вечером.',
            sentAt: _today(9, 16),
            direction: MessageDirection.outgoing,
          ),
        ],
      ),
      Conversation(
        id: 'saved',
        title: 'Сохранённые',
        initials: '★',
        status: 'личное облако',
        handle: 'Только для вас',
        bio: 'Заметки, ссылки и файлы, которые всегда под рукой.',
        colorValue: 0xFF6577EE,
        messages: [
          ChatMessage(
            id: 's1',
            text: 'Идея: быстрые голосовые комнаты для маленьких команд.',
            sentAt: _today(8, 20),
            direction: MessageDirection.outgoing,
          ),
        ],
      ),
      Conversation(
        id: 'lena',
        title: 'Лена Воронова',
        initials: 'ЛВ',
        status: 'была вчера',
        handle: '@lenavoronova',
        bio: 'Фотограф и путешественница.',
        colorValue: 0xFFD66DA5,
        unreadCount: 1,
        messages: [
          ChatMessage(
            id: 'l1',
            text: 'Наконец поймала тот самый вечерний свет 📷',
            sentAt: _today(18, 43),
            direction: MessageDirection.incoming,
          ),
        ],
      ),
    ];
