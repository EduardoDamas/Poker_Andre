import 'package:flutter_test/flutter_test.dart';
import 'package:capa_contest/engine/evaluator.dart';
import 'package:capa_contest/engine/poker_hand.dart';
import 'package:capa_contest/engine/side_pots.dart';

List<String> c(String s) => s.trim().split(RegExp(r'\s+'));

void playPassive(PokerHand h) {
  var guard = 0;
  while (!h.isComplete && guard++ < 100) {
    final id = h.actingPlayerId;
    if (id == null) break;
    final legal = h.legalActions();
    h.act(id, legal.contains('check') ? 'check' : 'call');
  }
}

void main() {
  group('evaluator (Dart port)', () {
    test('detects categories', () {
      expect(evaluate(c('As Ks Qs Js Ts 2h 3d')).category, HandCategory.straightFlush);
      expect(evaluate(c('Ah Ad As Ac Kd 2h 3s')).category, HandCategory.fourOfAKind);
      expect(evaluate(c('Kh Kd Ks Qc Qd 2h 3s')).category, HandCategory.fullHouse);
      expect(evaluate(c('Ah Kh 9h 5h 2h 7d 8c')).category, HandCategory.flush);
      expect(evaluate(c('9d 8s 7h 6c 5d Ah Kh')).category, HandCategory.straight);
      expect(evaluate(c('Th Td 8s 5c 2d 9h 3s')).category, HandCategory.pair);
    });

    test('A-2-3-4-5 wheel is a 5-high straight', () {
      final r = evaluate(c('Ah 2d 3s 4c 5h Kd Qs'));
      expect(r.category, HandCategory.straight);
      expect(r.key[1], 5);
    });

    test('ordering: AA beats KK; flush beats straight', () {
      expect(compareKeys(evaluate(c('Ah Ad 2s 7c 9d 3h 4s')).key,
              evaluate(c('Kh Kd 2s 7c 9d 3h 4s')).key) > 0, true);
      expect(compareKeys(evaluate(c('Ah Kh 9h 5h 2h 7d 8c')).key,
              evaluate(c('9d 8s 7h 6c 5d Ah Kh')).key) > 0, true);
    });
  });

  group('side pots (Dart port)', () {
    test('conserves chips', () {
      final r = buildSidePots({'a': 100, 'b': 100, 'c': 40}, []);
      final total = r.pots.fold(0, (s, p) => s + p.amount) + r.refunds.values.fold(0, (s, v) => s + v);
      expect(total, 240);
    });
  });

  group('PokerHand (Dart port)', () {
    test('heads-up plays to showdown; chips conserved; best hand wins', () {
      final deck = [
        'As', 'Ah', 'Kd', 'Kc', '2d', '2c', '7d', '9s', '3h', 'Jh', '5c', '4s',
        ...List.filled(40, '2c'),
      ];
      final h = PokerHand(
        [(id: 'p0', stack: 100), (id: 'p1', stack: 100)],
        smallBlind: 1, bigBlind: 2, deck: deck,
      );
      playPassive(h);
      expect(h.isComplete, true);
      final out = h.result();
      final sum = out.finalStacks.values.fold(0, (s, v) => s + v);
      expect(sum, 200); // conserved
      expect(out.finalStacks['p0']! > 100, true); // AA wins
    });

    test('3-handed completes and conserves', () {
      final h = PokerHand(
        [(id: 'p0', stack: 100), (id: 'p1', stack: 100), (id: 'p2', stack: 100)],
        smallBlind: 1, bigBlind: 2,
      );
      playPassive(h);
      expect(h.isComplete, true);
      expect(h.result().finalStacks.values.fold(0, (s, v) => s + v), 300);
    });
  });
}
