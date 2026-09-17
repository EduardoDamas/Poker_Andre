import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/api/tables_api.dart';
import 'package:capa_contest/screens/forgot_password_screen.dart';
import 'package:capa_contest/screens/login_screen.dart';
import 'package:capa_contest/theme.dart';

/// Esqueci minha senha — code to the phone, then a new password.
void main() {
  Widget screenWith(http.Client client, {http.Client? tablesClient}) => MaterialApp(
        theme: buildCapaTheme(),
        home: ForgotPasswordScreen(
          api: AuthApi(client: client),
          tablesApi: TablesApi(client: tablesClient ?? MockClient((_) async => http.Response('[]', 200))),
          initialPhone: '+5511999998888',
        ),
      );

  testWidgets('login screen offers the recovery link', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildCapaTheme(),
      home: LoginScreen(api: AuthApi(client: MockClient((_) async => http.Response('{}', 404)))),
    ));
    expect(find.text('Esqueci minha senha'), findsOneWidget);

    await tester.tap(find.byKey(const Key('forgotBtn')));
    await tester.pumpAndSettle();
    expect(find.text('Recuperar senha'), findsOneWidget);
  });

  testWidgets('sends the code, then sets a new password and lands in the lobby', (tester) async {
    final calls = <String>[];
    final client = MockClient((req) async {
      calls.add('${req.method} ${req.url.path}');
      if (req.url.path == '/auth/password/forgot') {
        return http.Response(jsonEncode({'message': 'Se o número estiver cadastrado, enviamos um código.'}), 200);
      }
      if (req.url.path == '/auth/password/reset') {
        expect(jsonDecode(req.body)['code'], '123456');
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

    await tester.pumpWidget(screenWith(client));
    await tester.tap(find.byKey(const Key('sendCodeBtn')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('infoText')), findsOneWidget);
    expect(find.byKey(const Key('codeField')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('codeField')), '123456');
    await tester.enterText(find.byKey(const Key('newPasswordField')), 'senha-nova-123');
    await tester.tap(find.byKey(const Key('resetBtn')));
    await tester.pumpAndSettle();

    expect(calls, contains('POST /auth/password/forgot'));
    expect(calls, contains('POST /auth/password/reset'));
    expect(find.text('Mesas'), findsOneWidget); // logged straight in
  });

  testWidgets('a wrong code shows an error and keeps the form', (tester) async {
    final client = MockClient((req) async {
      if (req.url.path == '/auth/password/forgot') return http.Response('{}', 200);
      return http.Response(jsonEncode({'message': 'Invalid code.'}), 401);
    });

    await tester.pumpWidget(screenWith(client));
    await tester.tap(find.byKey(const Key('sendCodeBtn')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('codeField')), '000000');
    await tester.enterText(find.byKey(const Key('newPasswordField')), 'senha-nova-123');
    await tester.tap(find.byKey(const Key('resetBtn')));
    await tester.pumpAndSettle();

    expect(find.text('Código inválido ou expirado.'), findsOneWidget);
    expect(find.byKey(const Key('resetBtn')), findsOneWidget);
  });

  testWidgets('surfaces the rate limit instead of failing silently', (tester) async {
    final client = MockClient((_) async => http.Response('{}', 429));

    await tester.pumpWidget(screenWith(client));
    await tester.tap(find.byKey(const Key('sendCodeBtn')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Aguarde um minuto'), findsOneWidget);
    expect(find.byKey(const Key('codeField')), findsNothing);
  });

  testWidgets('asks for the code and password before submitting', (tester) async {
    var resets = 0;
    final client = MockClient((req) async {
      if (req.url.path == '/auth/password/reset') resets++;
      return http.Response('{}', 200);
    });

    await tester.pumpWidget(screenWith(client));
    await tester.tap(find.byKey(const Key('sendCodeBtn')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('resetBtn')));
    await tester.pumpAndSettle();

    expect(resets, 0);
    expect(find.text('Informe o código e a nova senha.'), findsOneWidget);
  });
}
