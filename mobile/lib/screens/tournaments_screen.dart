import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets/premium.dart';

/// Torneios — preview of the tournament system (engine is a deferred module).
class TournamentsScreen extends StatelessWidget {
  const TournamentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Torneios')),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Brand.crimsonDeep, Brand.bg]),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Brand.gold.withValues(alpha: 0.4)),
                boxShadow: Brand.cardShadow,
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(Icons.emoji_events, color: Brand.gold, size: 26),
                  const SizedBox(width: 10),
                  Text('Torneios CAPA', style: Brand.h2),
                ]),
                const SizedBox(height: 10),
                Text('Disputas eliminatórias com até 800 participantes e premiação '
                    'em dinheiro por ocupação da sala.', style: Brand.body),
              ]),
            ),
            const SizedBox(height: 24),
            const SectionHeader('Como funciona (Poker)'),
            const SizedBox(height: 12),
            GlassCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _phase('Fase 1', '800 jogadores'),
                _phase('Fase 2', '100 jogadores'),
                _phase('Fase 3', '16 jogadores'),
                _phase('Final', '2 jogadores'),
                const Divider(color: Brand.border, height: 24),
                Text('Premiação: de 20× a 200× o valor da inscrição, conforme a '
                    'ocupação da sala.', style: Brand.caption),
              ]),
            ),
            const SizedBox(height: 24),
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(color: Brand.surface2, borderRadius: BorderRadius.circular(999)),
                child: Text('Em breve', style: Brand.micro.copyWith(color: Brand.gold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _phase(String name, String count) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(children: [
          const Icon(Icons.chevron_right, color: Brand.crimson, size: 18),
          const SizedBox(width: 8),
          Text(name, style: Brand.label),
          const Spacer(),
          Text(count, style: Brand.caption),
        ]),
      );
}
