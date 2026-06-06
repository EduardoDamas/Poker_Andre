/// App configuration.
///
/// The backend base URL is provided at build/run time so the same code points
/// at an emulator host, a phone on your LAN, or a deployed server:
///
///   flutter run    --dart-define=API_BASE=http://192.168.0.10:3000
///   flutter build apk --dart-define=API_BASE=http://192.168.0.10:3000
///
/// Default points to the Railway production backend.
/// For local dev use: --dart-define=API_BASE=http://10.0.2.2:3000
class AppConfig {
  static const String apiBase =
      String.fromEnvironment('API_BASE', defaultValue: 'https://capa-contest-api-production.up.railway.app');
}
