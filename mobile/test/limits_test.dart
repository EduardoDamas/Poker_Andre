import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/api/limits_api.dart';
import 'package:capa_contest/screens/limits_screen.dart';
import 'package:capa_contest/theme.dart';

/// Jogo responsável — the player's own deposit ceilings and self-exclusion.
void main() {
  final session = AuthSession(accessToken: 'jwt', userId: 'u1', displayName: 'Eduardo');

  Map<String, dynamic> limitsJson({
    String? daily,
    Map<String, dynamic>? pending,
    String? excludedUntil,
    String usedDaily = '0',
  }) =>
      {
        'dailyCents': daily,
        'weeklyCents': null,
        'monthlyCents': null,
        'pending': pending,
        'selfExcludedUntil': excludedUntil,
        'selfExcluded': excludedUntil != null,
        'used': {'daily': usedDaily, 'weekly': usedDaily, 'monthly': usedDaily},
      };

  Widget screenWith(http.Client client) => MaterialApp(
        theme: buildCapaTheme(),
        home: LimitsScreen(session: session, limitsApi: LimitsApi(client: client)),
      );

  testWidgets('shows the current ceiling and what has been used', (tester) async {
    final client = MockClient((req) async =>
        http.Response(jsonEncode(limitsJson(daily: '50000', usedDaily: '20000')), 200));

    await tester.pumpWidget(screenWith(client));
    await tester.pumpAndSettle();

    expect(find.text('Limite diário'), findsOneWidget);
    expect(find.textContaining('R\$ 500,00'), findsOneWidget);
    expect(find.textContaining('já usado: R\$ 200,00'), findsOneWidget);
    expect(find.textContaining('Sem limite'), findsNWidgets(2)); // weekly + monthly
  });

  testWidgets('saving a limit sends it in cents', (tester) async {
    String? body;
    final client = MockClient((req) async {
      if (req.method == 'PUT') {
        body = req.body;
        return http.Response(jsonEncode(limitsJson(daily: '30000')), 200);
      }
      return http.Response(jsonEncode(limitsJson()), 200);
    });

    await tester.pumpWidget(screenWith(client));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Limite diário'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '300,00');
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(body, '{"dailyCents":30000}');
    expect(find.text('Limite salvo.'), findsOneWidget);
  });

  testWidgets('dismissing the dialog does NOT clear the limit', (tester) async {
    var puts = 0;
    final client = MockClient((req) async {
      if (req.method == 'PUT') puts++;
      return http.Response(jsonEncode(limitsJson(daily: '50000')), 200);
    });

    await tester.pumpWidget(screenWith(client));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Limite diário'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();

    expect(puts, 0);
  });

  testWidgets('removing a limit sends null', (tester) async {
    String? body;
    final client = MockClient((req) async {
      if (req.method == 'PUT') {
        body = req.body;
        return http.Response(jsonEncode(limitsJson()), 200);
      }
      return http.Response(jsonEncode(limitsJson(daily: '50000')), 200);
    });

    await tester.pumpWidget(screenWith(client));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Limite diário'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remover limite'));
    await tester.pumpAndSettle();

    expect(body, '{"dailyCents":null}');
  });

  testWidgets('a pending raise is shown with the date it lands', (tester) async {
    final when = DateTime.now().add(const Duration(hours: 24));
    final client = MockClient((req) async => http.Response(
        jsonEncode(limitsJson(
          daily: '20000',
          pending: {
            'dailyCents': '90000',
            'weeklyCents': null,
            'monthlyCents': null,
            'effectiveAt': when.toUtc().toIso8601String(),
          },
        )),
        200));

    await tester.pumpWidget(screenWith(client));
    await tester.pumpAndSettle();

    expect(find.textContaining('Aumento solicitado'), findsOneWidget);
    expect(find.textContaining('Até lá vale o limite atual'), findsOneWidget);
  });

  testWidgets('self-exclusion shows a banner and hides the button', (tester) async {
    final until = DateTime.now().add(const Duration(days: 7));
    final client = MockClient((req) async => http.Response(
        jsonEncode(limitsJson(excludedUntil: until.toUtc().toIso8601String())), 200));

    await tester.pumpWidget(screenWith(client));
    await tester.pumpAndSettle();

    expect(find.textContaining('Autoexclusão ativa até'), findsOneWidget);
    expect(find.text('Ativar autoexclusão'), findsNothing);
  });

  testWidgets('activating self-exclusion asks first, then posts the period', (tester) async {
    String? posted;
    var excluded = false;
    final client = MockClient((req) async {
      if (req.method == 'POST') {
        posted = req.body;
        excluded = true;
        return http.Response(
            jsonEncode(limitsJson(
                excludedUntil: DateTime.now().add(const Duration(days: 30)).toUtc().toIso8601String())),
            201);
      }
      return http.Response(
          jsonEncode(excluded
              ? limitsJson(excludedUntil: DateTime.now().toUtc().toIso8601String())
              : limitsJson()),
          200);
    });

    await tester.pumpWidget(screenWith(client));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Ativar autoexclusão'));
    await tester.pumpAndSettle();
    expect(find.textContaining('não poderá depositar'), findsOneWidget);

    await tester.tap(find.text('30 dias'));
    await tester.pumpAndSettle();

    expect(posted, '{"days":30}');
    expect(find.textContaining('Autoexclusão ativa até'), findsOneWidget);
  });

  testWidgets('shows the backend message when a limit blocks the change', (tester) async {
    final client = MockClient((req) async {
      if (req.method == 'PUT') {
        return http.Response(
            jsonEncode({'message': 'O limite dailyCents deve ser maior que zero.'}), 400);
      }
      return http.Response(jsonEncode(limitsJson(daily: '50000')), 200);
    });

    await tester.pumpWidget(screenWith(client));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Limite diário'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '100,00');
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(find.textContaining('deve ser maior que zero'), findsOneWidget);
  });
}
