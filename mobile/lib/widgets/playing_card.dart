import 'package:flutter/material.dart';
import '../theme.dart';

const _suits = {'s': '♠', 'h': '♥', 'd': '♦', 'c': '♣'};

/// How long a card takes to "deal" in (scale + fade entrance). Tuned to feel
/// natural — fast enough to stay snappy, slow enough to read as a dealt card.
const Duration kCardDealDuration = Duration(milliseconds: 280);

/// Premium card face. Renders e.g. "As" with a corner rank+suit and a large
/// center pip. Corner keeps the combined "A♠" glyph (used by tests).
///
/// On first appearance the card animates in (a quick scale-up + fade) so cards
/// "deal" onto the table smoothly instead of popping in. Set [animate] to false
/// to render it statically (e.g. in non-animated contexts).
class PlayingCard extends StatelessWidget {
  final String card; // "As", "Td", "Qh"
  final double width;
  final bool animate;
  const PlayingCard(this.card, {super.key, this.width = 44, this.animate = true});

  @override
  Widget build(BuildContext context) {
    final rankRaw = card.substring(0, card.length - 1);
    final suit = card.substring(card.length - 1);
    final rank = rankRaw == 'T' ? '10' : rankRaw;
    final symbol = _suits[suit] ?? suit;
    final isRed = suit == 'h' || suit == 'd';
    final color = isRed ? Brand.crimson : const Color(0xFF14151A);
    final h = width * 1.4;

    final face = Container(
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

    if (!animate) return face;
    return _DealIn(child: face);
  }
}

/// One-shot entrance: the child fades in while scaling up from 80% to 100%,
/// with a gentle ease-out so it settles like a card being placed on the felt.
class _DealIn extends StatelessWidget {
  final Widget child;
  const _DealIn({required this.child});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: kCardDealDuration,
      curve: Curves.easeOutCubic,
      builder: (_, t, c) => Opacity(
        opacity: t.clamp(0.0, 1.0),
        child: Transform.scale(scale: 0.8 + 0.2 * t, child: c),
      ),
      child: child,
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
