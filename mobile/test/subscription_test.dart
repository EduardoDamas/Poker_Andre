import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/api/payments_api.dart';
import 'package:capa_contest/screens/tournaments_screen.dart';
import 'package:capa_contest/theme.dart';

/// Buying a plan: tapping it registers the request, then the plan shows as
/// awaiting confirmation (the merchant's links are confirmed by an admin).
void main() {
  final session = AuthSession(accessToken: 'jwt', userId: 'u1', displayName: 'Eduardo');

  final plans = [
    {'plan': 'MONTHLY', 'priceCents': '20000', 'cardPriceCents': '25000'},
    {'plan': 'ANNUAL', 'priceCents': '120000', 'cardPriceCents': '150000'},
  ];
  final entries = [
    {'level': 1, 'subscriber': false, 'method': 'card', 'amountCents': 2500, 'url': 'https://pay/1'},
  ];

  Widget screenWith(http.Client paymentsClient, http.Client authClient) => MaterialApp(
        theme: buildCapaTheme(),
        home: TournamentsScreen(
          session: session,
          authApi: AuthApi(client: authClient),
          paymentsApi: PaymentsApi(client: paymentsClient),
        ),
      );

  testWidgets('tapping a plan registers the purchase and shows the pending state',
      (tester) async {
    final posted = <String>[];
    var requests = <Map<String, dynamic>>[];

    final payments = MockClient((req) async {
      if (req.url.path == '/payments/tournament-entries') return http.Response(jsonEncode(entries), 200);
      if (req.url.path == '/payments/subscriptions') return http.Response(jsonEncode(plans), 200);
      if (req.url.path == '/payments/subscription-requests') return http.Response(jsonEncode(requests), 200);
      if (req.url.path == '/payments/subscription-request' && req.method == 'POST') {
        posted.add(req.body);
        final created = {
          'id': 's1',
          'plan': jsonDecode(req.body)['plan'],
          'amountCents': '150000',
          'status': 'REQUESTED',
          'url': 'https://link.infinitepay.io/andre-luiz-g4j/x-1500,00',
        };
        requests = [created];
        return http.Response(jsonEncode(created), 201);
      }
      return http.Response('not found', 404);
    });
    final auth = MockClient((req) async =>
        http.Response(jsonEncode({'subscription': 'NONE', 'balanceCents': '0'}), 200));

    await tester.pumpWidget(screenWith(payments, auth));
    await tester.pumpAndSettle();

    // The plans sit below the room list — scroll them into view.
    await tester.scrollUntilVisible(find.text('Anual'), 200);
    await tester.pumpAndSettle();
    expect(find.text('R\$ 1.500,00'), findsOneWidget); // card price

    await tester.tap(find.text('Anual'));
    await tester.pumpAndSettle();

    expect(posted, ['{"plan":"ANNUAL"}']);
    expect(find.textContaining('liberado assim que confirmarmos'), findsOneWidget);

    await tester.tap(find.text('Entendi'));
    await tester.pumpAndSettle();
    expect(find.text('Aguardando confirmação do pagamento'), findsOneWidget);
  });

  testWidgets('an already-open request shows as pending on load', (tester) async {
    final payments = MockClient((req) async {
      if (req.url.path == '/payments/tournament-entries') return http.Response(jsonEncode(entries), 200);
      if (req.url.path == '/payments/subscriptions') return http.Response(jsonEncode(plans), 200);
      if (req.url.path == '/payments/subscription-requests') {
        return http.Response(
          jsonEncode([
            {'id': 's1', 'plan': 'MONTHLY', 'amountCents': '25000', 'status': 'REQUESTED', 'url': 'https://pay/m'},
            {'id': 's0', 'plan': 'ANNUAL', 'amountCents': '150000', 'status': 'REJECTED', 'url': 'https://pay/a'},
          ]),
          200,
        );
      }
      return http.Response('not found', 404);
    });
    final auth = MockClient((req) async =>
        http.Response(jsonEncode({'subscription': 'NONE', 'balanceCents': '0'}), 200));

    await tester.pumpWidget(screenWith(payments, auth));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Mensal'), 200);
    await tester.pumpAndSettle();

    // Only the open (REQUESTED) one is marked pending.
    expect(find.text('Aguardando confirmação do pagamento'), findsOneWidget);
  });
}
