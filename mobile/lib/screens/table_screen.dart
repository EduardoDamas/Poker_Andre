import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../game/game_connection.dart';
import '../game/game_snapshot.dart';
import '../widgets/playing_card.dart';
import '../widgets/premium.dart';
import '../widgets/waiting_panel.dart';
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

  /// When set, a winner sees "Compartilhar vitória" — opens the share dialog
  /// and returns the points awarded (online tables only).
  final Future<int> Function()? onShareWin;
  const TableScreen(
      {super.key,
      required this.connection,
      this.title = 'Mesa',
      this.onHandWon,
      this.onShareWin});

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

  Future<void> _shareWin() async {
    final fn = widget.onShareWin;
    if (fn == null) return;
    try {
      final pts = await fn();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('+$pts pontos pela divulgação!')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))));
      }
    }
  }

  /// Leave the table (frees the seat on the server) and return to the lobby.
  /// In a promotion, leaving costs the place — so the player is asked first.
  Future<void> _leave() async {
    final s = widget.connection.current;
    final waiting = s.lobby != null && s.stage == null && s.status == ConnStatus.connected;
    if (s.inBracket || waiting) {
      final leave = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: Brand.surface,
          title: Text('Sair do torneio?', style: Brand.h3),
          content: Text(
            s.inBracket
                ? 'Se você sair agora, perde sua vaga no torneio e não pode voltar.'
                : 'Se você sair, sua vaga fica livre para outra pessoa. '
                    'Você pode voltar enquanto houver vagas.',
            key: const Key('leaveWarning'),
          ),
          actions: [
            TextButton(
              key: const Key('stayBtn'),
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Ficar'),
            ),
            TextButton(
              key: const Key('confirmLeaveBtn'),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sair', style: TextStyle(color: Brand.danger)),
            ),
          ],
        ),
      );
      if (leave != true) return;
    }
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
    // Android's back button goes through _leave too (it asks in a promotion).
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: _scaffold(context),
    );
  }

  Widget _scaffold(BuildContext context) {
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
                textAlign: TextAlign.center,
                style: const TextStyle(color: Brand.danger, fontSize: 16, height: 1.4)));
          }
          if (s.status == ConnStatus.connecting) {
            return _Centered(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const CircularProgressIndicator(color: Brand.crimson),
                if (s.error != null) ...[
                  const SizedBox(height: 16),
                  Text(s.error!, key: const Key('reconnecting'), style: Brand.body),
                ],
              ]),
            );
          }
          return _TableView(
              snapshot: s,
              roomName: widget.title,
              onAct: _act,
              onAmount: _promptAmount,
              onLeave: _leave,
              onShare: widget.onShareWin == null ? null : _shareWin);
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
      width: 42,
      height: 42 * 1.4,
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
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Center(child: child),
      );
}

/// A hand starts once this many players are seated. The scheduled 10-minute
/// rooms will send their own minimum; until then it is the table's own rule.
const int _minPlayersToStart = 2;

/// True while the room is filling: nobody has been dealt in yet (and, in a
/// promotion, the player is not yet seated at a bracket table).
bool _waitingToStart(GameSnapshot s) =>
    s.holeCards.isEmpty && !s.handComplete && s.board.isEmpty && s.stage == null && s.notice == null;

String _hhmm(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

/// A promotion's waiting room: places held against the minimum, the start time,
/// and the rules that matter while waiting. Re-evaluated every second, so the
/// wording turns from "começa às 20:00" to "aguardando o mínimo" on its own.
class _PromoWaiting extends StatefulWidget {
  final PromoLobby lobby;
  final String roomName;
  const _PromoWaiting({required this.lobby, required this.roomName});

  @override
  State<_PromoWaiting> createState() => _PromoWaitingState();
}

class _PromoWaitingState extends State<_PromoWaiting> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.lobby;
    final beforeStart = DateTime.now().isBefore(l.startsAt);
    final missing = l.minPlayers - l.registered;
    final anyway = l.startAnywayAt;
    final foot = StringBuffer('Mantenha o app aberto: só joga quem estiver na sala no início.');
    if (missing > 0 && anyway != null) {
      foot.write('\nSe não completar, começa às ${_hhmm(anyway)} com quem estiver na sala.');
    }
    return WaitingPanel(
      roomName: widget.roomName,
      seated: l.registered,
      needed: l.minPlayers,
      startsAt: beforeStart ? l.startsAt : (missing > 0 ? anyway : null),
      headline: beforeStart
          ? 'O torneio começa às ${_hhmm(l.startsAt)}'
          : missing > 0
              ? 'Aguardando o mínimo de ${l.minPlayers} inscritos'
              : 'O torneio começa em instantes',
      countText: 'Inscritos: ${l.registered} · mínimo ${l.minPlayers} · ${l.maxPlayers} vagas',
      doneText: 'Mínimo atingido ✓',
      footnote: foot.toString(),
    );
  }
}

/// A promotion message over the table: won the table and waiting for the next
/// one, knocked out (with the place), or the tournament is over.
class _NoticePanel extends StatelessWidget {
  final String text;
  final Future<void> Function()? onLeave;
  const _NoticePanel({required this.text, this.onLeave});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black.withValues(alpha: 0.35),
      alignment: Alignment.center,
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
          Text(text,
              key: const Key('tournamentNotice'),
              textAlign: TextAlign.center,
              style: Brand.h3.copyWith(color: Brand.champagne, height: 1.4)),
          if (onLeave != null) ...[
            const SizedBox(height: 18),
            GradientButton('Sair',
                key: const Key('noticeLeave'),
                icon: Icons.logout,
                expand: false,
                variant: BtnVariant.crimson,
                onPressed: onLeave),
          ],
        ]),
      ),
    );
  }
}

/// "Sua vez", with the seconds left when the table plays against the clock.
class _TurnLabel extends StatefulWidget {
  final bool isMyTurn;
  final DateTime? deadline;
  const _TurnLabel({required this.isMyTurn, this.deadline});

  @override
  State<_TurnLabel> createState() => _TurnLabelState();
}

class _TurnLabelState extends State<_TurnLabel> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(_TurnLabel old) {
    super.didUpdateWidget(old);
    _sync();
  }

  void _sync() {
    final ticking = widget.isMyTurn && widget.deadline != null;
    if (ticking && _tick == null) {
      _tick = Timer.periodic(const Duration(milliseconds: 500), (_) {
        if (mounted) setState(() {});
      });
    } else if (!ticking) {
      _tick?.cancel();
      _tick = null;
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.deadline;
    var text = widget.isMyTurn ? 'Sua vez' : 'Aguardando…';
    var color = widget.isMyTurn ? Brand.gold : Brand.textSec;
    if (widget.isMyTurn && d != null) {
      final left = (d.difference(DateTime.now()).inMilliseconds / 1000).ceil().clamp(0, 999);
      text = 'Sua vez · ${left}s';
      if (left <= 5) color = Brand.danger;
    }
    return Text(text, key: const Key('turnBanner'), style: Brand.h3.copyWith(color: color));
  }
}

class _TableView extends StatelessWidget {
  final GameSnapshot snapshot;
  final String roomName;
  final void Function(String type, {int? amount}) onAct;
  final Future<void> Function(String type) onAmount;
  final Future<void> Function() onLeave;
  final Future<void> Function()? onShare;
  const _TableView(
      {required this.snapshot,
      required this.roomName,
      required this.onAct,
      required this.onAmount,
      required this.onLeave,
      this.onShare});

  @override
  Widget build(BuildContext context) {
    final s = snapshot;
    final size = MediaQuery.of(context).size;
    // Landscape: the player panel docks to the RIGHT so the felt area keeps
    // roughly the artwork's 3:2 shape and the table fills the screen.
    final landscape = size.width > size.height;

    final felt = Container(
          decoration: BoxDecoration(
            // Near-black stage so the table artwork's dark background blends in.
            gradient: const RadialGradient(
                radius: 1.2, colors: [Color(0xFF16161A), Brand.bg]),
            border: landscape
                ? const Border(right: BorderSide(color: Brand.crimsonDeep, width: 2))
                : const Border(bottom: BorderSide(color: Brand.crimsonDeep, width: 2)),
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
                      // Street chip + community board, pinned to the FELT
                      // centre of the artwork (the rail's centre sits at ~40%
                      // of the frame — the pedestal fills the lower part).
                      Align(
                        alignment: const Alignment(0, -0.2),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.35),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                    color: Brand.feltTrim.withValues(alpha: 0.5)),
                              ),
                              child: Text(_streetLabels[s.street] ?? s.street,
                                  style:
                                      Brand.micro.copyWith(color: Brand.champagne)),
                            ),
                            const SizedBox(height: 10),
                            // Board: real cards once dealt; placeholders during
                            // pre-flop; a "waiting" hint before any hand.
                            if (s.board.isNotEmpty)
                              Row(
                                  mainAxisSize: MainAxisSize.min,
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    // Key by position+card so each card animates
                                    // in once, when its street is dealt.
                                    for (var i = 0; i < s.board.length; i++)
                                      PlayingCard(s.board[i],
                                          width: s.maxSeats > 8 ? 34 : 42,
                                          key: ValueKey('board-$i-${s.board[i]}')),
                                  ])
                            else if (s.holeCards.isNotEmpty || s.handComplete)
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: List.generate(5, (_) => const _BoardSlot()),
                              )
                            else
                              Column(mainAxisSize: MainAxisSize.min, children: [
                                const CardBack(width: 40),
                                const SizedBox(height: 8),
                                Text('Aguardando oponente…',
                                    style: Brand.caption
                                        .copyWith(color: Brand.champagne)),
                              ]),
                          ],
                        ),
                      ),
                    ]),
                  ),
                ),
                // Where the player is in a promotion bracket — above the table,
                // clear of the seats.
                if (s.stage != null)
                  Positioned(
                    top: 8,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Text(s.stage!.toUpperCase(),
                          key: const Key('stageLabel'),
                          style: Brand.micro.copyWith(
                              color: Brand.gold, letterSpacing: 1.5, fontWeight: FontWeight.w800)),
                    ),
                  ),
                // Last child = on top: while the room is still filling, a
                // still panel explains the wait instead of leaving the player
                // looking at an empty table.
                if (_waitingToStart(s))
                  Positioned.fill(
                    child: s.lobby != null
                        ? _PromoWaiting(lobby: s.lobby!, roomName: roomName)
                        : WaitingPanel(
                            roomName: roomName,
                            seated: s.seats.whereType<SeatInfo>().length,
                            needed: _minPlayersToStart,
                          ),
                  )
                else if (s.notice != null)
                  Positioned.fill(
                    child: _NoticePanel(text: s.notice!, onLeave: s.out ? onLeave : null),
                  ),
              ],
            ),
          ),
        );

    // ---- Player panel (fixed footprint so the table never moves) ----
    final panel = Container(
        width: double.infinity,
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: SafeArea(
          top: landscape,
          bottom: !landscape,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
            child: Column(
                mainAxisAlignment:
                    landscape ? MainAxisAlignment.center : MainAxisAlignment.start,
                children: [
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
                          _TurnLabel(isMyTurn: s.isMyTurn, deadline: s.turnDeadline),
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
              // appear here in-place (no separate popping panel). In landscape
              // (side panel) they stack vertically, full panel width.
              SizedBox(
                height: landscape ? 184 : 112,
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
                          Row(mainAxisSize: MainAxisSize.min, children: [
                            if (onShare != null && s.prizeCents != null) ...[
                              GradientButton('Compartilhar',
                                  key: const Key('shareWin'),
                                  icon: Icons.share,
                                  expand: false,
                                  variant: BtnVariant.gold,
                                  onPressed: onShare),
                              const SizedBox(width: 8),
                            ],
                            // Still in a promotion bracket: the next hand (or
                            // table) comes on its own, and leaving forfeits.
                            if (s.inBracket)
                              Flexible(
                                child: Text('A próxima mão começa em instantes…',
                                    key: const Key('bracketNext'),
                                    textAlign: TextAlign.center,
                                    style: Brand.caption.copyWith(color: Brand.champagne)),
                              )
                            else
                              GradientButton('Sair da mesa',
                                  key: const Key('leaveTable'),
                                  icon: Icons.logout,
                                  expand: false,
                                  variant: BtnVariant.crimson,
                                  onPressed: onLeave),
                          ]),
                        ])
                      : s.isMyTurn
                          // ALL actions always visible, always in the same
                          // place: one row in portrait, stacked in landscape.
                          ? (landscape
                              ? Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    for (final a in s.legalActions) ...[
                                      GradientButton(
                                        _actionLabels[a] ?? a,
                                        key: Key('action_$a'),
                                        variant: a == 'fold'
                                            ? BtnVariant.danger
                                            : (a == 'bet' || a == 'raise')
                                                ? BtnVariant.gold
                                                : BtnVariant.crimson,
                                        onPressed: () => (a == 'bet' || a == 'raise')
                                            ? onAmount(a)
                                            : onAct(a),
                                      ),
                                      if (a != s.legalActions.last)
                                        const SizedBox(height: 8),
                                    ],
                                  ],
                                )
                              : Row(
                                  children: [
                                    for (final a in s.legalActions) ...[
                                      Expanded(
                                        child: GradientButton(
                                          _actionLabels[a] ?? a,
                                          key: Key('action_$a'),
                                          variant: a == 'fold'
                                              ? BtnVariant.danger
                                              : (a == 'bet' || a == 'raise')
                                                  ? BtnVariant.gold
                                                  : BtnVariant.crimson,
                                          onPressed: () =>
                                              (a == 'bet' || a == 'raise')
                                                  ? onAmount(a)
                                                  : onAct(a),
                                        ),
                                      ),
                                      if (a != s.legalActions.last)
                                        const SizedBox(width: 8),
                                    ],
                                  ],
                                ))
                          : const SizedBox.shrink(),
                ),
              ),
            ]),
          ),
        ),
      );

    return landscape
        ? Row(children: [
            Expanded(child: felt),
            SizedBox(width: 320, child: panel),
          ])
        : Column(children: [Expanded(child: felt), panel]);
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
      // A final table of 10 needs smaller avatars to keep them apart.
      final seatSize = max > 8 ? 42.0 : 52.0;
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
          child: _SeatWidget(size: seatSize, seat: seat, acting: acting, compact: max > 8),
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
  // A table of 10: opponents drop the "Jogador" caption (it says nothing and,
  // at the side edges, would run into the seat below).
  final bool compact;
  const _SeatWidget({required this.size, required this.seat, required this.acting, this.compact = false});

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
        if (seat.isMe || !compact)
          Text(seat.isMe ? 'Você' : 'Jogador',
              style: Brand.micro.copyWith(color: seat.isMe ? Brand.champagne : Brand.textSec)),
      ],
    );
  }
}
