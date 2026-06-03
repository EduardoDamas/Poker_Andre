import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../theme.dart';

/// Minimal post-login screen for F1. The lobby (F2) and table (F3) come next.
class HomeScreen extends StatelessWidget {
  final AuthSession session;
  const HomeScreen({super.key, required this.session});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('CAPA CONTEST')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.verified, color: Brand.red, size: 64),
            const SizedBox(height: 16),
            Text(
              'Bem-vindo, ${session.displayName}',
              style: const TextStyle(color: Brand.white, fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Login efetuado. Lobby em breve (F2).',
              style: TextStyle(color: Brand.gray),
            ),
          ],
        ),
      ),
    );
  }
}
