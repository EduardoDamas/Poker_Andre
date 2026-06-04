import 'package:flutter/material.dart';

/// CAPA CONTEST premium design system (Concept 4 — Obsidian + Crimson + Gold).
/// Mirrors design/tokens.json. See docs/REDESIGN.md.
class Brand {
  // Obsidian
  static const bg = Color(0xFF0A0A0B);
  static const bg2 = Color(0xFF101013);
  static const surface = Color(0xFF141417);
  static const surfaceHi = Color(0xFF1C1C21);
  static const surface2 = Color(0xFF26262D);
  static const border = Color(0xFF2A2B31);
  // Crimson
  static const crimsonGlow = Color(0xFFFF4438);
  static const crimson = Color(0xFFE2231A);
  static const crimsonDeep = Color(0xFFB3140C);
  // Gold
  static const champagne = Color(0xFFFBE4A8);
  static const gold = Color(0xFFF5C45E);
  static const goldDeep = Color(0xFFC9982E);
  static const onGold = Color(0xFF1A1206);
  // Felt
  static const felt = Color(0xFF1B5E3F);
  static const feltDeep = Color(0xFF0E3A26);
  static const feltRail = Color(0xFF14151A);
  static const feltTrim = Color(0xFFC9982E);
  // Text
  static const textPri = Color(0xFFF5F6F7);
  static const textSec = Color(0xFFA7ABB4);
  static const textTer = Color(0xFF6C7079);
  // Semantic
  static const success = Color(0xFF2FBF71);
  static const danger = Color(0xFFFF4438);
  static const warning = Color(0xFFF5C45E);

  // Gradients
  static const crimsonGrad = LinearGradient(
      begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [crimsonGlow, crimsonDeep]);
  static const goldGrad = LinearGradient(
      begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [champagne, goldDeep]);
  static const obsidianGrad = LinearGradient(
      begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [surfaceHi, bg]);
  static const feltGrad = RadialGradient(radius: 0.95, colors: [felt, feltDeep]);

  // Shadows
  static List<BoxShadow> cardShadow = const [
    BoxShadow(color: Color(0x73000000), blurRadius: 24, offset: Offset(0, 8)),
  ];
  static List<BoxShadow> glow(Color c) => [BoxShadow(color: c.withValues(alpha: 0.45), blurRadius: 24)];

  // Type scale
  static const _tab = [FontFeature.tabularFigures()];
  static const display = TextStyle(fontSize: 32, height: 1.15, fontWeight: FontWeight.w800, letterSpacing: -0.5, color: textPri);
  static const h1 = TextStyle(fontSize: 26, height: 1.2, fontWeight: FontWeight.w800, color: textPri);
  static const h2 = TextStyle(fontSize: 20, height: 1.25, fontWeight: FontWeight.w700, color: textPri);
  static const h3 = TextStyle(fontSize: 17, height: 1.3, fontWeight: FontWeight.w700, color: textPri);
  static const body = TextStyle(fontSize: 15, height: 1.45, color: textSec);
  static const label = TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: textPri);
  static const caption = TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: textSec);
  static const micro = TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: textTer);
  static const money = TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: textPri, fontFeatures: _tab);
}

ThemeData buildCapaTheme() {
  const scheme = ColorScheme.dark(
    primary: Brand.crimson,
    onPrimary: Colors.white,
    secondary: Brand.gold,
    surface: Brand.surface,
    onSurface: Brand.textPri,
    error: Brand.danger,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.bg,
    canvasColor: Brand.bg,
    splashFactory: InkRipple.splashFactory,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      foregroundColor: Brand.textPri,
      centerTitle: true,
      titleTextStyle: Brand.h3,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Brand.surfaceHi,
      hintStyle: const TextStyle(color: Brand.textTer),
      labelStyle: const TextStyle(color: Brand.textSec),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Brand.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Brand.crimson, width: 2),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: Brand.surface2,
      contentTextStyle: TextStyle(color: Brand.textPri),
      behavior: SnackBarBehavior.floating,
    ),
  );
}
