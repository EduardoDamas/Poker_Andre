import 'package:flutter/material.dart';
import '../theme.dart';

const _suits = {'s': '♠', 'h': '♥', 'd': '♦', 'c': '♣'};

/// Premium card face. Renders e.g. "As" with a corner rank+suit and a large
/// center pip. Corner keeps the combined "A♠" glyph (used by tests).
class PlayingCard extends StatelessWidget {
  final String card; // "As", "Td", "Qh"
  final double width;
  const PlayingCard(this.card, {super.key, this.width = 44});

  @override
  Widget build(BuildContext context) {
    final rankRaw = card.substring(0, card.length - 1);
    final suit = card.substring(card.length - 1);
    final rank = rankRaw == 'T' ? '10' : rankRaw;
    final symbol = _suits[suit] ?? suit;
    final isRed = suit == 'h' || suit == 'd';
    final color = isRed ? Brand.crimson : const Color(0xFF14151A);
    final h = width * 1.4;

    return Container(
      width: width,
      height: h,
      margin: const EdgeInsets.symmetric(horizontal: 3),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.white, Color(0xFFEDEEF0)]),
        borderRadius: BorderRadius.circular(width * 0.16),
        boxShadow: Brand.cardShadow,
      ),
      child: Stack(children: [
        Positioned(
          top: 3,
          left: 5,
          child: Text('$rank$symbol',
              style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: width * 0.30, height: 1)),
        ),
        Center(
          child: Text(symbol, style: TextStyle(color: color.withValues(alpha: 0.92), fontSize: width * 0.58, height: 1)),
        ),
      ]),
    );
  }
}

/// Face-down card — crimson gradient with the brand monogram.
class CardBack extends StatelessWidget {
  final double width;
  const CardBack({super.key, this.width = 44});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: width * 1.4,
      margin: const EdgeInsets.symmetric(horizontal: 3),
      decoration: BoxDecoration(
        gradient: Brand.crimsonGrad,
        borderRadius: BorderRadius.circular(width * 0.16),
        border: Border.all(color: Brand.crimsonGlow, width: 0.8),
        boxShadow: Brand.cardShadow,
      ),
      child: Center(
        child: Text('C',
            style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85), fontWeight: FontWeight.w900, fontSize: width * 0.5, fontStyle: FontStyle.italic)),
      ),
    );
  }
}
