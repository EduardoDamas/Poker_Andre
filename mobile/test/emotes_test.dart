import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:capa_contest/game/game_connection.dart';
import 'package:capa_contest/game/game_events.dart';
import 'package:capa_contest/game/game_snapshot.dart';
import 'package:capa_contest/game/local_connection.dart';
import 'package:capa_contest/screens/table_screen.dart';
import 'package:capa_contest/theme.dart';
import 'package:capa_contest/widgets/emotes.dart';

/// Quick reactions at the table (client, 2026-10).
void main() {
  const seats = [
    SeatInfo(position: 0, userId: 'me', hasCards: true, isMe: true),
    SeatInfo(position: 4, userId: 'op', hasCards: true),
  ];
  const table = GameSnapshot(
    status: ConnStatus.connected,
    street: 'flop',
    board: ['As', 'Kd', '7h'],
    holeCards: ['Qs', 'Qh'],
    maxSeats: 8,
    seats: seats,
    actingPlayerId: 'op',
    stacks: {'me': 1000, 'op': 1000},
  );

  Widget tableWith(_Fake c) => MaterialApp(theme: buildCapaTheme(), home: TableScreen(connection: c));

  test('the set matches the server: 13 friendly reactions, each with a name', () {
    expect(emotes.keys, [
      'wave', 'smile', 'laugh', 'wow', 'sweat', 'think', 'cool', 'sad', 'clap', 'thumbs', 'fire', 'luck', 'capa',
    ]);
    expect(emoteLabels.keys.toSet(), emotes.keys.toSet());
  });

  test('table:emote becomes a new reaction each time, even the same one again', () {
    const ev = GameEvents('me');
    final a = ev.emote(table, {'tableId': 't', 'userId': 'op', 'emote': 'laugh'});
    final b = ev.emote(a, {'tableId': 't', 'userId': 'op', 'emote': 'laugh'});
    expect(a.emote!.userId, 'op');
    expect(a.emote!.emote, 'laugh');
    expect(identical(a.emote, b.emote), isFalse);
  });

  testWidgets('pick a reaction: it is sent, and the button rests for a few seconds', (tester) async {
    final c = _Fake(table);
    await tester.pumpWidget(tableWith(c));
    await tester.pump();

    await tester.tap(find.byKey(const Key('emoteBtn')));
    await tester.pumpAndSettle();
    expect(find.text('Reagir'), findsOneWidget);
    await tester.tap(find.byKey(const Key('emote_clap')));
    await tester.pumpAndSettle();
    expect(c.emoted, ['clap']);

    // Resting: a second tap opens nothing.
    await tester.tap(find.byKey(const Key('emoteBtn')));
    await tester.pumpAndSettle();
    expect(find.text('Reagir'), findsNothing);
    await tester.pump(const Duration(seconds: 3));
    await tester.tap(find.byKey(const Key('emoteBtn')));
    await tester.pumpAndSettle();
    expect(find.text('Reagir'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets("someone's reaction pops up over their seat, then goes", (tester) async {
    final c = _Fake(table);
    await tester.pumpWidget(tableWith(c));
    await tester.pump();

    c.push(c.current.copyWith(emote: TableEmote('op', 'fire')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('🔥'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('🔥'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('no reactions button while waiting for the table to fill', (tester) async {
    final c = _Fake(const GameSnapshot(
      status: ConnStatus.connected,
      maxSeats: 8,
      seats: [SeatInfo(position: 0, userId: 'me', isMe: true)],
    ));
    await tester.pumpWidget(tableWith(c));
    await tester.pump();
    expect(find.byKey(const Key('emoteBtn')), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  test('solo game: my reaction shows at once', () async {
    final local = LocalGameConnection(userId: 'me');
    local.emote('cool');
    expect(local.current.emote?.emote, 'cool');
    expect(local.current.emote?.userId, 'me');
    local.dispose();
  });
}

class _Fake implements GameConnection {
  final _ctrl = StreamController<GameSnapshot>.broadcast();
  GameSnapshot _snap;
  final emoted = <String>[];
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
  void emote(String id) => emoted.add(id);
  @override
  Future<void> leaveTable() async {}
  @override
  void dispose() => _ctrl.close();
}
