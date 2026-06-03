/// App configuration.
///
/// The backend base URL is provided at build/run time so the same code points
/// at an emulator host, a phone on your LAN, or a deployed server:
///
///   flutter run    --dart-define=API_BASE=http://192.168.0.10:3000
///   flutter build apk --dart-define=API_BASE=http://192.168.0.10:3000
///
/// Default 10.0.2.2 is the Android emulator's alias for the host machine.
class AppConfig {
  static const String apiBase =
      String.fromEnvironment('API_BASE', defaultValue: 'http://10.0.2.2:3000');
}
