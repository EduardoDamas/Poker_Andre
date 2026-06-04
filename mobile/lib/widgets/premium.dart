import 'package:flutter/material.dart';
import '../theme.dart';
import '../format.dart';

enum BtnVariant { crimson, gold, glass, danger }

/// Premium gradient button with press-scale + glow.
class GradientButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final BtnVariant variant;
  final IconData? icon;
  final bool expand;
  final bool busy;
  const GradientButton(
    this.label, {
    super.key,
    this.onPressed,
    this.variant = BtnVariant.crimson,
    this.icon,
    this.expand = true,
    this.busy = false,
  });

  @override
  State<GradientButton> createState() => _GradientButtonState();
}

class _GradientButtonState extends State<GradientButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null && !widget.busy;
    final gold = widget.variant == BtnVariant.gold;
    final glass = widget.variant == BtnVariant.glass;
    final danger = widget.variant == BtnVariant.danger;
    final fg = gold ? Brand.onGold : Colors.white;

    final gradient = glass
        ? null
        : gold
            ? Brand.goldGrad
            : danger
                ? const LinearGradient(colors: [Brand.danger, Brand.crimsonDeep])
                : Brand.crimsonGrad;

    return GestureDetector(
      onTapDown: enabled ? (_) => setState(() => _down = true) : null,
      onTapUp: enabled ? (_) => setState(() => _down = false) : null,
      onTapCancel: enabled ? () => setState(() => _down = false) : null,
      onTap: enabled ? widget.onPressed : null,
      child: AnimatedScale(
        scale: _down ? 0.97 : 1,
        duration: const Duration(milliseconds: 120),
        child: AnimatedOpacity(
          opacity: enabled ? 1 : 0.5,
          duration: const Duration(milliseconds: 150),
          child: Container(
            width: widget.expand ? double.infinity : null,
            height: 54,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 22),
            decoration: BoxDecoration(
              gradient: gradient,
              color: glass ? Brand.surfaceHi : null,
              borderRadius: BorderRadius.circular(16),
              border: glass ? Border.all(color: Brand.border) : null,
              boxShadow: (enabled && _down && !glass)
                  ? Brand.glow(gold ? Brand.gold : Brand.crimson)
                  : Brand.cardShadow,
            ),
            child: widget.busy
                ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.icon != null) ...[Icon(widget.icon, size: 18, color: fg), const SizedBox(width: 8)],
                      Text(widget.label, style: TextStyle(color: fg, fontSize: 15, fontWeight: FontWeight.w700)),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

/// Obsidian surface card with hairline border + soft shadow.
class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool gold;
  const GlassCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap, this.gold = false});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          decoration: BoxDecoration(
            color: Brand.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: gold ? Brand.goldDeep : Brand.border, width: gold ? 1.2 : 1),
            boxShadow: Brand.cardShadow,
          ),
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}

/// Seat-fill indicator: filled crimson dots over empty ones.
class FillDots extends StatelessWidget {
  final int filled;
  final int total;
  const FillDots({super.key, required this.filled, required this.total});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(total, (i) {
        final on = i < filled;
        return Container(
          width: 7,
          height: 7,
          margin: const EdgeInsets.symmetric(horizontal: 1.5),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: on ? Brand.crimson : Brand.surface2,
            boxShadow: on ? Brand.glow(Brand.crimson) : null,
          ),
        );
      }),
    );
  }
}

/// Gold level/rank badge.
class LevelBadge extends StatelessWidget {
  final int level;
  const LevelBadge(this.level, {super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: Brand.goldGrad,
        shape: BoxShape.circle,
        boxShadow: Brand.glow(Brand.gold),
      ),
      child: Text('$level', style: const TextStyle(color: Brand.onGold, fontWeight: FontWeight.w800, fontSize: 16)),
    );
  }
}

/// Gold coin + tabular balance pill.
class BalancePill extends StatelessWidget {
  final int cents;
  const BalancePill(this.cents, {super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: Brand.surfaceHi,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Brand.border),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 18, height: 18,
          decoration: const BoxDecoration(gradient: Brand.goldGrad, shape: BoxShape.circle),
          child: const Center(child: Text(r'$', style: TextStyle(color: Brand.onGold, fontSize: 11, fontWeight: FontWeight.w800))),
        ),
        const SizedBox(width: 8),
        Text(brl(cents), style: Brand.money.copyWith(fontSize: 15)),
      ]),
    );
  }
}

class SectionHeader extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const SectionHeader(this.title, {super.key, this.trailing});
  @override
  Widget build(BuildContext context) {
    return Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(title, style: Brand.h2),
      ?trailing,
    ]);
  }
}
