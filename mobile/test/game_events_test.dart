import 'package:flutter_test/flutter_test.dart';

import 'package:capa_contest/game/game_events.dart';
import 'package:capa_contest/game/game_snapshot.dart';

/// How server events become what the player sees — including the promotion
/// bracket's waiting room, table moves and knockouts (client, 2026-09-22).
void main() {
  const ev = GameEvents('me');
  const connected = GameSnapshot(status: ConnStatus.connected);

  group('promotion bracket', () {
    test('reads the waiting room: places, minimum and start time', () {
      final s = ev.lobby(connected, {
        'registered': 37,
        'minPlayers': 80,
        'maxPlayers': 100,
        'startsAt': '2026-10-07T23:00:00.000Z',
        'startAnywayAt': '2026-10-07T23:30:00.000Z',
      });
      expect(s.lobby!.registered, 37);
      expect(s.lobby!.minPlayers, 80);
      expect(s.lobby!.maxPlayers, 100);
      expect(s.lobby!.startsAt.toUtc(), DateTime.utc(2026, 10, 7, 23));
      expect(s.lobby!.startAnywayAt!.toUtc(), DateTime.utc(2026, 10, 7, 23, 30));
    });

    test('a start with no tolerance has no "start anyway" time', () {
      final s = ev.lobby(connected, {
        'registered': 1, 'minPlayers': 80, 'maxPlayers': 100,
        'startsAt': '2026-10-07T23:00:00.000Z', 'startAnywayAt': null,
      });
      expect(s.lobby!.startAnywayAt, isNull);
    });

    test('moving to a table clears the old one and names the round', () {
      final before = connected.copyWith(
        holeCards: ['As', 'Ad'],
        board: ['2c', '3d', '4h'],
        handComplete: true,
        resultText: 'Você venceu sua mesa! 🎉',
        notice: 'Você venceu sua mesa! 🎉\nAguardando 2 mesas terminarem…',
        maxSeats: 8,
        seats: const [SeatInfo(position: 0, userId: 'me', isMe: true)],
      );
      final s = ev.movedToTable(before, {'tableId': 't9', 'round': 2, 'final': true});
      expect(s.stage, 'Mesa final');
      expect(s.notice, isNull);
      expect(s.holeCards, isEmpty);
      expect(s.board, isEmpty);
      expect(s.handComplete, isFalse);
      expect(s.seats, isEmpty); // the new table's state follows
      expect(ev.movedToTable(connected, {'round': 1, 'final': false}).stage, 'Rodada 1');
    });

    test('winning a table: says so, and how many tables are still playing', () {
      expect(ev.advanced(connected, {'tablesLeft': 3}).notice,
          'Você venceu sua mesa! 🎉\nAguardando 3 mesas terminarem…');
      expect(ev.advanced(connected, {'tablesLeft': 1}).notice, contains('Aguardando 1 mesa terminar'));
      expect(ev.advanced(connected, {'tablesLeft': 0}).notice, contains('Preparando a próxima mesa'));
    });

    test('knocked out: out for good, with the place they finished in', () {
      final s = ev.eliminated(connected.copyWith(isMyTurn: true), {'place': 37, 'players': 80});
      expect(s.out, isTrue);
      expect(s.isMyTurn, isFalse);
      expect(s.notice, contains('Você foi eliminado.'));
      expect(s.notice, contains('37º lugar entre 80'));
    });

    test('the bracket context survives new hands and results', () {
      final seated = ev.movedToTable(connected, {'round': 1, 'final': false});
      final dealt = ev.hole(seated, {'cards': ['Kh', 'Kd']});
      expect(dealt.stage, 'Rodada 1');
      final done = ev.handResult(dealt, {'board': [], 'payouts': {}, 'tournament': {'over': false, 'remaining': 5}});
      expect(done.stage, 'Rodada 1');
      final out = ev.eliminated(done, {'place': 12});
      expect(ev.hole(out, {'cards': ['2c', '7d']}).out, isTrue);
    });

    test('a table played down to one: the winner is told, not that the tournament is won', () {
      final won = ev.handResult(connected, {
        'board': [], 'payouts': {'me': 3000},
        'tournament': {'over': false, 'remaining': 1, 'tableWinnerId': 'me'},
      });
      expect(won.resultText, 'Você venceu sua mesa! 🎉');
      expect(won.prizeCents, isNull);
      final lost = ev.handResult(connected, {
        'board': [], 'payouts': {},
        'tournament': {'over': false, 'remaining': 1, 'tableWinnerId': 'other'},
      });
      expect(lost.resultText, 'Mesa encerrada.');
    });

    test('the champion sees the prize; others still playing are told it is over', () {
      final champ = ev.handResult(connected, {
        'board': [], 'payouts': {'me': 9000},
        'tournament': {'over': true, 'remaining': 1, 'winnerId': 'me', 'prizeCents': 50000},
      });
      expect(champ.prizeCents, 50000);
      expect(champ.resultText, contains('Você venceu o torneio'));
      expect(ev.champion(champ, {'winnerId': 'me'}).notice, isNull);

      expect(ev.champion(connected, {'winnerId': 'other'}).notice, contains('O torneio terminou'));
      final out = ev.eliminated(connected, {'place': 4, 'players': 80});
      expect(ev.champion(out, {'winnerId': 'other'}).notice, contains('4º lugar')); // keeps their place
    });
  });

  test('leaving is only offered once out or when it is all over', () {
    final seated = ev.movedToTable(connected, {'round': 1, 'final': false});
    expect(seated.inBracket, isTrue);
    expect(ev.eliminated(seated, {'place': 9}).inBracket, isFalse);
    final champ = ev.handResult(seated, {
      'board': [], 'payouts': {}, 'tournament': {'over': true, 'remaining': 1, 'winnerId': 'me'},
    });
    expect(champ.inBracket, isFalse);
    expect(ev.champion(seated, {'winnerId': 'other'}).inBracket, isFalse);
    expect(connected.inBracket, isFalse); // an ordinary table
  });

  group('turn clock', () {
    final now = DateTime(2026, 10, 7, 20);

    test('my turn on a clocked table sets the deadline', () {
      final s = ev.gameState(connected,
          {'actingPlayerId': 'me', 'legalActions': ['fold', 'call'], 'turnMs': 30000}, now: now);
      expect(s.isMyTurn, isTrue);
      expect(s.turnDeadline, now.add(const Duration(seconds: 30)));
    });

    test("someone else's turn, or a table without a clock, has none", () {
      final mine = ev.gameState(connected, {'actingPlayerId': 'me', 'turnMs': 30000}, now: now);
      expect(ev.gameState(mine, {'actingPlayerId': 'other', 'turnMs': 30000}, now: now).turnDeadline, isNull);
      expect(ev.gameState(connected, {'actingPlayerId': 'me'}, now: now).turnDeadline, isNull);
    });

    test('the hand ending clears it', () {
      final mine = ev.gameState(connected, {'actingPlayerId': 'me', 'turnMs': 30000}, now: now);
      expect(ev.handResult(mine, {'board': [], 'payouts': {}}).turnDeadline, isNull);
    });
  });

  group('ordinary tables are unchanged', () {
    test('hole cards start a fresh hand, keeping the seats', () {
      final seated = ev.tableState(connected, {
        'maxSeats': 8,
        'seats': [
          {'position': 0, 'userId': 'me', 'hasCards': false},
          null,
        ],
      });
      expect(seated.seats.first!.isMe, isTrue);
      final dealt = ev.hole(seated.copyWith(resultText: 'old'), {'cards': ['As', 'Ks']});
      expect(dealt.holeCards, ['As', 'Ks']);
      expect(dealt.resultText, isNull);
      expect(dealt.seats, hasLength(2));
    });

    test('tournament hand results read as before', () {
      final s = ev.handResult(connected, {
        'board': [], 'payouts': {'me': 200}, 'tournament': {'over': false, 'remaining': 4},
      });
      expect(s.resultText, 'Você venceu a mão! (4 jogadores restantes)');
      expect(ev.handResult(connected, {'board': [], 'payouts': {'me': 200}}).resultText, 'Você ganhou 200 fichas!');
    });
  });
}
