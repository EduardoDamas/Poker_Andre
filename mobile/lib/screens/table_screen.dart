import 'dart:math' as math;
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

  /// Leave the table (frees the seat on the server) and return to the lobby.
  Future<void> _leave() async {
    await widget.connection.leaveTable();
    if (mounted) Navigator.of(context).pop();
  }

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
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Brand.textPri),
          onPressed: _leave,
        ),
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
          return _TableView(snapshot: s, onAct: _act, onAmount: _promptAmount, onLeave: _leave);
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
  final Future<void> Function() onLeave;
  const _TableView({required this.snapshot, required this.onAct, required this.onAmount, required this.onLeave});

  @override
  Widget build(BuildContext context) {
    final s = snapshot;
    return Column(children: [
      // ---- Felt area ----
      Expanded(
        child: Container(
          decoration: const BoxDecoration(
            gradient: RadialGradient(radius: 1.2, colors: [Brand.feltDeep, Brand.bg]),
            border: Border(bottom: BorderSide(color: Brand.feltTrim, width: 2)),
          ),
          child: SafeArea(
            bottom: false,
            child: Stack(
              children: [
                // The round table surface.
                Center(
                  child: FractionallySizedBox(
                    widthFactor: 0.82,
                    heightFactor: 0.66,
                    child: DecoratedBox(
                      decoration: ShapeDecoration(
                        gradient: Brand.feltGrad,
                        shape: const OvalBorder(side: BorderSide(color: Brand.feltTrim, width: 3)),
                        shadows: Brand.cardShadow,
                      ),
                    ),
                  ),
                ),
                // Characters seated around the table; absent players leave an empty seat.
                if (s.seats.isNotEmpty) Positioned.fill(child: _TableSeats(snapshot: s)),
                // Center: street chip + community board.
                Padding(
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
              ],
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
                    const SizedBox(height: 16),
                    GradientButton('Sair da mesa',
                        key: const Key('leaveTable'),
                        icon: Icons.logout,
                        variant: BtnVariant.crimson,
                        onPressed: onLeave),
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

/// Lays out the seats evenly around the round table. Occupied seats show a
/// character avatar; empty seats show a faint placeholder ring. The local
/// player is anchored at the bottom of the table.
class _TableSeats extends StatelessWidget {
  final GameSnapshot snapshot;
  const _TableSeats({required this.snapshot});

  @override
  Widget build(BuildContext context) {
    final s = snapshot;
    final max = s.maxSeats > 0 ? s.maxSeats : s.seats.length;
    if (max <= 0) return const SizedBox.shrink();

    final byPos = <int, SeatInfo>{};
    int? myPos;
    for (final seat in s.seats) {
      if (seat == null) continue;
      byPos[seat.position] = seat;
      if (seat.isMe) myPos = seat.position;
    }

    return LayoutBuilder(builder: (context, c) {
      const seatSize = 52.0;
      final cx = c.maxWidth / 2, cy = c.maxHeight / 2;
      final rx = (c.maxWidth / 2) - seatSize * 0.55;
      final ry = (c.maxHeight / 2) - seatSize * 0.55;
      final children = <Widget>[];
      for (var i = 0; i < max; i++) {
        // Rotate so that my seat (or seat 0) sits at the bottom (pi/2 on screen).
        final offset = myPos == null ? i : i - myPos;
        final angle = (math.pi / 2) + (offset / max) * 2 * math.pi;
        final dx = cx + rx * math.cos(angle) - seatSize / 2;
        final dy = cy + ry * math.sin(angle) - seatSize / 2;
        final seat = byPos[i];
        final acting = seat != null && s.actingPlayerId == seat.userId;
        children.add(Positioned(
          left: dx.clamp(0.0, c.maxWidth - seatSize),
          top: dy.clamp(0.0, c.maxHeight - seatSize),
          child: _SeatWidget(size: seatSize, seat: seat, acting: acting),
        ));
      }
      return Stack(children: children);
    });
  }
}

class _SeatWidget extends StatelessWidget {
  final double size;
  final SeatInfo? seat;
  final bool acting;
  const _SeatWidget({required this.size, required this.seat, required this.acting});

  @override
  Widget build(BuildContext context) {
    final seat = this.seat;
    if (seat == null) {
      // Empty seat — a faint placeholder ring.
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.black.withValues(alpha: 0.28),
          border: Border.all(color: Brand.feltTrim.withValues(alpha: 0.35), width: 1.5),
        ),
        child: Icon(Icons.person_outline,
            color: Brand.feltTrim.withValues(alpha: 0.45), size: size * 0.5),
      );
    }
    final ring = acting
        ? Brand.gold
        : (seat.isMe ? Brand.crimson : Brand.feltTrim.withValues(alpha: 0.7));
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: ring, width: acting ? 3 : 2),
            boxShadow: acting ? Brand.glow(Brand.gold) : Brand.cardShadow,
          ),
          child: ClipOval(
            child: Image.asset(
              'assets/characters/avatars/chr-avatar-default.png',
              fit: BoxFit.cover,
              filterQuality: FilterQuality.high,
            ),
          ),
        ),
        const SizedBox(height: 3),
        Text(seat.isMe ? 'Você' : 'Jogador',
            style: Brand.micro.copyWith(color: seat.isMe ? Brand.champagne : Brand.textSec)),
      ],
    );
  }
}
