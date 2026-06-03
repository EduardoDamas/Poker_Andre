import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/screens/login_screen.dart';
import 'package:capa_contest/theme.dart';

/// F1 gate — phone-OTP login flow (offline, with a mocked backend).
void main() {
  Widget appWith(AuthApi api) =>
      MaterialApp(theme: buildCapaTheme(), home: LoginScreen(api: api));

  testWidgets('login: phone → code → home on valid OTP', (tester) async {
    final mock = MockClient((req) async {
      if (req.url.path == '/auth/otp/request') return http.Response('{}', 200);
      if (req.url.path == '/auth/otp/verify') {
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

    await tester.pumpWidget(appWith(AuthApi(client: mock)));

    // Step 1: phone.
    expect(find.byKey(const Key('phoneField')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('phoneField')), '+5511999998888');
    await tester.tap(find.byKey(const Key('sendCodeBtn')));
    await tester.pumpAndSettle();

    // Step 2: code.
    expect(find.byKey(const Key('codeField')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('codeField')), '123456');
    await tester.tap(find.byKey(const Key('verifyBtn')));
    await tester.pumpAndSettle();

    // Logged in → home greets the user.
    expect(find.text('Bem-vindo, Eduardo'), findsOneWidget);
  });

  testWidgets('login: shows an error on a wrong code', (tester) async {
    final mock = MockClient((req) async {
      if (req.url.path == '/auth/otp/request') return http.Response('{}', 200);
      return http.Response('unauthorized', 401); // verify fails
    });

    await tester.pumpWidget(appWith(AuthApi(client: mock)));
    await tester.enterText(find.byKey(const Key('phoneField')), '+5511999998888');
    await tester.tap(find.byKey(const Key('sendCodeBtn')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('codeField')), '000000');
    await tester.tap(find.byKey(const Key('verifyBtn')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('errorText')), findsOneWidget);
    expect(find.text('Bem-vindo, Eduardo'), findsNothing);
  });

  testWidgets('login: rate-limit (429) surfaces a friendly message', (tester) async {
    final mock = MockClient((req) async => http.Response('too many', 429));
    await tester.pumpWidget(appWith(AuthApi(client: mock)));
    await tester.enterText(find.byKey(const Key('phoneField')), '+5511999998888');
    await tester.tap(find.byKey(const Key('sendCodeBtn')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Too many requests'), findsOneWidget);
  });
}
