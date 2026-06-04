import 'package:flutter/material.dart';
import '../engine/bot.dart';
import '../game/local_connection.dart';
import '../theme.dart';
import '../widgets/premium.dart';
import 'table_screen.dart';

/// Configure and start an offline solo match against AI bots.
class SoloSetupScreen extends StatefulWidget {
  const SoloSetupScreen({super.key});
  @override
  State<SoloSetupScreen> createState() => _SoloSetupScreenState();
}

class _SoloSetupScreenState extends State<SoloSetupScreen> {
  int _bots = 1;
  BotDifficulty _difficulty = BotDifficulty.medium;

  void _start() {
    final connection = LocalGameConnection(botCount: _bots, difficulty: _difficulty);
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => TableScreen(connection: connection, title: 'Solo vs Bots')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Jogar com Bots')),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Brand.crimsonDeep, Brand.bg]),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Brand.crimson.withValues(alpha: 0.4)),
              ),
              child: Row(children: [
                const Icon(Icons.smart_toy_outlined, color: Brand.gold, size: 30),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Modo Solo', style: Brand.h2),
                  const SizedBox(height: 4),
                  Text('Jogue offline contra a IA. Sem internet, sem espera.', style: Brand.caption),
                ])),
              ]),
            ),
            const SizedBox(height: 28),
            const SectionHeader('Número de bots'),
            const SizedBox(height: 12),
            Row(
              children: List.generate(5, (i) {
                final n = i + 1;
                final sel = _bots == n;
                return Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _bots = n),
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      height: 52,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        gradient: sel ? Brand.crimsonGrad : null,
                        color: sel ? null : Brand.surface,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: sel ? Brand.crimson : Brand.border),
                      ),
                      child: Text('$n', style: Brand.h3.copyWith(color: sel ? Colors.white : Brand.textSec)),
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 28),
            const SectionHeader('Dificuldade'),
            const SizedBox(height: 12),
            _difficultyTile(BotDifficulty.easy, 'Fácil', 'Bots passivos, jogam frouxo'),
            _difficultyTile(BotDifficulty.medium, 'Médio', 'Jogam pela força da mão'),
            _difficultyTile(BotDifficulty.hard, 'Difícil', 'Mais agressivos e seletivos'),
            const SizedBox(height: 28),
            GradientButton('Iniciar partida', icon: Icons.play_arrow_rounded, onPressed: _start),
          ],
        ),
      ),
    );
  }

  Widget _difficultyTile(BotDifficulty d, String name, String desc) {
    final sel = _difficulty == d;
    return GestureDetector(
      onTap: () => setState(() => _difficulty = d),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Brand.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: sel ? Brand.gold : Brand.border, width: sel ? 1.4 : 1),
        ),
        child: Row(children: [
          Icon(sel ? Icons.radio_button_checked : Icons.radio_button_off, color: sel ? Brand.gold : Brand.textTer, size: 20),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: Brand.label),
            const SizedBox(height: 2),
            Text(desc, style: Brand.caption),
          ])),
        ]),
      ),
    );
  }
}
