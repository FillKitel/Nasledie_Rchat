import 'package:flutter/material.dart';

import 'messenger_controller.dart';
import 'widgets/chat_view.dart';
import 'widgets/conversation_list.dart';
import 'widgets/profile_panel.dart';

class MessengerShell extends StatefulWidget {
  const MessengerShell({required this.onToggleTheme, super.key});

  final VoidCallback onToggleTheme;

  @override
  State<MessengerShell> createState() => _MessengerShellState();
}

class _MessengerShellState extends State<MessengerShell> {
  late final MessengerController controller;
  bool showMobileChat = false;

  @override
  void initState() {
    super.initState();
    controller = MessengerController();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void _selectConversation(String id, {required bool mobile}) {
    controller.select(id);
    if (mobile) setState(() => showMobileChat = true);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth < 720) {
              return Scaffold(
                body: SafeArea(
                  bottom: false,
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    child: showMobileChat
                        ? ChatView(
                            key: ValueKey(controller.selectedId),
                            conversation: controller.selected,
                            onSend: controller.send,
                            onBack: () =>
                                setState(() => showMobileChat = false),
                          )
                        : ConversationList(
                            key: const ValueKey('inbox'),
                            controller: controller,
                            onSelect: (id) =>
                                _selectConversation(id, mobile: true),
                            onToggleTheme: widget.onToggleTheme,
                            mobile: true,
                          ),
                  ),
                ),
              );
            }

            final showProfile = constraints.maxWidth >= 1220;
            return Scaffold(
              body: SafeArea(
                child: Row(
                  children: [
                    _AppRail(onToggleTheme: widget.onToggleTheme),
                    SizedBox(
                      width: constraints.maxWidth < 980 ? 320 : 360,
                      child: ConversationList(
                        controller: controller,
                        onSelect: (id) =>
                            _selectConversation(id, mobile: false),
                        onToggleTheme: widget.onToggleTheme,
                      ),
                    ),
                    Expanded(
                      child: ChatView(
                        conversation: controller.selected,
                        onSend: controller.send,
                      ),
                    ),
                    if (showProfile)
                      SizedBox(
                        width: 304,
                        child: ProfilePanel(
                          conversation: controller.selected,
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _AppRail extends StatelessWidget {
  const _AppRail({required this.onToggleTheme});

  final VoidCallback onToggleTheme;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: 82,
      decoration: BoxDecoration(
        color: colors.surfaceContainerLow,
        border:
            Border(right: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 20),
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF8997FF), Color(0xFF5266E8)],
              ),
              boxShadow: [
                BoxShadow(
                  color: colors.primary.withValues(alpha: 0.25),
                  blurRadius: 18,
                  offset: const Offset(0, 7),
                ),
              ],
            ),
            child: const Icon(Icons.forum_rounded, color: Colors.white),
          ),
          const SizedBox(height: 42),
          const _RailItem(
              icon: Icons.chat_bubble_rounded, label: 'Чаты', active: true),
          const _RailItem(icon: Icons.call_rounded, label: 'Звонки'),
          const _RailItem(icon: Icons.people_alt_rounded, label: 'Люди'),
          const Spacer(),
          IconButton(
            tooltip: 'Сменить тему',
            onPressed: onToggleTheme,
            icon: const Icon(Icons.dark_mode_rounded),
          ),
          const SizedBox(height: 12),
          const CircleAvatar(
            radius: 21,
            backgroundColor: Color(0xFF8272E4),
            child:
                Text('АР', style: TextStyle(color: Colors.white, fontSize: 12)),
          ),
          const SizedBox(height: 18),
        ],
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  const _RailItem(
      {required this.icon, required this.label, this.active = false});

  final IconData icon;
  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: () {},
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: 58,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: active ? colors.primaryContainer : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            children: [
              Icon(icon,
                  size: 21, color: active ? colors.primary : colors.outline),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: active ? colors.primary : colors.outline,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
