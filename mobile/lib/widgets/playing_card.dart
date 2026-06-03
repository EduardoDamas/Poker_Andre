import 'package:flutter/material.dart';
import '../theme.dart';

/// Renders a card string like "As" / "Th" / "Qd" as a small card face.
class PlayingCard extends StatelessWidget {
  final String card; // e.g. "As", "Td", "Qh"
  const PlayingCard(this.card, {super.key});

  static const _suits = {'s': '♠', 'h': '♥', 'd': '♦', 'c': '♣'};

  @override
  Widget build(BuildContext context) {
    final rankRaw = card.substring(0, card.length - 1);
    final suit = card.substring(card.length - 1);
    final rank = rankRaw == 'T' ? '10' : rankRaw;
    final isRed = suit == 'h' || suit == 'd';
    final color = isRed ? Brand.red : Brand.black;

    return Container(
      width: 40,
      height: 56,
      margin: const EdgeInsets.symmetric(horizontal: 3),
      decoration: BoxDecoration(
        color: Brand.white,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Brand.gray),
      ),
      child: Center(
        child: Text(
          '$rank${_suits[suit] ?? suit}',
          style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 15),
        ),
      ),
    );
  }
}

/// Face-down placeholder.
class CardBack extends StatelessWidget {
  const CardBack({super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 56,
      margin: const EdgeInsets.symmetric(horizontal: 3),
      decoration: BoxDecoration(
        color: Brand.redDark,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Brand.red),
      ),
    );
  }
}
