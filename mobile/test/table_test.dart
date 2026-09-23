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
  bool left = false;
  @override
  Future<void> leaveTable() async {
    left = true;
  }

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

    expect(find.text('Aguardando…'), findsOneWidget);
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

  testWidgets('a 10-seat final table renders every seat on a phone screen', (tester) async {
    // Portrait phone (~360×780 dp): the densest layout the final table will get.
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final seats = List<SeatInfo?>.generate(
      10,
      (i) => SeatInfo(position: i, userId: 'p$i', hasCards: true, isMe: i == 0),
    );
    final c = FakeConnection(GameSnapshot(
      status: ConnStatus.connected,
      street: 'preflop',
      holeCards: const ['Ah', 'Kh'],
      maxSeats: 10,
      seats: seats,
      actingPlayerId: 'p3',
    ));
    await tester.pumpWidget(tableWith(c));
    await tester.pump();

    expect(tester.takeException(), isNull); // no overflow, no range error at seat 9
    // One avatar per occupied seat — all ten are drawn.
    expect(find.image(const AssetImage('assets/characters/avatars/chr-avatar-default.png')),
        findsNWidgets(10));
  });
  group('promotion bracket', () {
    testWidgets('the waiting room shows places against the minimum and the start time', (tester) async {
      final startsAt = DateTime.now().add(const Duration(minutes: 20));
      final hhmm = '${startsAt.hour.toString().padLeft(2, '0')}:${startsAt.minute.toString().padLeft(2, '0')}';
      final c = FakeConnection(GameSnapshot(
        status: ConnStatus.connected,
        lobby: PromoLobby(
          registered: 37,
          minPlayers: 80,
          maxPlayers: 100,
          startsAt: startsAt,
          startAnywayAt: startsAt.add(const Duration(minutes: 30)),
        ),
      ));
      await tester.pumpWidget(tableWith(c));
      await tester.pump();

      expect(find.text('O torneio começa às $hhmm'), findsOneWidget);
      expect(find.text('Inscritos: 37 · mínimo 80 · 100 vagas'), findsOneWidget);
      expect(find.textContaining('Faltam'), findsOneWidget);
      expect(find.textContaining('só joga quem estiver na sala'), findsOneWidget);
      expect(find.textContaining('Se não completar'), findsOneWidget);
      await tester.pumpWidget(const SizedBox()); // stop the clocks
    });

    testWidgets('past the start, below the minimum, it says what it waits for', (tester) async {
      final c = FakeConnection(GameSnapshot(
        status: ConnStatus.connected,
        lobby: PromoLobby(
          registered: 60,
          minPlayers: 80,
          maxPlayers: 100,
          startsAt: DateTime.now().subtract(const Duration(minutes: 5)),
        ),
      ));
      await tester.pumpWidget(tableWith(c));
      await tester.pump();

      expect(find.text('Aguardando o mínimo de 80 inscritos'), findsOneWidget);
      expect(find.textContaining('Se não completar'), findsNothing); // no tolerance set
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('names the stage once seated in the bracket', (tester) async {
      final c = FakeConnection(const GameSnapshot(
        status: ConnStatus.connected,
        stage: 'Mesa final',
        holeCards: ['Ah', 'Kh'],
      ));
      await tester.pumpWidget(tableWith(c));
      await tester.pump();

      expect(find.text('MESA FINAL'), findsOneWidget);
      expect(find.byKey(const Key('waitingHeadline')), findsNothing);
    });

    testWidgets('a winner waiting for the other tables is told, without a way out', (tester) async {
      final c = FakeConnection(const GameSnapshot(
        status: ConnStatus.connected,
        stage: 'Rodada 1',
        notice: 'Você venceu sua mesa! 🎉\nAguardando 3 mesas terminarem…',
      ));
      await tester.pumpWidget(tableWith(c));
      await tester.pump();

      expect(find.byKey(const Key('tournamentNotice')), findsOneWidget);
      expect(find.textContaining('Aguardando 3 mesas'), findsOneWidget);
      expect(find.byKey(const Key('noticeLeave')), findsNothing); // leaving would forfeit
    });

    testWidgets('a knocked-out player sees their place and can leave', (tester) async {
      final c = FakeConnection(const GameSnapshot(
        status: ConnStatus.connected,
        stage: 'Rodada 1',
        out: true,
        notice: 'Você foi eliminado.\nVocê ficou em 37º lugar entre 80.\nObrigado por participar!',
      ));
      await tester.pumpWidget(tableWith(c));
      await tester.pump();

      expect(find.textContaining('37º lugar entre 80'), findsOneWidget);
      await tester.tap(find.byKey(const Key('noticeLeave')));
      await tester.pumpAndSettle();
      expect(c.left, isTrue);
    });

    testWidgets('between hands a player still in the bracket is not offered to leave', (tester) async {
      final c = FakeConnection(const GameSnapshot(
        status: ConnStatus.connected,
        stage: 'Rodada 1',
        handComplete: true,
        resultText: 'Você venceu sua mesa! 🎉',
      ));
      await tester.pumpWidget(tableWith(c));
      await tester.pump();

      expect(find.byKey(const Key('leaveTable')), findsNothing);
      expect(find.byKey(const Key('bracketNext')), findsOneWidget);
    });

    testWidgets('on a clocked table my turn counts down', (tester) async {
      final c = FakeConnection(GameSnapshot(
        status: ConnStatus.connected,
        stage: 'Rodada 1',
        holeCards: const ['Ah', 'Kh'],
        isMyTurn: true,
        actingPlayerId: 'me',
        legalActions: const ['fold', 'call'],
        turnDeadline: DateTime.now().add(const Duration(seconds: 30)),
      ));
      await tester.pumpWidget(tableWith(c));
      await tester.pump();

      expect(find.textContaining(RegExp(r'^Sua vez · (29|30)s$')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });
}
