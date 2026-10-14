import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../game/game_connection.dart';
import '../game/game_snapshot.dart';
import '../widgets/chips.dart';
import '../widgets/emotes.dart';
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
    _emoteTimer?.cancel();
    widget.connection.dispose();
    super.dispose();
  }

  void _act(String type, {int? amount}) => widget.connection.act(type, amount: amount);

  // The server takes one reaction every 3 s; the button rests in between.
  static const _emoteRest = Duration(seconds: 3);
  bool _emoteResting = false;
  Timer? _emoteTimer;

  Future<void> _openEmotes() async {
    if (_emoteResting) return;
    final id = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Brand.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (ctx) => EmotePicker(onPick: (id) => Navigator.pop(ctx, id)),
    );
    if (id == null || !mounted) return;
    widget.connection.emote(id);
    setState(() => _emoteResting = true);
    _emoteTimer = Timer(_emoteRest, () {
      if (mounted) setState(() => _emoteResting = false);
    });
  }

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
              onShare: widget.onShareWin == null ? null : _shareWin,
              onEmotes: _emoteResting ? null : _openEmotes);
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
            // Out of the tournament: back to the room list, to keep playing.
            GradientButton('Ver outros níveis',
                key: const Key('noticeLeave'),
                icon: Icons.grid_view_rounded,
                expand: false,
                variant: BtnVariant.gold,
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
  final Future<void> Function()? onEmotes; // null while the last one rests
  const _TableView(
      {required this.snapshot,
      required this.roomName,
      required this.onAct,
      required this.onAmount,
      required this.onLeave,
      this.onShare,
      this.onEmotes});

  @override
  Widget build(BuildContext context) {
    final s = snapshot;
    final size = MediaQuery.of(context).size;
    // Landscape: the player panel docks to the RIGHT so the felt area keeps
    // roughly the artwork's 3:2 shape and the table fills the screen.
    final landscape = size.width > size.height;
    // A phone on its side (about 360 dp tall) has no room for the actions
    // stacked in the side panel: they go in one row there, as in portrait.
    final stackActions = landscape && size.height >= 440;

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
                              child: Row(mainAxisSize: MainAxisSize.min, children: [
                                Text(_streetLabels[s.street] ?? s.street,
                                    style: Brand.micro.copyWith(color: Brand.champagne)),
                                // The pot gathered from the earlier streets.
                                if (s.pot > 0) ...[
                                  const SizedBox(width: 8),
                                  PokerChip(size: 12, amount: s.pot),
                                  const SizedBox(width: 4),
                                  Text('Pote ${chipCount(s.pot)}',
                                      key: const Key('potLabel'),
                                      style: Brand.micro.copyWith(
                                          color: Brand.gold, fontWeight: FontWeight.w800)),
                                ],
                              ]),
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
                // Characters seated around the table (absent players leave an
                // empty seat), then the bets in front of them and the chips
                // flying to the pot and on to the winner. They use the whole
                // felt area: in portrait the seats spread above and below the
                // table, leaving the felt for the board, the bets and the pot.
                if (s.seats.isNotEmpty)
                  Positioned.fill(child: _TableSeats(snapshot: s)),
                if (s.seats.isNotEmpty)
                  Positioned.fill(child: IgnorePointer(child: _ChipLayer(snapshot: s))),
                // Reactions popping up over the seats.
                if (s.seats.isNotEmpty)
                  Positioned.fill(child: IgnorePointer(child: _EmoteLayer(snapshot: s))),
                // React — only seated, with the table in view.
                if (s.seats.any((seat) => seat?.isMe ?? false) && !_waitingToStart(s) && s.notice == null)
                  Positioned(
                    right: 10,
                    bottom: 10,
                    child: _EmoteButton(onTap: onEmotes),
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
                height: stackActions ? 184 : 112,
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
                          ? (stackActions
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

/// Where things sit in the felt area: the seats round the table, each
/// player's bet in front of them, and the pot in the middle. Shared by the
/// seats and the chip layer so chips fly between the right places.
///
/// [box] is the whole felt area; the table artwork is the 3:2 rectangle
/// centred in it (as the Center + AspectRatio above draws it).
class _SeatGeometry {
  final Size box;
  final int max;
  final int? myPos;
  _SeatGeometry(this.box, this.max, this.myPos);

  factory _SeatGeometry.of(GameSnapshot s, Size box) {
    int? myPos;
    for (final seat in s.seats) {
      if (seat != null && seat.isMe) myPos = seat.position;
    }
    return _SeatGeometry(box, s.maxSeats > 0 ? s.maxSeats : s.seats.length, myPos);
  }

  // A final table of 10 needs smaller avatars to keep them apart.
  double get seatSize => max > 8 ? 42.0 : 52.0;

  Rect get table {
    final w = math.min(box.width, box.height * 1.5);
    final h = w / 1.5;
    return Rect.fromLTWH((box.width - w) / 2, (box.height - h) / 2, w, h);
  }

  // Ellipse matched to the tbl-crimson-base artwork: the rail's center sits at
  // ~40% of the frame height (the pedestal fills the lower part), spanning
  // ~92% × 60% of it — so avatars straddle the leather rail. In portrait,
  // where the table leaves room above and below, the seats spread out into
  // it (up to the table's full height) so the felt stays clear for the chips.
  Offset get middle => Offset(table.center.dx, table.top + table.height * 0.40);
  double get _rx => table.width * 0.46;
  double get _ry {
    final rail = table.height * 0.30;
    final half = seatSize / 2;
    final room = math.min(middle.dy - half - 30, box.height - middle.dy - half - 30);
    return room.clamp(rail, math.max(rail, table.height * 0.5));
  }

  double _angle(int position) {
    // Rotate so that my seat (or seat 0) sits at the bottom (pi/2 on screen).
    final offset = myPos == null ? position : position - myPos!;
    return (math.pi / 2) + (offset / max) * 2 * math.pi;
  }

  Offset seat(int position) {
    final a = _angle(position);
    final half = seatSize / 2;
    return Offset(
      (middle.dx + _rx * math.cos(a)).clamp(half, math.max(half, box.width - half)),
      (middle.dy + _ry * math.sin(a)).clamp(half, math.max(half, box.height - half)),
    );
  }

  /// The street label, the pot and the five board cards — kept clear of bets.
  Rect get _boardArea {
    final cardW = max > 8 ? 34.0 : 42.0;
    return Rect.fromCenter(center: middle, width: 5 * (cardW + 6) + 16, height: 22 + 10 + cardW * 1.4 + 10);
  }

  /// In front of the seat, toward the middle of the felt. Below a seat the
  /// bet clears its chip plate; above one it sits just over the avatar. Where
  /// that would land on the board (a phone on its side keeps the seats on the
  /// rail), the bet sits beside the avatar instead, on the side facing the middle.
  Offset bet(int position) {
    final a = _angle(position);
    final at = seat(position);
    final down = -math.sin(a) > 0;
    final inFront =
        at + Offset(-math.cos(a) * (seatSize * 0.5 + 26), -math.sin(a) * (seatSize * 0.5 + (down ? 40 : 8)));
    if (!_boardArea.overlaps(Rect.fromCenter(center: inFront, width: 64, height: 20))) return inFront;
    final side = math.cos(a) > 0.2 ? -1.0 : 1.0; // right of a seat at the top or bottom
    return at + Offset(side * (seatSize * 0.5 + 36), down ? 6 : -6);
  }

  /// The pot, next to the street label above the board.
  Offset get pot => middle + Offset(0, max > 8 ? -30 : -36);
}

/// Lays out the seats evenly around the round table. Occupied seats show a
/// character avatar with their chips; empty seats show a faint placeholder
/// ring. The local player is anchored at the bottom of the table.
class _TableSeats extends StatelessWidget {
  final GameSnapshot snapshot;
  const _TableSeats({required this.snapshot});

  @override
  Widget build(BuildContext context) {
    final s = snapshot;
    final max = s.maxSeats > 0 ? s.maxSeats : s.seats.length;
    if (max <= 0) return const SizedBox.shrink();

    final byPos = <int, SeatInfo>{};
    for (final seat in s.seats.whereType<SeatInfo>()) {
      byPos[seat.position] = seat;
    }

    return LayoutBuilder(builder: (context, c) {
      final g = _SeatGeometry.of(s, c.biggest);
      final seatSize = g.seatSize;
      final children = <Widget>[];
      for (var i = 0; i < max; i++) {
        final at = g.seat(i);
        final seat = byPos[i];
        final acting = seat != null && s.actingPlayerId == seat.userId;
        children.add(Positioned(
          left: at.dx - seatSize / 2,
          top: at.dy - seatSize / 2,
          child: _SeatWidget(
            size: seatSize,
            seat: seat,
            acting: acting,
            compact: max > 8,
            stack: seat == null ? null : s.stacks[seat.userId],
            folded: seat != null && s.folded.contains(seat.userId),
          ),
        ));
      }
      return Stack(clipBehavior: Clip.none, children: children);
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
  final int? stack; // chips behind; null when the server sends none
  final bool folded;
  const _SeatWidget({
    required this.size,
    required this.seat,
    required this.acting,
    this.compact = false,
    this.stack,
    this.folded = false,
  });

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
    final stack = this.stack;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // The avatar, with the chip count on a plate across its lower edge.
        SizedBox(
          width: size,
          height: size,
          child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
            AnimatedOpacity(
              duration: const Duration(milliseconds: 250),
              opacity: folded ? 0.4 : 1,
              child: Container(
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
            ),
            if (stack != null)
              Positioned(
                bottom: -7,
                child: _StackPlate(stack: stack, highlight: seat.isMe),
              ),
          ]),
        ),
        SizedBox(height: stack != null ? 9 : 3),
        // The chip plate already marks an opponent; "Jogador" is only shown
        // to a server that sends no chips.
        if (seat.isMe || (stack == null && !compact))
          Text(seat.isMe ? 'Você' : 'Jogador',
              style: Brand.micro.copyWith(color: seat.isMe ? Brand.champagne : Brand.textSec)),
      ],
    );
  }
}

/// The chips behind a player; counts up or down when the stack changes.
class _StackPlate extends StatelessWidget {
  final int stack;
  final bool highlight;
  const _StackPlate({required this.stack, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: stack.toDouble()),
      duration: const Duration(milliseconds: 600),
      curve: Curves.easeOutCubic,
      builder: (context, v, _) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(
          color: const Color(0xE6101014),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
              color: (highlight ? Brand.gold : Brand.feltTrim).withValues(alpha: 0.7), width: 1),
        ),
        child: Text(stack == 0 ? 'All-in' : chipCount(v.round()),
            key: const Key('stackPlate'),
            style: TextStyle(
                color: highlight ? Brand.gold : Brand.textPri,
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
                height: 1.2)),
      ),
    );
  }
}

/// One movement of chips across the felt.
class _Flight {
  final int id;
  final Offset from;
  final Offset to;
  final int amount;
  final Duration delay;
  _Flight(this.id, this.from, this.to, this.amount, {this.delay = Duration.zero});
}

/// The bets in front of each player, and the chips' movements: a bet slides
/// out from the seat, a street's bets sweep into the pot, and the pot goes to
/// whoever won it.
class _ChipLayer extends StatefulWidget {
  final GameSnapshot snapshot;
  const _ChipLayer({required this.snapshot});

  @override
  State<_ChipLayer> createState() => _ChipLayerState();
}

class _ChipLayerState extends State<_ChipLayer> {
  static const _fly = Duration(milliseconds: 420);
  final _flights = <_Flight>[];
  var _next = 0;
  Size _box = Size.zero;

  Map<String, int> _positions(GameSnapshot s) => {
        for (final seat in s.seats)
          if (seat != null) seat.userId: seat.position,
      };

  @override
  void didUpdateWidget(_ChipLayer old) {
    super.didUpdateWidget(old);
    final was = old.snapshot, now = widget.snapshot;
    if (_box == Size.zero) return;
    final g = _SeatGeometry.of(now, _box);
    final pos = _positions(now);
    final added = <_Flight>[];

    // A bet made or raised: chips slide from the seat to the spot in front.
    for (final e in now.bets.entries) {
      final p = pos[e.key];
      final before = was.bets[e.key] ?? 0;
      if (p == null || e.value <= before) continue;
      added.add(_Flight(_next++, g.seat(p), g.bet(p), e.value - before));
    }
    // The street (or the hand) ended: what was in front sweeps into the pot.
    final swept = now.bets.isEmpty && was.bets.isNotEmpty;
    if (swept) {
      for (final e in was.bets.entries) {
        final p = pos[e.key];
        if (p != null) added.add(_Flight(_next++, g.bet(p), g.pot, e.value));
      }
    }
    // The hand is over: the pot goes to the winner(s).
    if (now.payouts.isNotEmpty && was.payouts.isEmpty) {
      for (final e in now.payouts.entries) {
        final p = pos[e.key];
        if (p != null) {
          added.add(_Flight(_next++, g.pot, g.seat(p), e.value, delay: swept ? _fly : Duration.zero));
        }
      }
    }
    if (added.isNotEmpty) setState(() => _flights.addAll(added));
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      _box = c.biggest;
      final s = widget.snapshot;
      final g = _SeatGeometry.of(s, _box);
      final pos = _positions(s);
      final small = g.max > 8;
      return Stack(clipBehavior: Clip.none, children: [
        for (final e in s.bets.entries)
          if (pos[e.key] != null)
            _centeredAt(
              g.bet(pos[e.key]!),
              ChipStackLabel(key: ValueKey('bet-${e.key}'), amount: e.value, chipSize: small ? 12 : 14),
            ),
        for (final f in _flights)
          _FlyingChips(
            key: ValueKey('flight-${f.id}'),
            flight: f,
            duration: _fly,
            size: small ? 12 : 14,
            onDone: () {
              if (mounted) setState(() => _flights.remove(f));
            },
          ),
      ]);
    });
  }

  // Centre [child] on [at] without knowing its size.
  Widget _centeredAt(Offset at, Widget child) => Positioned(
        left: at.dx - 60,
        top: at.dy - 12,
        width: 120,
        height: 24,
        child: Center(child: child),
      );
}

class _FlyingChips extends StatelessWidget {
  final _Flight flight;
  final Duration duration;
  final double size;
  final VoidCallback onDone;
  const _FlyingChips(
      {super.key, required this.flight, required this.duration, required this.size, required this.onDone});

  @override
  Widget build(BuildContext context) {
    final total = flight.delay + duration;
    final wait = flight.delay.inMicroseconds / total.inMicroseconds;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: total,
      onEnd: onDone,
      builder: (context, t, child) {
        final k = Curves.easeInOutCubic.transform(((t - wait) / (1 - wait)).clamp(0.0, 1.0));
        final at = Offset.lerp(flight.from, flight.to, k)!;
        return Positioned(
          left: at.dx - size / 2,
          top: at.dy - size / 2,
          // Hidden while it waits its turn; fades as it lands.
          child: Opacity(opacity: t < wait ? 0 : (k > 0.85 ? (1 - k) / 0.15 : 1), child: child),
        );
      },
      child: ChipPile(amount: flight.amount, size: size),
    );
  }
}

/// Opens the reactions; dimmed while the last one rests.
class _EmoteButton extends StatelessWidget {
  final Future<void> Function()? onTap;
  const _EmoteButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final ready = onTap != null;
    return Semantics(
      button: true,
      label: 'Reagir',
      child: GestureDetector(
        key: const Key('emoteBtn'),
        onTap: onTap,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: ready ? 1 : 0.4,
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.black.withValues(alpha: 0.55),
              border: Border.all(color: Brand.gold.withValues(alpha: 0.7)),
              boxShadow: Brand.cardShadow,
            ),
            child: const Icon(Icons.emoji_emotions_outlined, color: Brand.gold, size: 24),
          ),
        ),
      ),
    );
  }
}

/// Reactions over the seats of whoever sent them, a couple of seconds each;
/// a new one from the same player replaces theirs.
class _EmoteLayer extends StatefulWidget {
  final GameSnapshot snapshot;
  const _EmoteLayer({required this.snapshot});

  @override
  State<_EmoteLayer> createState() => _EmoteLayerState();
}

class _EmoteLayerState extends State<_EmoteLayer> {
  final _shown = <String, ({int id, String emote})>{}; // by userId
  var _next = 0;

  @override
  void didUpdateWidget(_EmoteLayer old) {
    super.didUpdateWidget(old);
    final e = widget.snapshot.emote;
    if (e != null && !identical(e, old.snapshot.emote)) {
      setState(() => _shown[e.userId] = (id: _next++, emote: e.emote));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.snapshot;
    return LayoutBuilder(builder: (context, c) {
      final g = _SeatGeometry.of(s, c.biggest);
      final pos = <String, int>{
        for (final seat in s.seats.whereType<SeatInfo>()) seat.userId: seat.position,
      };
      final size = g.max > 8 ? 24.0 : 28.0;
      return Stack(clipBehavior: Clip.none, children: [
        for (final MapEntry(key: uid, value: b) in _shown.entries)
          if (pos[uid] != null)
            Positioned(
              // Centred on the avatar, a little above it.
              left: g.seat(pos[uid]!).dx - 40,
              top: g.seat(pos[uid]!).dy - g.seatSize * 0.5 - size - 4,
              width: 80,
              child: Center(
                child: EmoteBubble(
                  key: ValueKey('emote-${b.id}'),
                  id: b.emote,
                  size: size,
                  onDone: () {
                    if (mounted && _shown[uid]?.id == b.id) setState(() => _shown.remove(uid));
                  },
                ),
              ),
            ),
      ]);
    });
  }
}
