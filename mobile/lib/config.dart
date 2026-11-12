import 'package:flutter/foundation.dart' show kIsWeb;

/// App configuration.
///
/// The backend base URL is provided at build/run time so the same code points
/// at an emulator host, a phone on your LAN, or a deployed server:
///
///   flutter run    --dart-define=API_BASE=http://192.168.0.10:3000
///   flutter build apk --dart-define=API_BASE=http://192.168.0.10:3000
///
/// Without API_BASE: the browser build (served by the backend at /jogar) talks
/// to the server it was loaded from, so it follows the hosting wherever it
/// moves; the Android app uses [_defaultApiBase] (production).
/// For local dev use: --dart-define=API_BASE=http://10.0.2.2:3000
class AppConfig {
  static const String _defineApiBase = String.fromEnvironment('API_BASE');
  static const String _defaultApiBase = 'https://capa-contest-api.onrender.com';

  static final String apiBase = _defineApiBase.isNotEmpty
      ? _defineApiBase
      : kIsWeb
          ? Uri.base.origin
          : _defaultApiBase;

  /// Shown in Configurações. Keep in step with `version:` in pubspec.yaml.
  static const String appVersion = '1.0.11';
}
