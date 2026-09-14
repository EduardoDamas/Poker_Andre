import 'dart:async';
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

  /// Called once per hand the local player WINS (e.g. solo points reward).
  final void Function()? onHandWon;
  const TableScreen(
      {super.key, required this.connection, this.title = 'Mesa', this.onHandWon});

  @override
  State<TableScreen> createState() => _TableScreenState();
}

class _TableScreenState extends State<TableScreen> {
  StreamSubscription<GameSnapshot>? _winWatch;
  bool _rewardedThisHand = false;

  @override
  void initState() {
    super.initState();
    final onWon = widget.onHandWon;
    if (onWon != null) {
      _winWatch = widget.connection.stream.listen((s) {
        if (!s.handComplete) {
          _rewardedThisHand = false;
        } else if (!_rewardedThisHand && (s.resultText?.contains('venceu') ?? false)) {
          _rewardedThisHand = true;
          onWon();
        }
      });
    }
  }

  @override
  void dispose() {
    _winWatch?.cancel();
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
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
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
            // Near-black stage so the table artwork's dark background blends in.
            gradient: RadialGradient(radius: 1.2, colors: [Color(0xFF16161A), Brand.bg]),
            border: Border(bottom: BorderSide(color: Brand.crimsonDeep, width: 2)),
          ),
          child: SafeArea(
            bottom: false,
            child: Stack(
              children: [
                // The table artwork and the seats share one coordinate space so
                // the characters hug the rail on any screen shape.
                Center(
                  child: AspectRatio(
                    aspectRatio: 1.5, // tbl-crimson-base.webp is 1536×1024
                    child: Stack(children: [
                      Positioned.fill(
                        child: Image.asset(
                          'assets/table/tbl-crimson-base.webp',
                          fit: BoxFit.contain,
                          filterQuality: FilterQuality.high,
                          // Fallback: the old drawn felt, if the asset is missing.
                          errorBuilder: (_, _, _) => DecoratedBox(
                            decoration: ShapeDecoration(
                              gradient: Brand.feltGrad,
                              shape: const OvalBorder(
                                  side: BorderSide(color: Brand.feltTrim, width: 3)),
                              shadows: Brand.cardShadow,
                            ),
                          ),
                        ),
                      ),
                      // Characters seated around the table; absent players leave
                      // an empty seat.
                      if (s.seats.isNotEmpty)
                        Positioned.fill(child: _TableSeats(snapshot: s)),
                    ]),
                  ),
                ),
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
      // ---- Player panel (FIXED height so the table above never moves) ----
      Container(
        width: double.infinity,
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
            child: Column(children: [
              // Slot 1 — status line (constant height).
              SizedBox(
                height: 44,
                child: Center(
                  child: s.handComplete
                      ? Text(s.resultText ?? 'Mão encerrada.',
                          key: const Key('resultBanner'),
                          maxLines: 2,
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.ellipsis,
                          style: Brand.h3.copyWith(color: Brand.gold, fontSize: 15))
                      : Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                          if (s.isMyTurn) ...[
                            const Icon(Icons.timer_outlined, size: 16, color: Brand.gold),
                            const SizedBox(width: 6),
                          ],
                          Text(s.isMyTurn ? 'Sua vez' : 'Aguardando…',
                              key: const Key('turnBanner'),
                              style: Brand.h3
                                  .copyWith(color: s.isMyTurn ? Brand.gold : Brand.textSec)),
                        ]),
                ),
              ),
              // Slot 2 — my hole cards (constant height), glow on my turn.
              SizedBox(
                height: 104,
                child: Center(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: s.isMyTurn ? Brand.glow(Brand.gold) : null,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: s.holeCards.length >= 2
                          ? [
                              PlayingCard(s.holeCards[0],
                                  width: 64, key: ValueKey('hole-0-${s.holeCards[0]}')),
                              PlayingCard(s.holeCards[1],
                                  width: 64, key: ValueKey('hole-1-${s.holeCards[1]}')),
                            ]
                          : const [CardBack(width: 64), CardBack(width: 64)],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              // Slot 3 — action bar: ALWAYS the same place and height. Buttons
              // appear here in-place (no separate popping panel).
              SizedBox(
                height: 112,
                child: Center(
                  child: s.handComplete
                      ? Column(mainAxisSize: MainAxisSize.min, children: [
                          if (s.prizeCents != null) ...[
                            Container(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                              decoration: BoxDecoration(
                                gradient: Brand.goldGrad,
                                borderRadius: BorderRadius.circular(999),
                                boxShadow: Brand.glow(Brand.gold),
                              ),
                              child: Row(mainAxisSize: MainAxisSize.min, children: [
                                const Icon(Icons.emoji_events,
                                    size: 16, color: Brand.onGold),
                                const SizedBox(width: 6),
                                Text('Prêmio ${brl(s.prizeCents!)}',
                                    style: const TextStyle(
                                        color: Brand.onGold,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 15)),
                              ]),
                            ),
                            const SizedBox(height: 10),
                          ],
                          GradientButton('Sair da mesa',
                              key: const Key('leaveTable'),
                              icon: Icons.logout,
                              expand: false,
                              variant: BtnVariant.crimson,
                              onPressed: onLeave),
                        ])
                      : s.isMyTurn
                          ? Wrap(
                              spacing: 10,
                              runSpacing: 8,
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
                                    onPressed: () =>
                                        (a == 'bet' || a == 'raise') ? onAmount(a) : onAct(a),
                                  ),
                              ],
                            )
                          : const SizedBox.shrink(),
                ),
              ),
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
      // Ellipse matched to the tbl-crimson-base artwork: the rail's center sits
      // at ~40% of the frame height (the pedestal fills the lower part), spanning
      // ~92% × 60% of it — so avatars straddle the leather rail.
      final cx = c.maxWidth / 2, cy = c.maxHeight * 0.40;
      final rx = c.maxWidth * 0.46;
      final ry = c.maxHeight * 0.30;
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
