import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';
import '../theme.dart';

/// Static panel shown while a tournament room fills up, so the wait is
/// informative instead of a blank table. No animation — the client asked for a
/// calm, still message (2026-09-17).
///
/// [seated] / [needed] drive "Faltam N participantes". [startsAt] is the start
/// of the next scheduled window when the server knows it; until the 10-minute
/// scheduler is live it is null and the estimate line is simply absent — better
/// no number than an invented one.
class WaitingPanel extends StatefulWidget {
  final String roomName;
  final int seated;
  final int needed;
  final DateTime? startsAt;

  const WaitingPanel({
    super.key,
    required this.roomName,
    required this.seated,
    required this.needed,
    this.startsAt,
  });

  @override
  State<WaitingPanel> createState() => _WaitingPanelState();
}

class _WaitingPanelState extends State<WaitingPanel> {
  Timer? _ticker;
  Duration _elapsed = Duration.zero;

  @override
  void initState() {
    super.initState();
    // One tick per second: a clock, not an animation.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _elapsed += const Duration(seconds: 1));
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  static String _mmss(Duration d) {
    if (d.isNegative) return '00:00';
    // Round up: with 3m07.9s left the player should read 03:08, not 03:07.
    final secs = (d.inMilliseconds / 1000).ceil();
    final m = (secs ~/ 60).remainder(60).toString().padLeft(2, '0');
    final s = secs.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  Future<void> _invite() async {
    final text = Uri.encodeComponent(
      'Vem jogar no CAPA CONTEST comigo! Torneios de Poker valendo prêmio. '
      'Baixe aqui: ${AppConfig.apiBase}/baixar',
    );
    final uri = Uri.parse('https://wa.me/?text=$text');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) _cannotInvite();
    } catch (_) {
      if (mounted) _cannotInvite();
    }
  }

  void _cannotInvite() {
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Não foi possível abrir o convite.')));
  }

  @override
  Widget build(BuildContext context) {
    final missing = widget.needed - widget.seated;
    final startsIn = widget.startsAt?.difference(DateTime.now());

    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 24),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 22),
        constraints: const BoxConstraints(maxWidth: 420),
        decoration: BoxDecoration(
          color: Brand.surface.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Brand.gold.withValues(alpha: 0.5)),
          boxShadow: Brand.cardShadow,
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(widget.roomName,
              key: const Key('waitingRoomName'),
              textAlign: TextAlign.center,
              style: Brand.h2.copyWith(color: Brand.gold)),
          const SizedBox(height: 6),
          Divider(color: Brand.gold.withValues(alpha: 0.35), height: 18),
          Text(
            missing > 0
                ? 'O torneio começa assim que a sala completar'
                : 'O torneio começa em instantes',
            key: const Key('waitingHeadline'),
            textAlign: TextAlign.center,
            style: Brand.body,
          ),
          const SizedBox(height: 14),
          if (missing > 0)
            Text.rich(
              TextSpan(style: Brand.h3, children: [
                const TextSpan(text: 'Faltam '),
                TextSpan(
                  text: '$missing',
                  style: Brand.h2.copyWith(color: Brand.crimson),
                ),
                TextSpan(text: missing == 1 ? ' participante' : ' participantes'),
              ]),
              key: const Key('waitingMissing'),
              textAlign: TextAlign.center,
            )
          else
            Text('Sala completa', style: Brand.h3, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text('Na sala: ${widget.seated} de ${widget.needed}', style: Brand.micro),
          const SizedBox(height: 18),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            if (startsIn != null) ...[
              _clock('Tempo estimado', _mmss(startsIn), key: const Key('waitingEstimate')),
              const SizedBox(width: 18),
            ],
            _clock('Tempo de espera', _mmss(_elapsed), key: const Key('waitingElapsed')),
          ]),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              key: const Key('inviteFriendsBtn'),
              onPressed: _invite,
              icon: const Icon(Icons.person_add_alt, size: 18, color: Brand.gold),
              label: Text('CONVIDAR AMIGOS',
                  style: Brand.label.copyWith(color: Brand.gold, letterSpacing: 0.5)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Brand.gold),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _clock(String label, String value, {Key? key}) => Column(children: [
        Text(label, style: Brand.micro),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
          decoration: BoxDecoration(
            color: Brand.bg.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Brand.border),
          ),
          child: Text(value, key: key, style: Brand.money.copyWith(fontSize: 20)),
        ),
      ]);
}
