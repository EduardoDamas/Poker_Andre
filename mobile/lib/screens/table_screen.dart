import 'package:flutter/material.dart';
import '../game/game_connection.dart';
import '../game/game_snapshot.dart';
import '../widgets/playing_card.dart';
import '../theme.dart';

/// The poker table: board + your hole cards + turn + action buttons, driven by
/// the GameConnection (real socket in the app, fake in tests).
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
    final amount = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Brand.charcoal,
        title: Text(type == 'bet' ? 'Apostar' : 'Aumentar para', style: const TextStyle(color: Brand.white)),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          style: const TextStyle(color: Brand.white),
          decoration: const InputDecoration(labelText: 'Fichas'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, int.tryParse(controller.text)),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    if (amount != null && amount > 0) _act(type, amount: amount);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: StreamBuilder<GameSnapshot>(
        stream: widget.connection.stream,
        initialData: widget.connection.current,
        builder: (context, snap) {
          final s = snap.data ?? const GameSnapshot();
          if (s.status == ConnStatus.error) {
            return Center(
              child: Text(s.error ?? 'Erro', key: const Key('tableError'),
                  style: const TextStyle(color: Brand.redBright)),
            );
          }
          if (s.status == ConnStatus.connecting) {
            return const Center(child: CircularProgressIndicator(color: Brand.red));
          }
          return _TableView(snapshot: s, onAct: _act, onAmount: _promptAmount);
        },
      ),
    );
  }
}

class _TableView extends StatelessWidget {
  final GameSnapshot snapshot;
  final void Function(String type, {int? amount}) onAct;
  final Future<void> Function(String type) onAmount;
  const _TableView({required this.snapshot, required this.onAct, required this.onAmount});

  @override
  Widget build(BuildContext context) {
    final s = snapshot;
    return Container(
      color: Brand.feltGreen,
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Board (community cards).
          const SizedBox(height: 8),
          const Text('Mesa', style: TextStyle(color: Brand.offWhite)),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: s.board.isEmpty
                ? const [Text('—', style: TextStyle(color: Brand.offWhite, fontSize: 24))]
                : s.board.map((c) => PlayingCard(c)).toList(),
          ),
          const Spacer(),

          // Turn / status banner.
          if (s.handComplete)
            Text(s.resultText ?? 'Mão encerrada.',
                key: const Key('resultBanner'),
                style: const TextStyle(color: Brand.white, fontSize: 18, fontWeight: FontWeight.bold))
          else
            Text(s.isMyTurn ? 'Sua vez' : 'Aguardando...',
                key: const Key('turnBanner'),
                style: TextStyle(
                    color: s.isMyTurn ? Brand.white : Brand.offWhite,
                    fontSize: 18,
                    fontWeight: s.isMyTurn ? FontWeight.bold : FontWeight.normal)),
          const SizedBox(height: 16),

          // My hole cards.
          const Text('Suas cartas', style: TextStyle(color: Brand.offWhite)),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: s.holeCards.isEmpty
                ? const [CardBack(), CardBack()]
                : s.holeCards.map((c) => PlayingCard(c)).toList(),
          ),
          const SizedBox(height: 16),

          // Action buttons (only when it's my turn).
          if (s.isMyTurn) _ActionBar(actions: s.legalActions, onAct: onAct, onAmount: onAmount),
        ],
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  final List<String> actions;
  final void Function(String type, {int? amount}) onAct;
  final Future<void> Function(String type) onAmount;
  const _ActionBar({required this.actions, required this.onAct, required this.onAmount});

  static const _labels = {
    'fold': 'Desistir',
    'check': 'Mesa',
    'call': 'Pagar',
    'bet': 'Apostar',
    'raise': 'Aumentar',
  };

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      alignment: WrapAlignment.center,
      children: actions.map((a) {
        return ElevatedButton(
          key: Key('action_$a'),
          onPressed: () => (a == 'bet' || a == 'raise') ? onAmount(a) : onAct(a),
          child: Text(_labels[a] ?? a),
        );
      }).toList(),
    );
  }
}
