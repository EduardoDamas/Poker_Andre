import 'package:flutter/material.dart';
import '../game/game_connection.dart';
import '../game/game_snapshot.dart';
import '../widgets/playing_card.dart';
import '../widgets/premium.dart';
import '../theme.dart';
import '../format.dart';
import 'settings_screen.dart';

const _streetLabels = {
  'preflop': 'Pré-flop',
  'flop': 'Flop',
  'turn': 'Turn',
  'river': 'River',
  'complete': 'Showdown',
};
const _actionLabels = {
  'fold': 'Desistir',
  'check': 'Mesa',
  'call': 'Pagar',
  'bet': 'Apostar',
  'raise': 'Aumentar',
};

/// Premium poker table: felt vignette + board + private hole cards + action dock.
class TableScreen extends StatefulWidget {
  final GameConnection connection;
  final String title;
  const TableScreen({super.key, required this.connection, this.title = 'Mesa'});

  @override
  State<TableScreen> createState() => _TableScreenState();
}

class _TableScreenState extends State<TableScreen> {
  @override
  void dispose() {
    widget.connection.dispose();
    super.dispose();
  }

  void _act(String type, {int? amount}) => widget.connection.act(type, amount: amount);

  Future<void> _promptAmount(String type) async {
    final controller = TextEditingController();
    final amount = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Brand.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
            left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Brand.border, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 16),
          Text(type == 'bet' ? 'Apostar' : 'Aumentar para', style: Brand.h3),
          const SizedBox(height: 16),
          TextField(
            controller: controller,
            autofocus: true,
            keyboardType: TextInputType.number,
            style: Brand.money,
            decoration: const InputDecoration(labelText: 'Fichas'),
          ),
          const SizedBox(height: 16),
          GradientButton('Confirmar', variant: BtnVariant.gold,
              onPressed: () => Navigator.pop(ctx, int.tryParse(controller.text))),
        ]),
      ),
    );
    if (amount != null && amount > 0) _act(type, amount: amount);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        leading: const BackButton(color: Brand.textPri),
        title: Text(widget.title, style: Brand.h3),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: Brand.textSec),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen())),
          ),
        ],
      ),
      body: StreamBuilder<GameSnapshot>(
        stream: widget.connection.stream,
        initialData: widget.connection.current,
        builder: (context, snap) {
          final s = snap.data ?? const GameSnapshot();
          if (s.status == ConnStatus.error) {
            return _Centered(child: Text(s.error ?? 'Erro', key: const Key('tableError'),
                style: const TextStyle(color: Brand.danger, fontSize: 16)));
          }
          if (s.status == ConnStatus.connecting) {
            return const _Centered(child: CircularProgressIndicator(color: Brand.crimson));
          }
          return _TableView(snapshot: s, onAct: _act, onAmount: _promptAmount);
        },
      ),
    );
  }
}

/// A faint outline where a community card will land (pre-flop).
class _BoardSlot extends StatelessWidget {
  const _BoardSlot();
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 46,
      height: 46 * 1.4,
      margin: const EdgeInsets.symmetric(horizontal: 3),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Brand.feltTrim.withValues(alpha: 0.35)),
      ),
    );
  }
}

class _Centered extends StatelessWidget {
  final Widget child;
  const _Centered({required this.child});
  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(gradient: Brand.feltGrad),
        child: Center(child: child),
      );
}

class _TableView extends StatelessWidget {
  final GameSnapshot snapshot;
  final void Function(String type, {int? amount}) onAct;
  final Future<void> Function(String type) onAmount;
  const _TableView({required this.snapshot, required this.onAct, required this.onAmount});

  @override
  Widget build(BuildContext context) {
    final s = snapshot;
    return Column(children: [
      // ---- Felt area ----
      Expanded(
        child: Container(
          decoration: BoxDecoration(
            gradient: Brand.feltGrad,
            border: const Border(bottom: BorderSide(color: Brand.feltTrim, width: 2)),
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 60, 16, 16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Street chip + pot placeholder.
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: Brand.feltTrim.withValues(alpha: 0.5)),
                    ),
                    child: Text(_streetLabels[s.street] ?? s.street,
                        style: Brand.micro.copyWith(color: Brand.champagne)),
                  ),
                  const SizedBox(height: 24),
                  // Board: real cards once dealt; placeholders during pre-flop;
                  // a "waiting" hint only when no hand has been dealt to me.
                  if (s.board.isNotEmpty)
                    Row(mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Key by position+card so each card animates in once,
                          // exactly when its street is dealt (flop/turn/river).
                          for (var i = 0; i < s.board.length; i++)
                            PlayingCard(s.board[i], width: 46, key: ValueKey('board-$i-${s.board[i]}')),
                        ])
                  else if (s.holeCards.isNotEmpty || s.handComplete)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(5, (_) => const _BoardSlot()),
                    )
                  else
                    Column(children: [
                      const CardBack(width: 40),
                      const SizedBox(height: 12),
                      Text('Aguardando oponente…', style: Brand.caption.copyWith(color: Brand.champagne)),
                    ]),
                ],
              ),
            ),
          ),
        ),
      ),
      // ---- Player panel ----
      Container(
        width: double.infinity,
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            child: Column(children: [
              // Turn / result banner.
              if (s.handComplete)
                Column(
                  key: const Key('resultBanner'),
                  children: [
                    Text(s.resultText ?? 'Mão encerrada.', style: Brand.h3.copyWith(color: Brand.gold)),
                    if (s.prizeCents != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          gradient: Brand.goldGrad,
                          borderRadius: BorderRadius.circular(999),
                          boxShadow: Brand.glow(Brand.gold),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.emoji_events, size: 16, color: Brand.onGold),
                          const SizedBox(width: 6),
                          Text('Prêmio ${brl(s.prizeCents!)}',
                              style: const TextStyle(color: Brand.onGold, fontWeight: FontWeight.w800, fontSize: 16)),
                        ]),
                      ),
                    ],
                  ],
                )
              else
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  if (s.isMyTurn) ...[
                    const Icon(Icons.timer_outlined, size: 16, color: Brand.gold),
                    const SizedBox(width: 6),
                  ],
                  Text(s.isMyTurn ? 'Sua vez' : 'Aguardando…',
                      key: const Key('turnBanner'),
                      style: Brand.h3.copyWith(color: s.isMyTurn ? Brand.gold : Brand.textSec)),
                ]),
              const SizedBox(height: 14),
              // My hole cards (large), glow on my turn.
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: s.isMyTurn ? Brand.glow(Brand.gold) : null,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: s.holeCards.length >= 2
                      ? [
                          PlayingCard(s.holeCards[0], width: 64, key: ValueKey('hole-0-${s.holeCards[0]}')),
                          PlayingCard(s.holeCards[1], width: 64, key: ValueKey('hole-1-${s.holeCards[1]}')),
                        ]
                      : const [CardBack(width: 64), CardBack(width: 64)],
                ),
              ),
              const SizedBox(height: 18),
              // Action dock.
              if (s.isMyTurn)
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  alignment: WrapAlignment.center,
                  children: [
                    for (final a in s.legalActions)
                      GradientButton(
                        _actionLabels[a] ?? a,
                        key: Key('action_$a'),
                        expand: false,
                        variant: a == 'fold'
                            ? BtnVariant.danger
                            : (a == 'bet' || a == 'raise')
                                ? BtnVariant.gold
                                : BtnVariant.crimson,
                        onPressed: () => (a == 'bet' || a == 'raise') ? onAmount(a) : onAct(a),
                      ),
                  ],
                )
              else
                const SizedBox(height: 8),
            ]),
          ),
        ),
      ),
    ]);
  }
}
