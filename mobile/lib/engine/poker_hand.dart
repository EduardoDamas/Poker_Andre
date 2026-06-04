import 'cards.dart';
import 'betting.dart';
import 'side_pots.dart';
import 'evaluator.dart';

/// Full Texas Hold'em hand — Dart port of backend/src/poker/hand.dart.
/// Positional rules: seats in order [SB, BB, ...]; dealer = last (SB heads-up).

typedef Seat = ({String id, int stack});

class PotOutcome {
  final int amount;
  final List<String> winnerIds;
  PotOutcome(this.amount, this.winnerIds);
}

class HandOutcome {
  final List<String> board;
  final List<PotOutcome> pots;
  final Map<String, int> payouts;
  final Map<String, int> finalStacks;
  HandOutcome(this.board, this.pots, this.payouts, this.finalStacks);
}

enum Street { preflop, flop, turn, river, complete }

class PokerHand {
  final List<String> _seatOrder;
  final Map<String, int> _stacks;
  final Map<String, int> _totalContrib;
  final Set<String> _folded = {};
  final Map<String, List<String>> _hole;
  final List<String> _board;
  final int _smallBlind;
  final int _bigBlind;

  Street _street = Street.preflop;
  BettingRound? _round;
  HandOutcome? _outcome;

  PokerHand._(this._seatOrder, this._stacks, this._totalContrib, this._hole,
      this._board, this._smallBlind, this._bigBlind) {
    _round = BettingRound.preflop(
      [for (final id in _seatOrder) (id: id, stack: _stacks[id]!)],
      _smallBlind,
      _bigBlind,
    );
  }

  factory PokerHand(List<Seat> seats,
      {required int smallBlind, required int bigBlind, List<String>? deck}) {
    if (seats.length < 2) throw ArgumentError('Need at least 2 players.');
    final seatOrder = [for (final s in seats) s.id];
    final dealt = deal(seats.length, deck); // deal ONCE
    final hole = <String, List<String>>{};
    final totalContrib = <String, int>{};
    seatOrder.asMap().forEach((i, id) {
      hole[id] = dealt.holeCards[i];
      totalContrib[id] = 0;
    });
    final stacks = {for (final s in seats) s.id: s.stack};
    return PokerHand._(seatOrder, stacks, totalContrib, hole, dealt.board, smallBlind, bigBlind);
  }

  // ---- public state ----
  Street get currentStreet => _street;
  String? get actingPlayerId => _round?.actingPlayerId;
  List<String> legalActions() => _round?.legalActions() ?? const [];
  bool get isComplete => _street == Street.complete;
  List<String> holeCardsOf(String id) => _hole[id] ?? const [];

  // Betting context (for AI bots). Valid while a round is in progress.
  int get currentBet => _round?.currentBet ?? 0;
  int get bigBlind => _bigBlind;
  PlayerState? _actingPlayer() {
    final r = _round;
    final id = r?.actingPlayerId;
    if (r == null || id == null) return null;
    return r.players.firstWhere((p) => p.id == id);
  }

  int get actingStack => _actingPlayer()?.stack ?? 0;
  int get actingCommitted => _actingPlayer()?.committed ?? 0;
  int get pot {
    var p = _totalContrib.values.fold(0, (a, b) => a + b);
    for (final pl in _round?.players ?? const <PlayerState>[]) {
      p += pl.committed;
    }
    return p;
  }

  List<String> get visibleBoard {
    switch (_street) {
      case Street.preflop:
        return const [];
      case Street.flop:
        return _board.sublist(0, 3);
      case Street.turn:
        return _board.sublist(0, 4);
      case Street.river:
      case Street.complete:
        return _board;
    }
  }

  HandOutcome result() {
    if (_outcome == null) throw StateError('Hand not complete.');
    return _outcome!;
  }

  // ---- driving ----
  void act(String playerId, String type, [int? amount]) {
    if (_street == Street.complete) throw StateError('Hand complete.');
    if (_round == null) throw StateError('No betting in progress.');
    _round!.act(playerId, type, amount);
    if (_round!.isComplete()) {
      _settleRound();
      _proceed();
    }
  }

  // ---- internals ----
  List<String> _livePlayers() => [for (final id in _seatOrder) if (!_folded.contains(id)) id];

  void _settleRound() {
    for (final p in _round!.players) {
      _stacks[p.id] = p.stack;
      _totalContrib[p.id] = _totalContrib[p.id]! + p.committed;
      if (p.folded) _folded.add(p.id);
    }
    _round = null;
  }

  Street _nextStreet(Street s) => s == Street.preflop
      ? Street.flop
      : s == Street.flop
          ? Street.turn
          : Street.river;

  void _proceed() {
    final live = _livePlayers();
    if (live.length <= 1) {
      _finish();
      return;
    }
    while (true) {
      if (_street == Street.river) {
        _finish();
        return;
      }
      _street = _nextStreet(_street);
      final bettors = live.where((id) => _stacks[id]! > 0).toList();
      if (bettors.length >= 2) {
        _openPostflop();
        return;
      }
    }
  }

  void _openPostflop() {
    final n = _seatOrder.length;
    final dealerIndex = n >= 3 ? n - 1 : 0;
    final start = (dealerIndex + 1) % n;
    final seats = <Seat>[];
    for (var i = 0; i < n; i++) {
      final id = _seatOrder[(start + i) % n];
      if (!_folded.contains(id) && _stacks[id]! > 0) {
        seats.add((id: id, stack: _stacks[id]!));
      }
    }
    _round = BettingRound.postflop(seats, _bigBlind, 0);
  }

  void _finish() {
    final res = buildSidePots(_totalContrib, _folded);
    final payouts = {for (final id in _seatOrder) id: 0};

    res.refunds.forEach((id, amount) {
      payouts[id] = payouts[id]! + amount;
      _stacks[id] = _stacks[id]! + amount;
    });

    final potResults = <PotOutcome>[];
    for (final pot in res.pots) {
      final winners = _winnersOf(pot.eligiblePlayerIds);
      _awardPot(pot.amount, winners, payouts);
      potResults.add(PotOutcome(pot.amount, winners));
    }

    _street = Street.complete;
    _outcome = HandOutcome(_board, potResults, payouts, {..._stacks});
  }

  List<String> _winnersOf(List<String> eligible) {
    List<int>? best;
    var winners = <String>[];
    for (final id in eligible) {
      final key = evaluate([..._hole[id]!, ..._board]).key;
      final cmp = best == null ? 1 : compareKeys(key, best);
      if (cmp > 0) {
        best = key;
        winners = [id];
      } else if (cmp == 0) {
        winners.add(id);
      }
    }
    return winners;
  }

  void _awardPot(int amount, List<String> winners, Map<String, int> payouts) {
    final ordered = [...winners]..sort((a, b) => _seatOrder.indexOf(a) - _seatOrder.indexOf(b));
    final base = amount ~/ ordered.length;
    var remainder = amount - base * ordered.length;
    for (final id in ordered) {
      final share = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      payouts[id] = payouts[id]! + share;
      _stacks[id] = _stacks[id]! + share;
    }
  }
}
