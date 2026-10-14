import 'package:shared_preferences/shared_preferences.dart';

import 'auth_api.dart';

/// Where the logged-in session is kept between launches, so a player isn't
/// asked for phone and password every time they open the app — or reload the
/// page in the browser (2026-10).
///
/// [instance] is in memory (forgotten on close) until main() switches it to
/// the device's storage; tests keep the in-memory one.
abstract class SessionStore {
  static SessionStore instance = MemorySessionStore();

  Future<AuthSession?> load();
  Future<void> save(AuthSession session);
  Future<void> clear();
}

class MemorySessionStore implements SessionStore {
  AuthSession? _session;

  @override
  Future<AuthSession?> load() async => _session;
  @override
  Future<void> save(AuthSession session) async => _session = session;
  @override
  Future<void> clear() async => _session = null;
}

/// Android's SharedPreferences; the browser's localStorage on the web. The
/// token is the server's 7-day session — the same one the app holds in memory
/// while it runs — and "Sair" removes it.
class PrefsSessionStore implements SessionStore {
  static const _token = 'capa.session.token';
  static const _userId = 'capa.session.userId';
  static const _name = 'capa.session.displayName';

  @override
  Future<AuthSession?> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final token = p.getString(_token);
      final userId = p.getString(_userId);
      if (token == null || userId == null) return null;
      return AuthSession(accessToken: token, userId: userId, displayName: p.getString(_name) ?? '');
    } catch (_) {
      return null; // storage unavailable (e.g. a private browser window): just log in
    }
  }

  @override
  Future<void> save(AuthSession session) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_token, session.accessToken);
      await p.setString(_userId, session.userId);
      await p.setString(_name, session.displayName);
    } catch (_) {
      // Not saved: the player logs in again next time, as before.
    }
  }

  @override
  Future<void> clear() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.remove(_token);
      await p.remove(_userId);
      await p.remove(_name);
    } catch (_) {}
  }
}
