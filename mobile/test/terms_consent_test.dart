import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/screens/register_screen.dart';
import 'package:capa_contest/theme.dart';

/// Registration records consent: the box must be ticked, and the answer travels
/// to the server so the acceptance is stored with its date and version.
void main() {
  Widget screenWith(http.Client client) => MaterialApp(
        theme: buildCapaTheme(),
        home: RegisterScreen(api: AuthApi(client: client)),
      );

  Future<void> fillForm(WidgetTester tester) async {
    await tester.enterText(find.widgetWithText(TextField, 'Telefone'), '+5511999998888');
    await tester.enterText(find.widgetWithText(TextField, 'Nome completo'), 'Eduardo Silva');
    await tester.enterText(find.widgetWithText(TextField, 'CPF'), '111.444.777-35');
    await tester.enterText(find.widgetWithText(TextField, 'Data de nascimento'), '01/01/1990');
    await tester.enterText(find.widgetWithText(TextField, 'Senha'), 'senha-123');
    await tester.pump();
  }

  /// The form scrolls: bring the target into view before tapping it.
  Future<void> tap(WidgetTester tester, Key key) async {
    await tester.ensureVisible(find.byKey(key));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(key));
    await tester.pumpAndSettle();
  }

  testWidgets('the consent line names all three documents', (tester) async {
    await tester.pumpWidget(screenWith(MockClient((_) async => http.Response('{}', 201))));

    expect(find.textContaining('Declaro ter 18 anos ou mais'), findsOneWidget);
    expect(find.byKey(const Key('termsCheckbox')), findsOneWidget);
  });

  testWidgets('will not register without accepting', (tester) async {
    var posts = 0;
    final client = MockClient((_) async {
      posts++;
      return http.Response('{}', 201);
    });

    await tester.pumpWidget(screenWith(client));
    await fillForm(tester);
    await tap(tester, const Key('createAccountBtn'));

    expect(posts, 0);
    expect(find.textContaining('É preciso aceitar os Termos'), findsOneWidget);
  });

  testWidgets('accepting sends acceptedTerms to the server', (tester) async {
    String? body;
    final client = MockClient((req) async {
      if (req.url.path == '/auth/register') {
        body = req.body;
        return http.Response('{}', 201);
      }
      return http.Response('[]', 200);
    });

    await tester.pumpWidget(screenWith(client));
    await fillForm(tester);
    await tap(tester, const Key('termsCheckbox'));
    await tap(tester, const Key('createAccountBtn'));

    expect(body, isNotNull);
    final sent = jsonDecode(body!) as Map<String, dynamic>;
    expect(sent['acceptedTerms'], true);
    expect(sent['phone'], '+5511999998888');
  });

  testWidgets('unticking again blocks registration', (tester) async {
    var posts = 0;
    final client = MockClient((_) async {
      posts++;
      return http.Response('{}', 201);
    });

    await tester.pumpWidget(screenWith(client));
    await fillForm(tester);
    await tap(tester, const Key('termsCheckbox'));
    await tap(tester, const Key('termsCheckbox')); // changed their mind
    await tap(tester, const Key('createAccountBtn'));

    expect(posts, 0);
  });
}
