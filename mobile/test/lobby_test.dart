import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/api/tables_api.dart';
import 'package:capa_contest/screens/lobby_screen.dart';
import 'package:capa_contest/theme.dart';

/// F2 gate — lobby renders the table list from the backend.
void main() {
  final session = AuthSession(accessToken: 'tok', userId: 'u1', displayName: 'Eduardo');

  Widget lobbyWith(http.Client client) => MaterialApp(
        theme: buildCapaTheme(),
        home: LobbyScreen(session: session, api: TablesApi(client: client)),
      );

  testWidgets('renders the rooms returned by the backend', (tester) async {
    final mock = MockClient((req) async {
      expect(req.headers['authorization'], 'Bearer tok'); // sends the JWT (http lowercases keys)
      // charset=utf-8 so the em-dash/accents decode correctly (the real backend
      // sends this header; http defaults to latin1 without it).
      return http.Response(
        jsonEncode([
          {'id': 'poker-l1', 'name': 'Poker — Nível 1', 'level': 1, 'entryCents': 2000, 'maxSeats': 8, 'players': 0},
          {'id': 'poker-l5', 'name': 'Poker — Nível 5', 'level': 5, 'entryCents': 100000, 'maxSeats': 8, 'players': 3},
        ]),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    await tester.pumpWidget(lobbyWith(mock));
    await tester.pumpAndSettle();

    expect(find.text('Poker — Nível 1'), findsOneWidget);
    expect(find.text('Poker — Nível 5'), findsOneWidget);
    expect(find.text('Entrada R\$ 20,00'), findsOneWidget); // currency formatting
    expect(find.text('Entrada R\$ 1000,00'), findsOneWidget);
    expect(find.text('3/8'), findsOneWidget); // live seat count
  });

  testWidgets('shows an error if the lobby cannot load', (tester) async {
    final mock = MockClient((req) async => http.Response('boom', 500));
    await tester.pumpWidget(lobbyWith(mock));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('lobbyError')), findsOneWidget);
  });
}
