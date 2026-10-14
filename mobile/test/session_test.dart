import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/api/session_store.dart';
import 'package:capa_contest/screens/lobby_screen.dart';
import 'package:capa_contest/screens/login_screen.dart';
import 'package:capa_contest/screens/settings_screen.dart';
import 'package:capa_contest/screens/splash_screen.dart';
import 'package:capa_contest/theme.dart';

/// Staying logged in (2026-10): the session is kept on the device after
/// logging in, the app opens straight into the lobby while the server still
/// takes it, and "Sair" forgets it.
void main() {
  final saved = AuthSession(accessToken: 'tok-1', userId: 'u1', displayName: 'Maria');
  http.Response json(Object body, [int status = 200]) => http.Response.bytes(
      utf8.encode(jsonEncode(body)), status,
      headers: {'content-type': 'application/json; charset=utf-8'});

  setUp(() => SessionStore.instance = MemorySessionStore());

  group('AuthApi', () {
    test('logging in keeps the session on the device', () async {
      final api = AuthApi(client: MockClient((req) async => json({
            'accessToken': 'tok-9',
            'user': {'id': 'u9', 'displayName': 'Ana', 'status': 'ACTIVE'},
          })));
      await api.login('+5511999998888', 'senha-123');
      final kept = await SessionStore.instance.load();
      expect(kept?.accessToken, 'tok-9');
      expect(kept?.userId, 'u9');
    });

    test('a failed login keeps nothing', () async {
      final api = AuthApi(client: MockClient((req) async => json({'message': 'x'}, 401)));
      await expectLater(api.login('+5511999998888', 'errada'), throwsA(isA<AuthException>()));
      expect(await SessionStore.instance.load(), isNull);
    });

    test('resuming: accepted → the session, with the current name', () async {
      await SessionStore.instance.save(saved);
      String? auth;
      final api = AuthApi(client: MockClient((req) async {
        auth = req.headers['Authorization'];
        return json({'id': 'u1', 'displayName': 'Maria Souza', 'status': 'ACTIVE', 'balanceCents': '0'});
      }));
      final s = await api.restoreSession();
      expect(auth, 'Bearer tok-1');
      expect(s?.accessToken, 'tok-1');
      expect(s?.displayName, 'Maria Souza');
    });

    test('resuming: refused (expired) → forgotten, log in again', () async {
      await SessionStore.instance.save(saved);
      final api = AuthApi(client: MockClient((req) async => json({'message': 'Unauthorized'}, 401)));
      expect(await api.restoreSession(), isNull);
      expect(await SessionStore.instance.load(), isNull);
    });

    test('resuming: a blocked account → forgotten', () async {
      await SessionStore.instance.save(saved);
      final api = AuthApi(client: MockClient((req) async => json({'id': 'u1', 'displayName': 'M', 'status': 'BLOCKED'})));
      expect(await api.restoreSession(), isNull);
      expect(await SessionStore.instance.load(), isNull);
    });

    test('resuming offline keeps the saved session (the lobby says what is wrong)', () async {
      await SessionStore.instance.save(saved);
      final api = AuthApi(client: MockClient((req) async => throw http.ClientException('offline')));
      expect((await api.restoreSession())?.accessToken, 'tok-1');
      expect(await SessionStore.instance.load(), isNotNull);
    });

    test('nothing saved → nothing to resume, no request made', () async {
      var calls = 0;
      final api = AuthApi(client: MockClient((req) async {
        calls++;
        return json({});
      }));
      expect(await api.restoreSession(), isNull);
      expect(calls, 0);
    });
  });

  group('device storage', () {
    test('saves, reads back and forgets', () async {
      SharedPreferences.setMockInitialValues({});
      final store = PrefsSessionStore();
      expect(await store.load(), isNull);
      await store.save(saved);
      final back = await store.load();
      expect([back?.accessToken, back?.userId, back?.displayName], ['tok-1', 'u1', 'Maria']);
      await store.clear();
      expect(await store.load(), isNull);
    });
  });

  group('screens', () {
    Widget app(Widget home) => MaterialApp(theme: buildCapaTheme(), home: home);

    testWidgets('with a saved session the app opens in the lobby', (tester) async {
      await SessionStore.instance.save(saved);
      final api = AuthApi(client: MockClient((req) async => req.url.path == '/auth/me'
          ? json({'id': 'u1', 'displayName': 'Maria', 'status': 'ACTIVE', 'balanceCents': '0'})
          : json([])));
      await tester.pumpWidget(app(SplashScreen(api: api)));
      await tester.pump(const Duration(milliseconds: 2300));
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.byType(LobbyScreen), findsOneWidget);
      expect(find.byType(LoginScreen), findsNothing);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('with nothing saved it opens the login', (tester) async {
      final api = AuthApi(client: MockClient((req) async => json({})));
      await tester.pumpWidget(app(SplashScreen(api: api)));
      await tester.pump(const Duration(milliseconds: 2300));
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets('"Sair da conta" forgets the session and leaves nothing to go back to', (tester) async {
      await SessionStore.instance.save(saved);
      await tester.pumpWidget(app(SettingsScreen(session: saved)));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const Key('logoutBtn')), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byKey(const Key('logoutBtn')));
      await tester.pumpAndSettle();
      expect(await SessionStore.instance.load(), isNull);
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.byType(SettingsScreen), findsNothing);
      final nav = tester.state<NavigatorState>(find.byType(Navigator));
      expect(nav.canPop(), isFalse);
    });
  });
}
