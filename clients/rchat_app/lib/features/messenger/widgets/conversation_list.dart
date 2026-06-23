import 'package:flutter/material.dart';

import '../../../models/conversation.dart';
import '../messenger_controller.dart';

class ConversationList extends StatelessWidget {
  const ConversationList({
    required this.controller,
    required this.onSelect,
    required this.onToggleTheme,
    this.mobile = false,
    super.key,
  });

  final MessengerController controller;
  final ValueChanged<String> onSelect;
  final VoidCallback onToggleTheme;
  final bool mobile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        border: mobile
            ? null
            : Border(right: BorderSide(color: theme.dividerColor)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
            child: Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'ВАШЕ ПРОСТРАНСТВО',
                        style: TextStyle(
                          color: Color(0xFF6577EE),
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.1,
                        ),
                      ),
                      SizedBox(height: 5),
                      Text(
                        'Сообщения',
                        style: TextStyle(
                            fontSize: 26, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
                if (mobile)
                  IconButton(
                    onPressed: onToggleTheme,
                    icon: const Icon(Icons.dark_mode_rounded),
                  ),
                FilledButton.tonalIcon(
                  onPressed: () {},
                  icon: const Icon(Icons.edit_rounded, size: 18),
                  label: mobile ? const SizedBox.shrink() : const Text('Новый'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: TextField(
              onChanged: controller.setQuery,
              decoration: const InputDecoration(
                hintText: 'Поиск',
                prefixIcon: Icon(Icons.search_rounded),
                isDense: true,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Wrap(
                spacing: 7,
                runSpacing: 7,
                children: [
                  _FilterChip(
                    label: 'Все ${controller.conversations.length}',
                    selected: !controller.unreadOnly,
                    onTap: () => controller.setUnreadOnly(false),
                  ),
                  _FilterChip(
                    label: 'Непрочитанные ${controller.unreadChats}',
                    selected: controller.unreadOnly,
                    onTap: () => controller.setUnreadOnly(true),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: controller.visibleConversations.isEmpty
                ? const Center(child: Text('Ничего не найдено'))
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
                    itemCount: controller.visibleConversations.length,
                    itemBuilder: (context, index) {
                      final item = controller.visibleConversations[index];
                      return _ConversationTile(
                        conversation: item,
                        selected: !mobile && item.id == controller.selectedId,
                        onTap: () => onSelect(item.id),
                      );
                    },
                  ),
          ),
          if (mobile) const _MobileNavigation(),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(11),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? colors.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? colors.primary : colors.outline,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({
    required this.conversation,
    required this.selected,
    required this.onTap,
  });

  final Conversation conversation;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final message = conversation.lastMessage;
    final time = '${message.sentAt.hour.toString().padLeft(2, '0')}:'
        '${message.sentAt.minute.toString().padLeft(2, '0')}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(17),
        clipBehavior: Clip.antiAlias,
        child: ListTile(
          onTap: onTap,
          selected: selected,
          selectedTileColor: colors.primaryContainer.withValues(alpha: 0.64),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          leading: CircleAvatar(
            radius: 25,
            backgroundColor: Color(conversation.colorValue),
            child: Text(
              conversation.initials,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          title: Text(
            conversation.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Text(
              message.text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: colors.outline, fontSize: 12),
            ),
          ),
          trailing: SizedBox(
            width: 42,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(time,
                    style: TextStyle(color: colors.outline, fontSize: 10)),
                const SizedBox(height: 7),
                if (conversation.unreadCount > 0)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: colors.primary,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${conversation.unreadCount}',
                      style: TextStyle(
                        color: colors.onPrimary,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MobileNavigation extends StatelessWidget {
  const _MobileNavigation();

  @override
  Widget build(BuildContext context) {
    return NavigationBar(
      selectedIndex: 0,
      destinations: const [
        NavigationDestination(
            icon: Icon(Icons.chat_bubble_rounded), label: 'Чаты'),
        NavigationDestination(icon: Icon(Icons.call_rounded), label: 'Звонки'),
        NavigationDestination(
            icon: Icon(Icons.people_alt_rounded), label: 'Люди'),
      ],
    );
  }
}
