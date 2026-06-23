import 'package:flutter/foundation.dart';

import '../../data/demo_conversations.dart';
import '../../models/conversation.dart';
import '../../models/message.dart';

class MessengerController extends ChangeNotifier {
  MessengerController() : conversations = createDemoConversations();

  final List<Conversation> conversations;
  String selectedId = 'marina';
  String query = '';
  bool unreadOnly = false;

  Conversation get selected =>
      conversations.firstWhere((conversation) => conversation.id == selectedId);

  List<Conversation> get visibleConversations {
    final normalized = query.trim().toLowerCase();
    return conversations.where((conversation) {
      final matchesQuery = normalized.isEmpty ||
          conversation.title.toLowerCase().contains(normalized) ||
          conversation.lastMessage.text.toLowerCase().contains(normalized);
      final matchesUnread = !unreadOnly || conversation.unreadCount > 0;
      return matchesQuery && matchesUnread;
    }).toList();
  }

  int get unreadChats => conversations
      .where((conversation) => conversation.unreadCount > 0)
      .length;

  void select(String id) {
    selectedId = id;
    selected.unreadCount = 0;
    notifyListeners();
  }

  void setQuery(String value) {
    query = value;
    notifyListeners();
  }

  void setUnreadOnly(bool value) {
    unreadOnly = value;
    notifyListeners();
  }

  void send(String value) {
    final text = value.trim();
    if (text.isEmpty) return;
    selected.messages.add(
      ChatMessage(
        id: DateTime.now().microsecondsSinceEpoch.toString(),
        text: text,
        sentAt: DateTime.now(),
        direction: MessageDirection.outgoing,
      ),
    );
    notifyListeners();
  }
}
