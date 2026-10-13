import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/screens/register_screen.dart';
import 'package:capa_contest/theme.dart';

/// The agent's referral code at sign-up (client, 2026-10-12): optional, sent
/// when typed, and a code the server doesn't know stops the sign-up with its
/// message so the player can fix it.
void main() {
  Widget screenWith(http.Client client) => MaterialApp(
        theme: buildCapaTheme(),
        home: RegisterScreen(api: AuthApi(client: client)),
      );

  Future<void> tap(WidgetTester tester, Key key) async {
    await tester.ensureVisible(find.byKey(key));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(key));
    await tester.pumpAndSettle();
  }

  Future<void> fillForm(WidgetTester tester, {String referral = ''}) async {
    await tester.enterText(find.widgetWithText(TextField, 'Telefone'), '+5511999998888');
    await tester.enterText(find.widgetWithText(TextField, 'Nome completo'), 'Eduardo Silva');
    await tester.enterText(find.widgetWithText(TextField, 'CPF'), '111.444.777-35');
    await tester.enterText(find.widgetWithText(TextField, 'Data de nascimento'), '01/01/1990');
    await tester.enterText(find.widgetWithText(TextField, 'Senha'), 'senha-123');
    if (referral.isNotEmpty) {
      await tester.enterText(find.byKey(const Key('referralField')), referral);
    }
    await tester.pump();
    await tap(tester, const Key('termsCheckbox'));
  }

  MockClient recording(void Function(Map<String, dynamic>) onRegister, {int status = 201, String reply = '{}'}) =>
      MockClient((req) async {
        if (req.url.path == '/auth/register') {
          onRegister(jsonDecode(req.body) as Map<String, dynamic>);
          return http.Response.bytes(utf8.encode(reply), status,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }
        return http.Response('[]', 200);
      });

  testWidgets('the field is there and says it is optional', (tester) async {
    await tester.pumpWidget(screenWith(MockClient((_) async => http.Response('{}', 201))));
    expect(find.text('Código de indicação (opcional)'), findsOneWidget);
  });

  testWidgets('a typed code goes to the server, trimmed', (tester) async {
    Map<String, dynamic>? sent;
    await tester.pumpWidget(screenWith(recording((b) => sent = b)));
    await fillForm(tester, referral: ' JOAO10 ');
    await tap(tester, const Key('createAccountBtn'));
    expect(sent?['referralCode'], 'JOAO10');
  });

  testWidgets('no code: the field is left out, as before', (tester) async {
    Map<String, dynamic>? sent;
    await tester.pumpWidget(screenWith(recording((b) => sent = b)));
    await fillForm(tester);
    await tap(tester, const Key('createAccountBtn'));
    expect(sent, isNotNull);
    expect(sent!.containsKey('referralCode'), isFalse);
  });

  testWidgets("an unknown code shows the server's message and stays on the form", (tester) async {
    await tester.pumpWidget(screenWith(recording((_) {},
        status: 400, reply: '{"message":"Código de indicação inválido.","statusCode":400}')));
    await fillForm(tester, referral: 'ERRADO');
    await tap(tester, const Key('createAccountBtn'));
    expect(find.text('Código de indicação inválido.'), findsOneWidget);
    expect(find.byKey(const Key('createAccountBtn')), findsOneWidget);
  });
}
