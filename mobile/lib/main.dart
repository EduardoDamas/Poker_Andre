import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'api/auth_api.dart';
import 'screens/splash_screen.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Full-screen game: hide the system status/navigation bars everywhere.
  // "Sticky" brings them back only briefly on an edge swipe, then re-hides.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
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
      home: SplashScreen(api: api),
    );
  }
}
