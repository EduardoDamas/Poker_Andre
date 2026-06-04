// Single-street betting — Dart port of backend/src/poker/betting-round.dart.

class PlayerState {
  final String id;
  int stack;
  int committed = 0;
  bool folded = false;
  bool allIn = false;
  bool hasActed = false;
  PlayerState(this.id, this.stack);
}

class RoundResult {
  final Map<String, int> contributions;
  final int pot;
  final List<String> livePlayerIds;
  RoundResult(this.contributions, this.pot, this.livePlayerIds);
}

class BettingRound {
  final List<PlayerState> players;
  int currentBet = 0;
  int _minRaiseSize;
  final int minBet;
  int _toAct;

  BettingRound._(List<({String id, int stack})> seats, this.minBet, int firstToAct)
      : players = [for (final s in seats) PlayerState(s.id, s.stack)],
        _minRaiseSize = minBet,
        _toAct = firstToAct % seats.length {
    if (seats.length < 2) throw ArgumentError('Need at least 2 players.');
  }

  static BettingRound postflop(List<({String id, int stack})> seats, int minBet,
          [int firstToAct = 0]) =>
      BettingRound._(seats, minBet, firstToAct);

  static BettingRound preflop(
      List<({String id, int stack})> seats, int smallBlind, int bigBlind) {
    final r = BettingRound._(seats, bigBlind, 2 % seats.length);
    r._postBlind(0, smallBlind);
    r._postBlind(1, bigBlind);
    r.currentBet = bigBlind;
    r._minRaiseSize = bigBlind;
    return r;
  }

  void _postBlind(int index, int amount) {
    final p = players[index];
    final pay = amount < p.stack ? amount : p.stack;
    p.stack -= pay;
    p.committed += pay;
    if (p.stack == 0) p.allIn = true;
  }

  String? get actingPlayerId => isComplete() ? null : players[_toAct].id;

  List<String> legalActions() {
    if (isComplete()) return const [];
    final p = players[_toAct];
    final toCall = currentBet - p.committed;
    final actions = <String>['fold'];
    if (toCall <= 0) actions.add('check');
    if (toCall > 0) actions.add('call');
    if (currentBet == 0 && p.stack > 0) actions.add('bet');
    if (currentBet > 0 && p.stack > toCall) actions.add('raise');
    return actions;
  }

  void act(String playerId, String type, [int? amount]) {
    if (isComplete()) throw StateError('Round complete.');
    final p = players[_toAct];
    if (p.id != playerId) throw StateError("Not $playerId's turn.");

    switch (type) {
      case 'fold':
        p.folded = true;
        p.hasActed = true;
        break;
      case 'check':
        if (p.committed != currentBet) throw StateError('Cannot check facing a bet.');
        p.hasActed = true;
        break;
      case 'call':
        final toCall = currentBet - p.committed;
        if (toCall <= 0) throw StateError('Nothing to call.');
        final pay = toCall < p.stack ? toCall : p.stack;
        p.stack -= pay;
        p.committed += pay;
        if (p.stack == 0) p.allIn = true;
        p.hasActed = true;
        break;
      case 'bet':
        if (currentBet != 0) throw StateError('Already a bet; raise instead.');
        final a = amount ?? 0;
        if (a <= 0) throw StateError('Bet must be positive.');
        if (a > p.stack) throw StateError('Bet exceeds stack.');
        if (a < minBet && a != p.stack) throw StateError('Bet below minimum.');
        p.stack -= a;
        p.committed += a;
        currentBet = p.committed;
        _minRaiseSize = a;
        if (p.stack == 0) p.allIn = true;
        _reopen(p);
        p.hasActed = true;
        break;
      case 'raise':
        if (currentBet == 0) throw StateError('Nothing to raise.');
        final raiseTo = amount ?? 0;
        if (raiseTo <= currentBet) throw StateError('Raise must exceed current bet.');
        final cost = raiseTo - p.committed;
        if (cost > p.stack) throw StateError('Raise exceeds stack.');
        final increment = raiseTo - currentBet;
        final isAllIn = cost == p.stack;
        if (increment < _minRaiseSize && !isAllIn) throw StateError('Below min-raise.');
        p.stack -= cost;
        p.committed = raiseTo;
        if (increment >= _minRaiseSize) {
          _minRaiseSize = increment;
          _reopen(p);
        }
        currentBet = raiseTo;
        if (p.stack == 0) p.allIn = true;
        p.hasActed = true;
        break;
      default:
        throw ArgumentError('Unknown action: $type');
    }
    _advance();
  }

  bool isComplete() {
    final live = players.where((p) => !p.folded).toList();
    if (live.length <= 1) return true;
    final active = live.where((p) => !p.allIn).toList();
    if (active.isEmpty) return true;
    return active.every((p) => p.hasActed && p.committed == currentBet);
  }

  RoundResult result([int carry = 0]) {
    final contributions = <String, int>{};
    var pot = carry;
    for (final p in players) {
      contributions[p.id] = p.committed;
      pot += p.committed;
    }
    return RoundResult(
      contributions,
      pot,
      [for (final p in players) if (!p.folded) p.id],
    );
  }

  void _reopen(PlayerState aggressor) {
    for (final p in players) {
      if (p != aggressor && !p.folded && !p.allIn) p.hasActed = false;
    }
  }

  void _advance() {
    if (isComplete()) return;
    final n = players.length;
    for (var step = 1; step <= n; step++) {
      final idx = (_toAct + step) % n;
      final p = players[idx];
      if (!p.folded && !p.allIn) {
        _toAct = idx;
        return;
      }
    }
  }
}
