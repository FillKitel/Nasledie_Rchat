import 'package:flutter/material.dart';

import 'features/messenger/messenger_shell.dart';
import 'theme/app_theme.dart';

class RChatApp extends StatefulWidget {
  const RChatApp({super.key});

  @override
  State<RChatApp> createState() => _RChatAppState();
}

class _RChatAppState extends State<RChatApp> {
  ThemeMode _themeMode = ThemeMode.system;

  void _toggleTheme() {
    setState(() {
      _themeMode = switch (_themeMode) {
        ThemeMode.dark => ThemeMode.light,
        _ => ThemeMode.dark,
      };
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Маяк',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: _themeMode,
      home: MessengerShell(onToggleTheme: _toggleTheme),
    );
  }
}
