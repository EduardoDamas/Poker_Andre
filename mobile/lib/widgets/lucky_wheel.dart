import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../api/points_api.dart';
import '../theme.dart';
import 'premium.dart';

/// Shows the daily lucky-wheel dialog. The outcome is drawn SERVER-side: on
/// "Girar" we call [spin]; the wheel then animates onto the returned segment.
/// Resolves with the [SpinOutcome] (or null if dismissed without spinning).
Future<SpinOutcome?> showLuckyWheel(
  BuildContext context, {
  required List<WheelSegmentInfo> segments,
  required Future<SpinOutcome> Function() spin,
}) {
  return showDialog<SpinOutcome>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _LuckyWheelDialog(segments: segments, spin: spin),
  );
}

class _LuckyWheelDialog extends StatefulWidget {
  final List<WheelSegmentInfo> segments;
  final Future<SpinOutcome> Function() spin;
  const _LuckyWheelDialog({required this.segments, required this.spin});

  @override
  State<_LuckyWheelDialog> createState() => _LuckyWheelDialogState();
}

class _LuckyWheelDialogState extends State<_LuckyWheelDialog>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  Animation<double>? _rotation;
  SpinOutcome? _outcome;
  bool _spinning = false;
  bool _done = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 3800));
    _controller.addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) setState(() => _done = true);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _spin() async {
    setState(() {
      _spinning = true;
      _error = null;
    });
    try {
      final outcome = await widget.spin();
      if (!mounted) return;
      final sweep = 2 * math.pi / widget.segments.length;
      // Rotate 5 full turns, then land the winning slice's CENTER under the
      // top pointer (slices are painted starting at -π/2).
      final target = 5 * 2 * math.pi - (outcome.segmentIndex * sweep + sweep / 2);
      _rotation = Tween<double>(begin: 0, end: target)
          .animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutQuart));
      setState(() => _outcome = outcome);
      _controller.forward(from: 0);
    } catch (e) {
      if (mounted) {
        setState(() {
          _spinning = false;
          _error = '$e'.replaceFirst('Exception: ', '');
        });
      }
    }
  }

  String get _prizeText {
    final o = _outcome!;
    if (o.freePoints == 0 && o.paidPoints == 0) return 'Hoje não foi dessa vez…';
    if (o.paidPoints > 0) return '+${o.paidPoints} pontos pagos!';
    return '+${o.freePoints} pontos grátis!';
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Brand.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('Roleta Diária', style: Brand.h2),
          const SizedBox(height: 4),
          Text('Um giro por dia. Todo dia conta para a sua sequência!',
              textAlign: TextAlign.center, style: Brand.caption),
          const SizedBox(height: 18),
          SizedBox(
            width: 260,
            height: 276,
            child: Stack(alignment: Alignment.topCenter, children: [
              Positioned(
                top: 16,
                child: AnimatedBuilder(
                  animation: _controller,
                  builder: (_, _) => Transform.rotate(
                    angle: _rotation?.value ?? 0,
                    child: CustomPaint(
                      size: const Size(260, 260),
                      painter: _WheelPainter(widget.segments),
                    ),
                  ),
                ),
              ),
              // Pointer.
              CustomPaint(size: const Size(26, 22), painter: _PointerPainter()),
            ]),
          ),
          const SizedBox(height: 14),
          if (_error != null) ...[
            Text(_error!, textAlign: TextAlign.center,
                style: const TextStyle(color: Brand.danger, fontSize: 13)),
            const SizedBox(height: 10),
            GradientButton('Fechar', variant: BtnVariant.glass,
                onPressed: () => Navigator.pop(context)),
          ] else if (_done && _outcome != null) ...[
            Text(_prizeText, style: Brand.h3.copyWith(color: Brand.gold)),
            if (_outcome!.milestone != null) ...[
              const SizedBox(height: 6),
              Text(
                'Bônus de sequência (${_outcome!.milestone!.days} dias): '
                '+${_outcome!.milestone!.paidPoints > 0 ? '${_outcome!.milestone!.paidPoints} pontos pagos' : '${_outcome!.milestone!.freePoints} pontos grátis'}!',
                textAlign: TextAlign.center,
                style: Brand.caption.copyWith(color: Brand.champagne),
              ),
            ],
            const SizedBox(height: 4),
            Text('Sequência: ${_outcome!.streakDays} dia(s)', style: Brand.micro),
            const SizedBox(height: 12),
            GradientButton('Receber', variant: BtnVariant.gold,
                onPressed: () => Navigator.pop(context, _outcome)),
          ] else ...[
            GradientButton('Girar', icon: Icons.casino,
                busy: _spinning, variant: BtnVariant.crimson, onPressed: _spinning ? null : _spin),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _spinning ? null : () => Navigator.pop(context),
              child: Text('Agora não', style: Brand.caption),
            ),
          ],
        ]),
      ),
    );
  }
}

class _WheelPainter extends CustomPainter {
  final List<WheelSegmentInfo> segments;
  _WheelPainter(this.segments);

  static const _sliceColors = [
    Color(0xFF7A1210), // deep crimson
    Color(0xFF1C1C21), // obsidian
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    final sweep = 2 * math.pi / segments.length;
    final paint = Paint()..style = PaintingStyle.fill;

    for (var i = 0; i < segments.length; i++) {
      final isPaid = segments[i].paidPoints > 0;
      paint.color = isPaid ? Brand.goldDeep : _sliceColors[i % 2];
      final start = -math.pi / 2 + i * sweep;
      canvas.drawArc(Rect.fromCircle(center: center, radius: radius - 4), start, sweep, true, paint);

      // Slice divider.
      final borderPaint = Paint()
        ..color = Brand.gold.withValues(alpha: 0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2;
      canvas.drawArc(
          Rect.fromCircle(center: center, radius: radius - 4), start, sweep, true, borderPaint);

      // Label, drawn along the slice's mid-angle.
      final mid = start + sweep / 2;
      final labelPos = center + Offset(math.cos(mid), math.sin(mid)) * (radius * 0.62);
      final tp = TextPainter(
        text: TextSpan(
          text: segments[i].label,
          style: TextStyle(
            color: isPaid ? Brand.onGold : Brand.textPri,
            fontSize: 11.5,
            fontWeight: FontWeight.w800,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      canvas.save();
      canvas.translate(labelPos.dx, labelPos.dy);
      canvas.rotate(mid + math.pi / 2);
      tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
      canvas.restore();
    }

    // Outer ring + hub.
    canvas.drawCircle(
      center,
      radius - 2,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..shader = const LinearGradient(colors: [Brand.champagne, Brand.goldDeep])
            .createShader(Rect.fromCircle(center: center, radius: radius)),
    );
    canvas.drawCircle(center, 16, Paint()..color = Brand.bg);
    canvas.drawCircle(
      center,
      16,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..color = Brand.gold,
    );
  }

  @override
  bool shouldRepaint(covariant _WheelPainter old) => old.segments != segments;
}

class _PointerPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawShadow(path, Colors.black, 3, false);
    canvas.drawPath(path, Paint()..color = Brand.crimson);
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = Brand.champagne,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
