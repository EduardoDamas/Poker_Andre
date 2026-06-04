// Side-pot construction — Dart port of backend/src/poker/side-pots.dart.

class Pot {
  int amount;
  List<String> eligiblePlayerIds;
  Pot(this.amount, this.eligiblePlayerIds);
}

class SidePotResult {
  final List<Pot> pots;
  final Map<String, int> refunds;
  SidePotResult(this.pots, this.refunds);
}

bool _sameMembers(List<String> a, List<String> b) {
  if (a.length != b.length) return false;
  final sa = a.toSet();
  return b.every(sa.contains);
}

SidePotResult buildSidePots(Map<String, int> contributions, Iterable<String> foldedIds) {
  final folded = foldedIds.toSet();
  final effective = <String, int>{};
  contributions.forEach((id, c) {
    if (c > 0) effective[id] = c;
  });
  final refunds = <String, int>{};
  final ids = effective.keys.toList();
  if (ids.isEmpty) return SidePotResult([], refunds);

  // Refund an uncalled bet: a unique strict max is capped to the 2nd-highest.
  final amounts = ids.map((id) => effective[id]!).toList()..sort((a, b) => b - a);
  final top = amounts[0];
  final second = amounts.length > 1 ? amounts[1] : 0;
  final topHolders = ids.where((id) => effective[id] == top).toList();
  if (topHolders.length == 1 && top > second) {
    refunds[topHolders[0]] = top - second;
    effective[topHolders[0]] = second;
  }

  final entries = [for (final e in effective.entries) if (e.value > 0) e];
  final levels = entries.map((e) => e.value).toSet().toList()..sort();

  final layers = <Pot>[];
  var prev = 0;
  for (final level in levels) {
    final contributors = [for (final e in entries) if (e.value >= level) e.key];
    final amount = (level - prev) * contributors.length;
    final eligible = [for (final id in contributors) if (!folded.contains(id)) id];
    layers.add(Pot(amount, eligible));
    prev = level;
  }

  final pots = <Pot>[];
  for (final layer in layers) {
    if (pots.isNotEmpty && _sameMembers(pots.last.eligiblePlayerIds, layer.eligiblePlayerIds)) {
      pots.last.amount += layer.amount;
    } else {
      pots.add(Pot(layer.amount, [...layer.eligiblePlayerIds]));
    }
  }
  return SidePotResult([for (final p in pots) if (p.amount > 0) p], refunds);
}
