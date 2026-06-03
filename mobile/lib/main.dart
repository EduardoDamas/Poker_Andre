import 'package:flutter/material.dart';
import 'api/auth_api.dart';
import 'screens/login_screen.dart';
import 'theme.dart';

void main() {
  runApp(CapaContestApp(api: AuthApi()));
}

class CapaContestApp extends StatelessWidget {
  final AuthApi api;
  const CapaContestApp({super.key, required this.api});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CAPA CONTEST',
      debugShowCheckedModeBanner: false,
      theme: buildCapaTheme(),
      home: LoginScreen(api: api),
    );
  }
}
