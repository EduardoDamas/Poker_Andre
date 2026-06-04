import 'dart:async';
import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../theme.dart';
import 'login_screen.dart';

/// Branded first-load / splash screen.
///
/// Background + logo use the real Concept-4 artwork IF present at
/// `assets/brand/splash.png` / `assets/brand/logo.png`; otherwise they fall
/// back to a premium gradient + wordmark so the build always works.
class SplashScreen extends StatefulWidget {
  final AuthApi api;
  const SplashScreen({super.key, required this.api});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Timer(const Duration(milliseconds: 2200), () {
      if (!mounted) return;
      Navigator.of(context).pushReplacement(PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 450),
        pageBuilder: (_, a, _) =>
            FadeTransition(opacity: a, child: LoginScreen(api: widget.api)),
      ));
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Background: real splash art if available, else a branded gradient.
          Image.asset(
            'assets/brand/splash.png',
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => const DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment(0, -0.2),
                  radius: 1.1,
                  colors: [Color(0xFF2A0B09), Brand.bg],
                ),
              ),
            ),
          ),
          // Dark scrim so the logo always reads on top of any image.
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x660A0A0B), Color(0xCC0A0A0B)],
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                const Spacer(flex: 3),
                _Logo(),
                const SizedBox(height: 18),
                const _SuitDivider(),
                const SizedBox(height: 14),
                Text('Torneios Digitais de Cartas e Tabuleiro',
                    textAlign: TextAlign.center, style: Brand.caption.copyWith(color: Brand.textSec)),
                const Spacer(flex: 3),
                const SizedBox(
                  height: 26, width: 26,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: Brand.crimson),
                ),
                const SizedBox(height: 12),
                Text('Carregando…', style: Brand.micro.copyWith(color: Brand.textTer)),
                const SizedBox(height: 28),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Real mascot/logo if provided, else the wordmark with a crimson glow.
    return Image.asset(
      'assets/brand/logo.png',
      height: 140,
      errorBuilder: (_, _, _) => Container(
        decoration: BoxDecoration(boxShadow: Brand.glow(Brand.crimson)),
        child: RichText(
          textAlign: TextAlign.center,
          text: const TextSpan(
            style: TextStyle(fontSize: 44, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic),
            children: [
              TextSpan(text: 'CAPA', style: TextStyle(color: Brand.crimson)),
              TextSpan(text: ' CONTEST', style: TextStyle(color: Brand.textPri)),
            ],
          ),
        ),
      ),
    );
  }
}

class _SuitDivider extends StatelessWidget {
  const _SuitDivider();
  @override
  Widget build(BuildContext context) {
    Widget line() => Container(width: 36, height: 1.5, color: Brand.crimson.withValues(alpha: 0.6));
    Widget suit(String s, Color c) =>
        Padding(padding: const EdgeInsets.symmetric(horizontal: 6), child: Text(s, style: TextStyle(color: c, fontSize: 16)));
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        line(),
        suit('♠', Brand.textPri),
        suit('♦', Brand.crimson),
        suit('♣', Brand.textPri),
        suit('♟', Brand.crimson),
        line(),
      ],
    );
  }
}
