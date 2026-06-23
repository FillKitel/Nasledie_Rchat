enum MessageDirection { incoming, outgoing }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.text,
    required this.sentAt,
    required this.direction,
    this.reaction,
  });

  final String id;
  final String text;
  final DateTime sentAt;
  final MessageDirection direction;
  final String? reaction;
}
