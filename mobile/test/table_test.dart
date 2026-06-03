import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:capa_contest/game/game_connection.dart';
import 'package:capa_contest/game/game_snapshot.dart';
import 'package:capa_contest/screens/table_screen.dart';
import 'package:capa_contest/theme.dart';

/// Test double — drives the table UI with scripted snapshots, no real socket.
class FakeConnection implements GameConnection {
  final _ctrl = StreamController<GameSnapshot>.broadcast();
  GameSnapshot _snap;
  final List<Map<String, dynamic>> acted = [];
  bool disposed = false;

  FakeConnection([this._snap = const GameSnapshot(status: ConnStatus.connected)]);

  void push(GameSnapshot s) {
    _snap = s;
    _ctrl.add(s);
  }

  @override
  Stream<GameSnapshot> get stream => _ctrl.stream;
  @override
  GameSnapshot get current => _snap;
  @override
  void act(String type, {int? amount}) => acted.add({'type': type, 'amount': amount});
  @override
  void dispose() {
    disposed = true;
    _ctrl.close();
  }
}

/// F3 gate — table UI renders game state and dispatches actions.
void main() {
  Widget tableWith(FakeConnection c) =>
      MaterialApp(theme: buildCapaTheme(), home: TableScreen(connection: c));

  testWidgets('renders board, hole cards, and the turn banner', (tester) async {
    final c = FakeConnection(const GameSnapshot(
      status: ConnStatus.connected,
      street: 'flop',
      board: ['As', 'Kd', 'Qh'],
      holeCards: ['Tc', 'Td'],
      actingPlayerId: 'me',
      legalActions: ['fold', 'check'],
      isMyTurn: true,
    ));
    await tester.pumpWidget(tableWith(c));
    await tester.pump();

    expect(find.text('Sua vez'), findsOneWidget);
    // Board + hole cards rendered (10♣ shows as "10♣").
    expect(find.text('A♠'), findsOneWidget);
    expect(find.text('Q♥'), findsOneWidget);
    expect(find.textContaining('10♣'), findsOneWidget);
    // Action buttons for the legal actions.
    expect(find.byKey(const Key('action_fold')), findsOneWidget);
    expect(find.byKey(const Key('action_check')), findsOneWidget);
  });

  testWidgets('tapping an action dispatches it to the connection', (tester) async {
    final c = FakeConnection(const GameSnapshot(
      status: ConnStatus.connected,
      isMyTurn: true,
      legalActions: ['check'],
    ));
    await tester.pumpWidget(tableWith(c));
    await tester.pump();

    await tester.tap(find.byKey(const Key('action_check')));
    await tester.pump();
    expect(c.acted, [
      {'type': 'check', 'amount': null}
    ]);
  });

  testWidgets('hides action buttons when it is not my turn', (tester) async {
    final c = FakeConnection(const GameSnapshot(
      status: ConnStatus.connected,
      isMyTurn: false,
      actingPlayerId: 'someone-else',
      legalActions: ['fold', 'call'],
    ));
    await tester.pumpWidget(tableWith(c));
    await tester.pump();

    expect(find.text('Aguardando...'), findsOneWidget);
    expect(find.byKey(const Key('action_fold')), findsNothing);
  });

  testWidgets('shows the result banner when the hand completes', (tester) async {
    final c = FakeConnection();
    await tester.pumpWidget(tableWith(c));
    await tester.pump();
    c.push(const GameSnapshot(
      status: ConnStatus.connected,
      handComplete: true,
      board: ['As', 'Kd', 'Qh', 'Jc', 'Ts'],
      resultText: 'Você ganhou 200 fichas!',
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('resultBanner')), findsOneWidget);
    expect(find.text('Você ganhou 200 fichas!'), findsOneWidget);
  });

  testWidgets('shows an error state', (tester) async {
    final c = FakeConnection(const GameSnapshot(status: ConnStatus.error, error: 'Não autorizado.'));
    await tester.pumpWidget(tableWith(c));
    await tester.pump();
    expect(find.byKey(const Key('tableError')), findsOneWidget);
  });
}
