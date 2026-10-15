import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/screens/profile_screen.dart';
import 'package:capa_contest/theme.dart';

/// Every player's own code to invite friends (client, 2026-10-14): shown in
/// Perfil, with how many signed up, and sent to WhatsApp with the link.
class _FakeLauncher extends UrlLauncherPlatform with MockPlatformInterfaceMixin {
  final opened = <String>[];
  @override
  LinkDelegate? get linkDelegate => null;
  @override
  Future<bool> canLaunch(String url) async => true;
  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    opened.add(url);
    return true;
  }
}

void main() {
  final session = AuthSession(accessToken: 'tok', userId: 'u1', displayName: 'Maria');
  http.Response json(Object body, [int status = 200]) => http.Response.bytes(
      utf8.encode(jsonEncode(body)), status,
      headers: {'content-type': 'application/json; charset=utf-8'});

  AuthApi api({int invited = 2, bool fail = false}) => AuthApi(client: MockClient((req) async {
        if (req.url.path == '/auth/referral') {
          return fail ? json({'message': 'x'}, 500) : json({'code': 'MARIA47', 'invited': invited});
        }
        if (req.url.path == '/auth/me') {
          return json({'id': 'u1', 'displayName': 'Maria', 'phone': '+5511999998888', 'status': 'ACTIVE', 'balanceCents': '0'});
        }
        return json({}, 404);
      }));

  Future<void> open(WidgetTester tester, AuthApi a) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: buildCapaTheme(), home: ProfileScreen(session: session, authApi: a)));
    await tester.pumpAndSettle();
  }

  testWidgets('Perfil shows my code and how many friends used it', (tester) async {
    await open(tester, api());
    expect(find.text('MARIA47'), findsOneWidget);
    expect(find.text('2 amigos cadastrados'), findsOneWidget);
  });

  testWidgets('"Convidar no WhatsApp" sends the code and the links', (tester) async {
    final launcher = _FakeLauncher();
    UrlLauncherPlatform.instance = launcher;
    await open(tester, api(invited: 0));
    expect(find.text('Nenhum amigo ainda'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('inviteWhatsApp')));
    await tester.tap(find.byKey(const Key('inviteWhatsApp')));
    await tester.pumpAndSettle();
    final sent = Uri.decodeComponent(launcher.opened.single);
    expect(sent, startsWith('https://wa.me/?text='));
    expect(sent, contains('MARIA47'));
    expect(sent, contains('/baixar'));
    expect(sent, contains('/jogar/'));
  });

  testWidgets('no card when the code cannot be read', (tester) async {
    await open(tester, api(fail: true));
    expect(find.text('Convide amigos'), findsNothing);
  });
}
