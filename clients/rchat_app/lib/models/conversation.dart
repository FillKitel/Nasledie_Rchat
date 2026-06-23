import 'message.dart';

class Conversation {
  Conversation({
    required this.id,
    required this.title,
    required this.initials,
    required this.status,
    required this.handle,
    required this.bio,
    required this.colorValue,
    required this.messages,
    this.unreadCount = 0,
    this.isGroup = false,
  });

  final String id;
  final String title;
  final String initials;
  final String status;
  final String handle;
  final String bio;
  final int colorValue;
  final List<ChatMessage> messages;
  final bool isGroup;
  int unreadCount;

  ChatMessage get lastMessage => messages.last;
}
