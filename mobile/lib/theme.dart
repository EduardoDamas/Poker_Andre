import 'package:flutter/material.dart';

/// CAPA CONTEST brand theme (Concept 4 — red/black "esports").
/// Mirrors design/tokens.json so mobile and the admin panel stay consistent.
class Brand {
  static const red = Color(0xFFE2231A);
  static const redDark = Color(0xFF9E1009);
  static const redBright = Color(0xFFFF3B30);
  static const black = Color(0xFF0D0D0D);
  static const charcoal = Color(0xFF1A1A1A);
  static const white = Color(0xFFFFFFFF);
  static const offWhite = Color(0xFFF2F2F2);
  static const gray = Color(0xFF8A8A8A);
  static const feltGreen = Color(0xFF1E5C3A);
}

ThemeData buildCapaTheme() {
  final scheme = const ColorScheme.dark(
    primary: Brand.red,
    onPrimary: Brand.white,
    surface: Brand.charcoal,
    onSurface: Brand.offWhite,
    error: Brand.redBright,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.black,
    fontFamily: 'Roboto',
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.black,
      foregroundColor: Brand.white,
      centerTitle: true,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Brand.charcoal,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Brand.gray),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Brand.red, width: 2),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: Brand.red,
        foregroundColor: Brand.white,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
      ),
    ),
  );
}
