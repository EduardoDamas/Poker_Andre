import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// Chip counts the Brazilian way: 1.450, 12.500 — and 125K past 99.999 so a
/// big stack still fits under an avatar.
String chipCount(int n) {
  if (n >= 100000) return '${(n / 1000).floor()}K';
  final s = n.abs().toString();
  final buf = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
    buf.write(s[i]);
  }
  return buf.toString();
}

/// The colours of one chip of the design's denomination sheet
/// (assets/chips/denoms): ring, edge stripes, inner line.
class _ChipStyle {
  final Color face;
  final Color ring;
  final Color stripe;
  final Color inner;
  const _ChipStyle(this.face, this.ring, this.stripe, this.inner);
}

const _slate = _ChipStyle(Color(0xFF3A4763), Color(0xFFADB4B9), Color(0xFFF6F8FA), Color(0xFFE2231A));
const _red = _ChipStyle(Color(0xFF351217), Color(0xFFE2231A), Color(0xFFFF4438), Color(0xFFF5C45E));
const _silver = _ChipStyle(Color(0xFF1E1D22), Color(0xFFADB4B9), Color(0xFFF6F8FA), Color(0xFFE2231A));
const _gold = _ChipStyle(Color(0xFF2D1D24), Color(0xFFF5C45E), Color(0xFFFFF0B1), Color(0xFFF5C45E));

/// Bigger amounts get the "richer" chip: slate, red, silver, gold.
_ChipStyle _styleFor(int amount) => amount >= 5000
    ? _gold
    : amount >= 1000
        ? _silver
        : amount >= 100
            ? _red
            : _slate;

/// One play chip seen from above.
class PokerChip extends StatelessWidget {
  final double size;
  final int amount;
  const PokerChip({super.key, this.size = 16, this.amount = 100});

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: _ChipPainter(_styleFor(amount)));
}

class _ChipPainter extends CustomPainter {
  final _ChipStyle style;
  _ChipPainter(this.style);

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;
    canvas.drawCircle(c + Offset(0, r * 0.12), r, Paint()..color = Colors.black.withValues(alpha: 0.45));
    canvas.drawCircle(c, r, Paint()..color = style.ring);
    // Edge stripes: six notches round the rim, as on the sheet.
    final stripe = Paint()
      ..color = style.stripe
      ..strokeWidth = r * 0.34
      ..style = PaintingStyle.stroke;
    for (var i = 0; i < 6; i++) {
      final a = i * math.pi / 3;
      canvas.drawArc(Rect.fromCircle(center: c, radius: r * 0.83), a - 0.17, 0.34, false, stripe);
    }
    canvas.drawCircle(c, r * 0.62, Paint()..color = style.face);
    canvas.drawCircle(
        c,
        r * 0.62,
        Paint()
          ..color = style.inner
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(1, r * 0.1));
  }

  @override
  bool shouldRepaint(_ChipPainter old) => old.style != style;
}

/// A small pile of chips — more chips for more money, up to three.
class ChipPile extends StatelessWidget {
  final int amount;
  final double size;
  const ChipPile({super.key, required this.amount, this.size = 16});

  @override
  Widget build(BuildContext context) {
    final n = amount >= 1000 ? 3 : amount >= 200 ? 2 : 1;
    final lift = size * 0.22;
    return SizedBox(
      width: size,
      height: size + lift * (n - 1),
      child: Stack(children: [
        for (var i = 0; i < n; i++)
          Positioned(top: lift * (n - 1 - i), child: PokerChip(size: size, amount: amount)),
      ]),
    );
  }
}

/// Chips in front of a player (their bet this street), or the pot: a pile and
/// the amount on a dark pill.
class ChipStackLabel extends StatelessWidget {
  final int amount;
  final double chipSize;
  final Color textColor;
  const ChipStackLabel({super.key, required this.amount, this.chipSize = 14, this.textColor = Brand.textPri});

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      ChipPile(amount: amount, size: chipSize),
      const SizedBox(width: 3),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.62),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(chipCount(amount),
            style: TextStyle(color: textColor, fontSize: 11, fontWeight: FontWeight.w800, height: 1.2)),
      ),
    ]);
  }
}
