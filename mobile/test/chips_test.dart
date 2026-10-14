import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:capa_contest/engine/poker_hand.dart';
import 'package:capa_contest/game/game_connection.dart';
import 'package:capa_contest/game/game_events.dart';
import 'package:capa_contest/game/game_snapshot.dart';
import 'package:capa_contest/screens/table_screen.dart';
import 'package:capa_contest/theme.dart';
import 'package:capa_contest/widgets/chips.dart';

/// Chips on the table (client, 2026-10): everyone's stack, the bets in front
/// of them, the pot, and the chips moving between them.
void main() {
  const ev = GameEvents('me');
  const connected = GameSnapshot(status: ConnStatus.connected);

  group('chip counts', () {
    test('Brazilian thousands, K past 99.999', () {
      expect(chipCount(0), '0');
      expect(chipCount(975), '975');
      expect(chipCount(1450), '1.450');
      expect(chipCount(12500), '12.500');
      expect(chipCount(125000), '125K');
    });
  });

  group('events', () {
    test('game:state brings stacks, bets, the pot and who folded', () {
      final s = ev.gameState(connected, {
        'street': 'flop',
        'board': ['As', 'Kd', '7h'],
        'actingPlayerId': 'me',
        'legalActions': ['call'],
        'stacks': {'me': 850, 'op': 700},
        'bets': {'op': 150},
        'pot': 300,
        'folded': ['x'],
      });
      expect(s.stacks, {'me': 850, 'op': 700});
      expect(s.bets, {'op': 150});
      expect(s.pot, 300);
      expect(s.folded, {'x'});
    });

    test('a server without chips leaves them as they were', () {
      final before = connected.copyWith(stacks: {'me': 1000});
      final s = ev.gameState(before, {'street': 'preflop', 'actingPlayerId': 'op'});
      expect(s.stacks, {'me': 1000});
      expect(s.pot, 0);
    });

    test('the hand result books the final stacks, clears the bets and says who won what', () {
      final mid = connected.copyWith(stacks: {'me': 850, 'op': 700}, bets: {'op': 150}, pot: 300);
      final s = ev.handResult(mid, {
        'board': ['As', 'Kd', '7h', '2c', '9s'],
        'payouts': {'me': 600, 'op': 0},
        'finalStacks': {'me': 1450, 'op': 550},
      });
      expect(s.stacks, {'me': 1450, 'op': 550});
      expect(s.bets, isEmpty);
      expect(s.pot, 0);
      expect(s.payouts, {'me': 600}); // only winners
    });

    test('a new hand keeps the stacks, with nothing in front or in the pot', () {
      final done = connected.copyWith(stacks: {'me': 1450}, payouts: {'me': 600}, folded: {'op'});
      final s = ev.hole(done, {
        'cards': ['Ah', 'Kh']
      });
      expect(s.stacks, {'me': 1450});
      expect(s.payouts, isEmpty);
      expect(s.folded, isEmpty);
      expect(s.bets, isEmpty);
    });

    test('table:state can carry the stacks while waiting between hands', () {
      final s = ev.tableState(connected, {
        'maxSeats': 8,
        'seats': [
          {'position': 0, 'userId': 'me', 'hasCards': false}
        ],
        'stacks': {'me': 3000},
      });
      expect(s.stacks, {'me': 3000});
    });
  });

  group('solo engine', () {
    test('chips: blinds in front, then swept into the pot, totals conserved', () {
      final h = PokerHand([(id: 'a', stack: 100), (id: 'b', stack: 100)], smallBlind: 1, bigBlind: 2);
      expect(h.chips.bets, {'a': 1, 'b': 2});
      expect(h.chips.pot, 0);
      h.act('a', 'call');
      h.act('b', 'check');
      final c = h.chips;
      expect(c.bets, isEmpty);
      expect(c.pot, 4);
      expect(c.stacks.values.fold(0, (x, y) => x + y) + c.pot, 200);
    });
  });

  group('table', () {
    const seats = [
      SeatInfo(position: 0, userId: 'me', hasCards: true, isMe: true),
      SeatInfo(position: 4, userId: 'op', hasCards: true),
    ];

    Widget tableWith(_Fake c) => MaterialApp(theme: buildCapaTheme(), home: TableScreen(connection: c));

    testWidgets('shows each stack, the bets in front and the pot', (tester) async {
      final c = _Fake(const GameSnapshot(
        status: ConnStatus.connected,
        street: 'flop',
        board: ['As', 'Kd', '7h'],
        holeCards: ['Qs', 'Qh'],
        maxSeats: 8,
        seats: seats,
        actingPlayerId: 'op',
        stacks: {'me': 1450, 'op': 820},
        bets: {'op': 200},
        pot: 650,
      ));
      await tester.pumpWidget(tableWith(c));
      await tester.pump(const Duration(seconds: 1)); // stack plates count to their value

      expect(find.text('1.450'), findsOneWidget);
      expect(find.text('820'), findsOneWidget);
      expect(find.text('200'), findsOneWidget); // the bet
      expect(find.text('Pote 650'), findsOneWidget);
      expect(find.text('Jogador'), findsNothing); // the chip plate replaces it
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('chips fly from the seat to the bet, then into the pot, then to the winner', (tester) async {
      final c = _Fake(const GameSnapshot(
        status: ConnStatus.connected,
        street: 'river',
        board: ['As', 'Kd', '7h', '2c', '9s'],
        holeCards: ['Qs', 'Qh'],
        maxSeats: 8,
        seats: seats,
        actingPlayerId: 'op',
        stacks: {'me': 1000, 'op': 1000},
        pot: 400,
      ));
      await tester.pumpWidget(tableWith(c));
      await tester.pump();
      final piles = find.byType(ChipPile);
      final before = tester.widgetList(piles).length;

      // The opponent bets 300: a pile slides out to its bet spot.
      c.push(c.current.copyWith(stacks: {'me': 1000, 'op': 700}, bets: {'op': 300}, actingPlayerId: 'me'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.widgetList(piles).length, before + 2); // the bet label + a flying pile
      await tester.pump(const Duration(milliseconds: 500));
      expect(tester.widgetList(piles).length, before + 1); // landed: just the bet

      // I win the hand: the bet sweeps to the pot, then the pot comes to me.
      c.push(c.current.copyWith(
        street: 'complete',
        handComplete: true,
        resultText: 'Você venceu a mão!',
        stacks: {'me': 1700, 'op': 700},
        bets: const {},
        pot: 0,
        payouts: {'me': 700},
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.widgetList(piles).length, before + 2); // to the pot, and (waiting) to me
      await tester.pump(const Duration(seconds: 1));
      expect(tester.widgetList(piles).length, before); // all landed
      expect(find.text('1.700'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });
}

class _Fake implements GameConnection {
  final _ctrl = StreamController<GameSnapshot>.broadcast();
  GameSnapshot _snap;
  _Fake(this._snap);
  void push(GameSnapshot s) {
    _snap = s;
    _ctrl.add(s);
  }

  @override
  Stream<GameSnapshot> get stream => _ctrl.stream;
  @override
  GameSnapshot get current => _snap;
  @override
  void act(String type, {int? amount}) {}
  @override
  Future<void> leaveTable() async {}
  @override
  void dispose() => _ctrl.close();
}
