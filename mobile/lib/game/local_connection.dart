import 'dart:async';
import 'game_connection.dart';
import 'game_snapshot.dart';
import '../engine/poker_hand.dart';
import '../engine/bot.dart';
import '../engine/prize_table.dart';

/// Offline solo game vs AI bots — implements the same GameConnection the
/// online table uses, so the premium TableScreen works unchanged.
///
/// No backend, no socket, no network: the poker engine + bots run on-device.
class LocalGameConnection implements GameConnection {
  final String userId;
  final int botCount;
  final int buyIn;
  final int smallBlind;
  final int bigBlind;
  final int entryCents; // V.I. (valor da inscrição) of the room
  final int roomCapacity; // seats in a full room (for occupancy → prize)
  final Bot _bot;

  final _ctrl = StreamController<GameSnapshot>.broadcast();
  GameSnapshot _snap = const GameSnapshot(status: ConnStatus.connected);
  late PokerHand _hand;
  bool _disposed = false;

  LocalGameConnection({
    this.userId = 'voce',
    this.botCount = 1,
    BotDifficulty difficulty = BotDifficulty.medium,
    this.buyIn = 100,
    this.smallBlind = 1,
    this.bigBlind = 2,
    this.entryCents = 2000, // R$ 20,00 (Nível 1) by default
    this.roomCapacity = 8,
  }) : _bot = Bot(difficulty) {
    _startHand();
  }

  void _startHand() {
    final seats = <({String id, int stack})>[
      (id: userId, stack: buyIn),
      for (var i = 1; i <= botCount; i++) (id: 'bot$i', stack: buyIn),
    ];
    _hand = PokerHand(seats, smallBlind: smallBlind, bigBlind: bigBlind);
    _advance();
  }

  void _advance() {
    if (_disposed) return;
    if (_hand.isComplete) {
      _emitComplete();
      return;
    }
    final acting = _hand.actingPlayerId;
    _emitState();
    if (acting != null && acting != userId) {
      // Bot's turn — act after a short, natural delay.
      Future.delayed(const Duration(milliseconds: 650), () {
        if (_disposed) return;
        if (_hand.isComplete) {
          _emitComplete();
          return;
        }
        if (_hand.actingPlayerId == acting) {
          _applyBot(acting);
          _advance();
        }
      });
    }
  }

  void _applyBot(String botId) {
    final legal = _hand.legalActions();
    try {
      final d = _bot.decide(
        hole: _hand.holeCardsOf(botId),
        board: _hand.visibleBoard,
        legal: legal,
        currentBet: _hand.currentBet,
        committed: _hand.actingCommitted,
        stack: _hand.actingStack,
        bigBlind: _hand.bigBlind,
        pot: _hand.pot,
      );
      _hand.act(botId, d.type, d.amount);
    } catch (_) {
      // Safest legal fallback so the hand always progresses.
      final fb = legal.contains('check')
          ? 'check'
          : legal.contains('call')
              ? 'call'
              : 'fold';
      _hand.act(botId, fb);
    }
  }

  void _emitState() {
    final acting = _hand.actingPlayerId;
    _emit(_snap.copyWith(
      status: ConnStatus.connected,
      street: _hand.currentStreet.name,
      board: _hand.visibleBoard,
      holeCards: _hand.holeCardsOf(userId),
      actingPlayerId: acting,
      legalActions: acting == userId ? _hand.legalActions() : const [],
      isMyTurn: acting == userId,
      handComplete: false,
    ));
  }

  void _emitComplete() {
    final out = _hand.result();
    final won = out.pots.any((p) => p.winnerIds.contains(userId));
    // Prize per the CAPACONTEST table: multiplier(occupancy) × entry (V.I.).
    final occupancy = (botCount + 1) / roomCapacity;
    final prize = won ? prizeCentsFor(entryCents, occupancy) : null;
    final text = won
        ? 'Você venceu a mão!'
        : (out.finalStacks[userId] ?? 0) == buyIn
            ? 'Empate.'
            : 'Você perdeu a mão.';
    _emit(_snap.copyWith(
      status: ConnStatus.connected,
      street: 'complete',
      board: out.board,
      holeCards: _hand.holeCardsOf(userId),
      actingPlayerId: null,
      legalActions: const [],
      isMyTurn: false,
      handComplete: true,
      resultText: text,
      prizeCents: prize,
    ));
  }

  void _emit(GameSnapshot s) {
    _snap = s;
    if (!_ctrl.isClosed) _ctrl.add(s);
  }

  @override
  Stream<GameSnapshot> get stream => _ctrl.stream;
  @override
  GameSnapshot get current => _snap;

  @override
  void act(String type, {int? amount}) {
    if (_disposed || _hand.isComplete) return;
    if (_hand.actingPlayerId != userId) return;
    try {
      _hand.act(userId, type, amount);
    } catch (_) {
      return; // ignore illegal taps
    }
    _advance();
  }

  @override
  void dispose() {
    _disposed = true;
    _ctrl.close();
  }
}
