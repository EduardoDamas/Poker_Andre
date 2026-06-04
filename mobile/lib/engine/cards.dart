import 'dart:math';

/// A card is a 2-char string: rank + suit, e.g. "As", "Td", "9h".
/// Ranks: 2-9 T J Q K A.  Suits: s(♠) h(♥) d(♦) c(♣).
/// Faithful Dart port of backend/src/poker/deck.dart + dealer.dart.

const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const suits = ['s', 'h', 'd', 'c'];

List<String> freshDeck() => [
      for (final r in ranks)
        for (final s in suits) '$r$s',
    ];

/// Unbiased Fisher–Yates shuffle (Random.secure by default).
List<String> shuffledDeck([Random? rng]) {
  final r = rng ?? Random.secure();
  final d = freshDeck();
  for (var i = d.length - 1; i > 0; i--) {
    final j = r.nextInt(i + 1);
    final t = d[i];
    d[i] = d[j];
    d[j] = t;
  }
  return d;
}

/// A dealt Texas Hold'em hand for [numPlayers], with burns (casino order).
class Deal {
  final List<List<String>> holeCards; // [player][2]
  final List<String> board; // 5 community cards
  Deal(this.holeCards, this.board);
}

Deal deal(int numPlayers, [List<String>? deck]) {
  final cards = deck ?? shuffledDeck();
  var i = 0;
  String next() => cards[i++];

  final hole = <List<String>>[];
  for (var p = 0; p < numPlayers; p++) {
    hole.add([next(), next()]);
  }
  next(); // burn
  final flop = [next(), next(), next()];
  next(); // burn
  final turn = next();
  next(); // burn
  final river = next();
  return Deal(hole, [...flop, turn, river]);
}
