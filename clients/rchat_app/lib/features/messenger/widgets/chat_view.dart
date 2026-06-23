import 'package:flutter/material.dart';

import '../../../models/conversation.dart';
import '../../../models/message.dart';

class ChatView extends StatefulWidget {
  const ChatView({
    required this.conversation,
    required this.onSend,
    this.onBack,
    super.key,
  });

  final Conversation conversation;
  final ValueChanged<String> onSend;
  final VoidCallback? onBack;

  @override
  State<ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<ChatView> {
  final inputController = TextEditingController();
  final scrollController = ScrollController();

  @override
  void dispose() {
    inputController.dispose();
    scrollController.dispose();
    super.dispose();
  }

  void _send() {
    final text = inputController.text;
    if (text.trim().isEmpty) return;
    widget.onSend(text);
    inputController.clear();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToEnd());
  }

  void _scrollToEnd() {
    if (!scrollController.hasClients) return;
    scrollController.animateTo(
      scrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return ColoredBox(
      color: colors.surfaceContainerLowest,
      child: Column(
        children: [
          _ChatHeader(conversation: widget.conversation, onBack: widget.onBack),
          Expanded(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colors.surfaceContainerLow.withValues(alpha: 0.55),
              ),
              child: ListView.builder(
                controller: scrollController,
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 24),
                itemCount: widget.conversation.messages.length + 1,
                itemBuilder: (context, index) {
                  if (index == 0) return const _DayDivider();
                  return _MessageBubble(
                    message: widget.conversation.messages[index - 1],
                  );
                },
              ),
            ),
          ),
          _Composer(
            controller: inputController,
            onSend: _send,
          ),
        ],
      ),
    );
  }
}

class _ChatHeader extends StatelessWidget {
  const _ChatHeader({required this.conversation, this.onBack});

  final Conversation conversation;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Container(
      height: 72,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(bottom: BorderSide(color: theme.dividerColor)),
      ),
      child: Row(
        children: [
          if (onBack != null)
            IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 19),
            ),
          CircleAvatar(
            radius: 23,
            backgroundColor: Color(conversation.colorValue),
            child: Text(
              conversation.initials,
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  conversation.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (conversation.status == 'в сети') ...[
                      const CircleAvatar(
                        radius: 4,
                        backgroundColor: Color(0xFF43C791),
                      ),
                      const SizedBox(width: 6),
                    ],
                    Text(
                      conversation.status,
                      style: TextStyle(color: colors.outline, fontSize: 11),
                    ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Позвонить',
            onPressed: () {},
            icon: const Icon(Icons.call_rounded),
          ),
          if (onBack == null)
            IconButton(
              tooltip: 'Видеозвонок',
              onPressed: () {},
              icon: const Icon(Icons.videocam_rounded),
            ),
        ],
      ),
    );
  }
}

class _DayDivider extends StatelessWidget {
  const _DayDivider();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(
        children: [
          const Expanded(child: Divider(indent: 32)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'Сегодня',
              style: TextStyle(
                color: Theme.of(context).colorScheme.outline,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const Expanded(child: Divider(endIndent: 32)),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final outgoing = message.direction == MessageDirection.outgoing;
    final time = '${message.sentAt.hour.toString().padLeft(2, '0')}:'
        '${message.sentAt.minute.toString().padLeft(2, '0')}';
    return Align(
      alignment: outgoing ? Alignment.centerRight : Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(
          crossAxisAlignment:
              outgoing ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Container(
              constraints: const BoxConstraints(maxWidth: 520),
              padding: const EdgeInsets.fromLTRB(14, 10, 12, 8),
              decoration: BoxDecoration(
                color: outgoing ? colors.primary : colors.surface,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(18),
                  topRight: const Radius.circular(18),
                  bottomLeft: Radius.circular(outgoing ? 18 : 6),
                  bottomRight: Radius.circular(outgoing ? 6 : 18),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.045),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Flexible(
                    child: Text(
                      message.text,
                      style: TextStyle(
                        color: outgoing ? colors.onPrimary : colors.onSurface,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    outgoing ? '$time  ✓✓' : time,
                    style: TextStyle(
                      color: (outgoing ? colors.onPrimary : colors.onSurface)
                          .withValues(alpha: 0.62),
                      fontSize: 9,
                    ),
                  ),
                ],
              ),
            ),
            if (message.reaction != null)
              Transform.translate(
                offset: const Offset(0, -4),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: colors.surfaceContainerHigh),
                  ),
                  child: Text(message.reaction!,
                      style: const TextStyle(fontSize: 11)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.onSend});

  final TextEditingController controller;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            IconButton(
              tooltip: 'Прикрепить',
              onPressed: () {},
              icon: const Icon(Icons.attach_file_rounded),
            ),
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                textInputAction: TextInputAction.newline,
                decoration: const InputDecoration(
                  hintText: 'Напишите сообщение…',
                  suffixIcon: Icon(Icons.sentiment_satisfied_alt_rounded),
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 15, vertical: 12),
                ),
                onSubmitted: (_) => onSend(),
              ),
            ),
            const SizedBox(width: 9),
            IconButton.filled(
              tooltip: 'Отправить',
              onPressed: onSend,
              icon: const Icon(Icons.send_rounded, size: 20),
            ),
          ],
        ),
      ),
    );
  }
}
