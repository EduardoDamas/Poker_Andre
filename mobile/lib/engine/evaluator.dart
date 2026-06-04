// Texas Hold'em hand evaluator — Dart port of backend/src/poker/hand-evaluator.dart.
// `evaluate` returns a comparable key [category, ...tieBreakers]; higher wins.

enum HandCategory {
  highCard,
  pair,
  twoPair,
  threeOfAKind,
  straight,
  flush,
  fullHouse,
  fourOfAKind,
  straightFlush,
}

const _categoryValue = {
  HandCategory.highCard: 1,
  HandCategory.pair: 2,
  HandCategory.twoPair: 3,
  HandCategory.threeOfAKind: 4,
  HandCategory.straight: 5,
  HandCategory.flush: 6,
  HandCategory.fullHouse: 7,
  HandCategory.fourOfAKind: 8,
  HandCategory.straightFlush: 9,
};

const _categoryName = {
  HandCategory.highCard: 'Carta alta',
  HandCategory.pair: 'Par',
  HandCategory.twoPair: 'Dois pares',
  HandCategory.threeOfAKind: 'Trinca',
  HandCategory.straight: 'Sequência',
  HandCategory.flush: 'Flush',
  HandCategory.fullHouse: 'Full house',
  HandCategory.fourOfAKind: 'Quadra',
  HandCategory.straightFlush: 'Straight flush',
};

const _rankValue = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

class HandResult {
  final HandCategory category;
  final String name;
  final List<int> key; // [categoryValue, ...tieBreakers]
  HandResult(this.category, this.name, this.key);
}

int _rankOf(String card) => _rankValue[card[0]]!;
String _suitOf(String card) => card[1];

/// Highest card of the best straight (Ace high or low), or null.
int? _bestStraightHigh(Iterable<int> values) {
  final present = values.toSet();
  if (present.contains(14)) present.add(1); // wheel A-2-3-4-5
  for (var high = 14; high >= 5; high--) {
    var run = true;
    for (var k = 0; k < 5; k++) {
      if (!present.contains(high - k)) {
        run = false;
        break;
      }
    }
    if (run) return high;
  }
  return null;
}

List<int> _ranksWithCount(Map<int, int> counts, int n) {
  final r = [for (final e in counts.entries) if (e.value == n) e.key];
  r.sort((a, b) => b - a);
  return r;
}

HandResult _result(HandCategory cat, List<int> tie) =>
    HandResult(cat, _categoryName[cat]!, [_categoryValue[cat]!, ...tie]);

/// Evaluate the best 5-card hand from 5–7 cards.
HandResult evaluate(List<String> cards) {
  if (cards.length < 5) throw ArgumentError('Need at least 5 cards.');
  final values = cards.map(_rankOf).toList();
  final distinctDesc = values.toSet().toList()..sort((a, b) => b - a);

  final counts = <int, int>{};
  for (final v in values) {
    counts[v] = (counts[v] ?? 0) + 1;
  }

  final bySuit = <String, List<int>>{};
  for (final c in cards) {
    bySuit.putIfAbsent(_suitOf(c), () => []).add(_rankOf(c));
  }
  List<int>? flushRanks;
  for (final r in bySuit.values) {
    if (r.length >= 5) flushRanks = [...r]..sort((a, b) => b - a);
  }

  if (flushRanks != null) {
    final sf = _bestStraightHigh(flushRanks);
    if (sf != null) return _result(HandCategory.straightFlush, [sf]);
  }

  final quads = _ranksWithCount(counts, 4);
  final trips = _ranksWithCount(counts, 3);
  final pairs = _ranksWithCount(counts, 2);

  if (quads.isNotEmpty) {
    final quad = quads[0];
    final kicker = distinctDesc.firstWhere((r) => r != quad);
    return _result(HandCategory.fourOfAKind, [quad, kicker]);
  }

  if (trips.isNotEmpty) {
    final tripRank = trips[0];
    final others = [...trips.skip(1), ...pairs].where((r) => r != tripRank).toList()
      ..sort((a, b) => b - a);
    if (others.isNotEmpty) {
      return _result(HandCategory.fullHouse, [tripRank, others[0]]);
    }
  }

  if (flushRanks != null) {
    return _result(HandCategory.flush, flushRanks.take(5).toList());
  }

  final straightHigh = _bestStraightHigh(values);
  if (straightHigh != null) return _result(HandCategory.straight, [straightHigh]);

  if (trips.isNotEmpty) {
    final tripRank = trips[0];
    final kickers = distinctDesc.where((r) => r != tripRank).take(2).toList();
    return _result(HandCategory.threeOfAKind, [tripRank, ...kickers]);
  }

  if (pairs.length >= 2) {
    final p1 = pairs[0], p2 = pairs[1];
    final kicker = distinctDesc.firstWhere((r) => r != p1 && r != p2);
    return _result(HandCategory.twoPair, [p1, p2, kicker]);
  }

  if (pairs.length == 1) {
    final pair = pairs[0];
    final kickers = distinctDesc.where((r) => r != pair).take(3).toList();
    return _result(HandCategory.pair, [pair, ...kickers]);
  }

  return _result(HandCategory.highCard, distinctDesc.take(5).toList());
}

/// Compare two keys: >0 if a beats b, <0 if b beats a, 0 = tie.
int compareKeys(List<int> a, List<int> b) {
  final len = a.length > b.length ? a.length : b.length;
  for (var i = 0; i < len; i++) {
    final diff = (i < a.length ? a[i] : 0) - (i < b.length ? b[i] : 0);
    if (diff != 0) return diff;
  }
  return 0;
}
