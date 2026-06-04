import 'dart:math';
import 'evaluator.dart';

enum BotDifficulty { easy, medium, hard }

/// Simple, rule-following poker AI. Decides by hand strength + difficulty.
/// The caller (LocalGameConnection) validates and falls back to a safe action
/// if a chosen move is somehow illegal, so the hand always progresses.
class Bot {
  final BotDifficulty difficulty;
  final Random _rng;
  Bot(this.difficulty, [Random? rng]) : _rng = rng ?? Random();

  ({String type, int? amount}) decide({
    required List<String> hole,
    required List<String> board,
    required List<String> legal,
    required int currentBet,
    required int committed,
    required int stack,
    required int bigBlind,
    required int pot,
  }) {
    final s = _strength(hole, board); // 0..1
    final aggression = switch (difficulty) {
      BotDifficulty.hard => 0.45,
      BotDifficulty.medium => 0.25,
      BotDifficulty.easy => 0.10,
    };
    final looseness = switch (difficulty) {
      BotDifficulty.easy => 0.55, // easy bots call too much
      BotDifficulty.medium => 0.35,
      BotDifficulty.hard => 0.25,
    };

    final canCheck = legal.contains('check');
    final canCall = legal.contains('call');
    final canRaise = legal.contains('raise');
    final canBet = legal.contains('bet');

    // Facing a bet.
    if (canCall) {
      if (s > 0.78 && canRaise && _rng.nextDouble() < aggression + 0.4) {
        return (type: 'raise', amount: _raiseTo(currentBet, bigBlind, committed, stack));
      }
      // Call if strong enough, or loosely; otherwise fold.
      if (s > 0.35 || _rng.nextDouble() < looseness) {
        return (type: 'call', amount: null);
      }
      return (type: 'fold', amount: null);
    }

    // No bet to us — check or take the lead.
    if (canBet && s > 0.55 && _rng.nextDouble() < aggression + s * 0.3) {
      return (type: 'bet', amount: _bet(bigBlind, pot, stack));
    }
    if (canCheck) return (type: 'check', amount: null);
    return (type: legal.isNotEmpty ? legal.first : 'fold', amount: null);
  }

  double _strength(List<String> hole, List<String> board) {
    if (board.isEmpty) return _preflop(hole);
    final r = evaluate([...hole, ...board]);
    return ((r.category.index + 1) / 9.0 * 0.9 + 0.05).clamp(0, 1).toDouble();
  }

  double _preflop(List<String> hole) {
    int val(String c) => 'AKQJT98765432'.length - 'AKQJT98765432'.indexOf(c[0]); // 2..14-ish
    final a = val(hole[0]), b = val(hole[1]);
    final hi = a > b ? a : b, lo = a > b ? b : a;
    final pair = hole[0][0] == hole[1][0];
    final suited = hole[0][1] == hole[1][1];
    var sc = hi / 13.0 * 0.45 + lo / 13.0 * 0.3;
    if (pair) sc += 0.35;
    if (suited) sc += 0.07;
    if (!pair && (hi - lo) <= 2) sc += 0.05;
    return sc.clamp(0, 1).toDouble();
  }

  int _raiseTo(int currentBet, int bb, int committed, int stack) {
    final to = currentBet + bb * 2 + _rng.nextInt(bb * 2 + 1);
    final maxTo = committed + stack;
    return to > maxTo ? maxTo : to;
  }

  int _bet(int bb, int pot, int stack) {
    var amt = (pot * 0.5).round();
    if (amt < bb) amt = bb;
    if (amt > stack) amt = stack;
    return amt;
  }
}
