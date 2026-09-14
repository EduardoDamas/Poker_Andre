import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/api/tables_api.dart';
import 'package:capa_contest/screens/login_screen.dart';
import 'package:capa_contest/theme.dart';

/// F1 gate — phone + password login flow (offline, with a mocked backend).
void main() {
  Widget appWith(AuthApi api, {TablesApi? tablesApi}) => MaterialApp(
        theme: buildCapaTheme(),
        home: LoginScreen(api: api, tablesApi: tablesApi),
      );

  testWidgets('login: phone + password → lobby', (tester) async {
    final mock = MockClient((req) async {
      if (req.url.path == '/auth/login') {
        return http.Response(
          jsonEncode({
            'accessToken': 'jwt-token',
            'user': {'id': 'u1', 'displayName': 'Eduardo', 'status': 'ACTIVE'},
          }),
          200,
        );
      }
      return http.Response('not found', 404);
    });
    // Lobby fetch returns an empty list (we only assert we reached the lobby).
    final tablesMock = MockClient((req) async => http.Response('[]', 200));

    await tester.pumpWidget(
        appWith(AuthApi(client: mock), tablesApi: TablesApi(client: tablesMock)));

    await tester.enterText(find.byKey(const Key('phoneField')), '+5511999998888');
    await tester.enterText(find.byKey(const Key('passwordField')), 'teste12345');
    await tester.tap(find.byKey(const Key('loginBtn')));
    await tester.pumpAndSettle();

    // Logged in → lobby (the "Mesas" app bar).
    expect(find.text('Mesas'), findsOneWidget);
  });

  testWidgets('login: shows an error on wrong credentials', (tester) async {
    final mock = MockClient((req) async => http.Response(
        jsonEncode({'message': 'Telefone ou senha inválidos.'}), 401));

    await tester.pumpWidget(appWith(AuthApi(client: mock)));
    await tester.enterText(find.byKey(const Key('phoneField')), '+5511999998888');
    await tester.enterText(find.byKey(const Key('passwordField')), 'errada123');
    await tester.tap(find.byKey(const Key('loginBtn')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('errorText')), findsOneWidget);
    expect(find.text('Mesas'), findsNothing);
  });

  testWidgets('login: server error surfaces a message, not a crash', (tester) async {
    final mock = MockClient((req) async => http.Response('oops', 500));
    await tester.pumpWidget(appWith(AuthApi(client: mock)));
    await tester.enterText(find.byKey(const Key('phoneField')), '+5511999998888');
    await tester.enterText(find.byKey(const Key('passwordField')), 'teste12345');
    await tester.tap(find.byKey(const Key('loginBtn')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('errorText')), findsOneWidget);
  });
}
