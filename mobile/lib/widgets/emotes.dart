import 'package:flutter/material.dart';

import '../theme.dart';

/// Quick reactions at the table (client, 2026-10). Friendly only, and the same
/// ids the server accepts (backend/src/realtime/emotes.ts) — nothing typed by a
/// player is ever shown to the others.
const emotes = <String, String>{
  'wave': '👋',
  'smile': '😀',
  'laugh': '😂',
  'wow': '😮',
  'sweat': '😅',
  'think': '🤔',
  'cool': '😎',
  'sad': '😢',
  'clap': '👏',
  'thumbs': '👍',
  'fire': '🔥',
  'luck': '🍀',
  'capa': '', // the CAPA mascot celebrating, drawn from assets/emotes
};

/// What screen readers say for each reaction.
const emoteLabels = <String, String>{
  'wave': 'Oi',
  'smile': 'Feliz',
  'laugh': 'Risada',
  'wow': 'Surpreso',
  'sweat': 'Ufa',
  'think': 'Pensando',
  'cool': 'Confiante',
  'sad': 'Que azar',
  'clap': 'Aplausos',
  'thumbs': 'Boa jogada',
  'fire': 'Pegando fogo',
  'luck': 'Boa sorte',
  'capa': 'Comemoração CAPA',
};

/// One reaction, as an emoji or (for "capa") the mascot.
class EmoteGlyph extends StatelessWidget {
  final String id;
  final double size;
  const EmoteGlyph(this.id, {super.key, this.size = 32});

  @override
  Widget build(BuildContext context) {
    final child = id == 'capa'
        ? Image.asset('assets/emotes/emo-capa.png',
            width: size * 1.15, height: size * 1.15, filterQuality: FilterQuality.medium)
        : Text(emotes[id] ?? '🙂', style: TextStyle(fontSize: size, height: 1));
    return Semantics(label: emoteLabels[id], child: child);
  }
}

/// The picker: tap one to send it.
class EmotePicker extends StatelessWidget {
  final ValueChanged<String> onPick;
  const EmotePicker({super.key, required this.onPick});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: Brand.border, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 12),
          Text('Reagir', style: Brand.h3),
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final id in emotes.keys)
                InkWell(
                  key: Key('emote_$id'),
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => onPick(id),
                  child: Container(
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.04),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Brand.border),
                    ),
                    child: EmoteGlyph(id, size: 30),
                  ),
                ),
            ],
          ),
        ]),
      ),
    );
  }
}

/// A reaction popping up over a seat: springs in, floats a little, fades.
class EmoteBubble extends StatelessWidget {
  final String id;
  final double size;
  final Duration duration;
  final VoidCallback onDone;
  const EmoteBubble(
      {super.key, required this.id, required this.onDone, this.size = 30, this.duration = const Duration(milliseconds: 2600)});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: duration,
      onEnd: onDone,
      builder: (context, t, child) {
        final pop = Curves.elasticOut.transform((t / 0.25).clamp(0.0, 1.0));
        final fade = t < 0.8 ? 1.0 : (1 - t) / 0.2;
        return Transform.translate(
          offset: Offset(0, -10 * t),
          child: Opacity(opacity: fade.clamp(0.0, 1.0), child: Transform.scale(scale: pop, child: child)),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: const Color(0xE6101014),
          shape: BoxShape.circle,
          border: Border.all(color: Brand.gold.withValues(alpha: 0.6)),
          boxShadow: Brand.cardShadow,
        ),
        child: EmoteGlyph(id, size: size),
      ),
    );
  }
}
