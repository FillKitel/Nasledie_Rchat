import 'package:flutter/material.dart';

import '../../../models/conversation.dart';

class ProfilePanel extends StatelessWidget {
  const ProfilePanel({required this.conversation, super.key});

  final Conversation conversation;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(left: BorderSide(color: theme.dividerColor)),
      ),
      child: Column(
        children: [
          SizedBox(
            height: 72,
            child: Row(
              children: [
                const SizedBox(width: 18),
                const Expanded(
                  child: Text('Информация',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                ),
                IconButton(
                    onPressed: () {},
                    icon: const Icon(Icons.more_horiz_rounded)),
                const SizedBox(width: 8),
              ],
            ),
          ),
          Divider(height: 1, color: theme.dividerColor),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 30, 20, 24),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 42,
                  backgroundColor: Color(conversation.colorValue),
                  child: Text(
                    conversation.initials,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  conversation.title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(conversation.handle,
                    style: TextStyle(color: colors.outline, fontSize: 12)),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: const [
                    _ProfileAction(
                        icon: Icons.call_rounded, label: 'Позвонить'),
                    _ProfileAction(
                        icon: Icons.videocam_rounded, label: 'Видео'),
                    _ProfileAction(
                        icon: Icons.notifications_off_rounded, label: 'Тишина'),
                  ],
                ),
              ],
            ),
          ),
          Divider(height: 1, color: theme.dividerColor),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                _InfoRow(label: 'О себе', value: conversation.bio),
                const SizedBox(height: 18),
                const _InfoRow(label: 'Медиа', value: '24 файла', arrow: true),
                const SizedBox(height: 18),
                _InfoRow(
                  label: 'Тип диалога',
                  value: conversation.isGroup ? 'Группа' : 'Личный чат',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileAction extends StatelessWidget {
  const _ProfileAction({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Column(
      children: [
        IconButton.filledTonal(onPressed: () {}, icon: Icon(icon, size: 19)),
        const SizedBox(height: 5),
        Text(label, style: TextStyle(color: colors.outline, fontSize: 9)),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(
      {required this.label, required this.value, this.arrow = false});

  final String label;
  final String value;
  final bool arrow;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return SizedBox(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: colors.outline, fontSize: 10)),
          const SizedBox(height: 5),
          Row(
            children: [
              Expanded(
                  child: Text(value,
                      style: const TextStyle(fontSize: 12, height: 1.4))),
              if (arrow)
                Icon(Icons.chevron_right_rounded,
                    color: colors.outline, size: 18),
            ],
          ),
        ],
      ),
    );
  }
}
