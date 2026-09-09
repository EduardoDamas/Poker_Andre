import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'game_snapshot.dart';

/// Abstraction over the realtime table connection so the UI is testable
/// without a live socket. The UI listens to [stream] and calls [act].
abstract class GameConnection {
  Stream<GameSnapshot> get stream;
  GameSnapshot get current;
  void act(String type, {int? amount});

  /// Leave the table so the seat is freed on the server (updates room occupancy).
  /// Safe to call after a hand ends; a no-op for the offline solo game.
  Future<void> leaveTable();
  void dispose();
}

/// Socket.IO-backed implementation. Connects, joins the table, and translates
/// server events into [GameSnapshot]s.
class SocketGameConnection implements GameConnection {
  final String tableId;
  final String userId;
  final int maxSeats;
  // When set, joins as a MONEY tournament room of this level (entry fee charged).
  final int? level;
  final io.Socket _socket;
  final _controller = StreamController<GameSnapshot>.broadcast();
  GameSnapshot _snapshot = const GameSnapshot();

  SocketGameConnection({
    required String baseUrl,
    required String token,
    required this.userId,
    required this.tableId,
    this.maxSeats = 8,
    this.level,
  }) : _socket = io.io(
          baseUrl,
          io.OptionBuilder()
              .setTransports(['websocket'])
              .disableAutoConnect()
              .setAuth({'token': token})
              .build(),
        ) {
    _wire();
    _socket.connect();
  }

  void _emit(GameSnapshot s) {
    _snapshot = s;
    if (!_controller.isClosed) _controller.add(s);
  }

  void _wire() {
    _socket.on('connected', (_) {
      _emit(_snapshot.copyWith(status: ConnStatus.connected));
      final join = <String, dynamic>{'tableId': tableId, 'maxSeats': maxSeats};
      if (level != null) join['level'] = level; // money tournament room
      _socket.emit('table:join', join);
    });
    _socket.on('hand:hole', (data) {
      final cards = (data['cards'] as List).cast<String>();
      _emit(_snapshot.copyWith(holeCards: cards));
    });
    // Seat occupancy for the round-table layout. `seats` is one entry per seat,
    // null = empty. Absent players leave their seat empty; the rest are drawn.
    _socket.on('table:state', (data) {
      final max = (data['maxSeats'] as num?)?.toInt() ?? maxSeats;
      final raw = (data['seats'] as List?) ?? const [];
      final seats = raw.map<SeatInfo?>((e) {
        if (e == null) return null;
        final m = e as Map;
        final uid = '${m['userId']}';
        return SeatInfo(
          position: (m['position'] as num?)?.toInt() ?? 0,
          userId: uid,
          hasCards: m['hasCards'] == true,
          isMe: uid == userId,
        );
      }).toList();
      _emit(_snapshot.copyWith(maxSeats: max, seats: seats));
    });
    _socket.on('game:state', (data) {
      final acting = data['actingPlayerId'] as String?;
      _emit(_snapshot.copyWith(
        street: data['street'] as String? ?? _snapshot.street,
        board: (data['board'] as List? ?? const []).cast<String>(),
        actingPlayerId: acting,
        legalActions: (data['legalActions'] as List? ?? const []).cast<String>(),
        isMyTurn: acting == userId,
      ));
    });
    _socket.on('hand:result', (data) {
      final payouts = (data['payouts'] as Map?) ?? const {};
      final mine = (payouts[userId] as num?)?.toInt() ?? 0;
      final tourn = data['tournament'] as Map?;

      String text;
      int? prizeCents;
      if (tourn != null) {
        // Money tournament hand.
        if (tourn['over'] == true) {
          final won = tourn['winnerId'] == userId;
          if (won) {
            prizeCents = (tourn['prizeCents'] as num?)?.toInt();
            text = 'Você venceu o torneio! 🏆\n'
                'Você receberá o prêmio via Pix em até 24h.';
          } else {
            text = 'Torneio encerrado. Mais sorte na próxima!';
          }
        } else {
          final remaining = (tourn['remaining'] as num?)?.toInt() ?? 0;
          text = mine > 0
              ? 'Você venceu a mão! ($remaining jogadores restantes)'
              : 'Mão encerrada. ($remaining jogadores restantes)';
        }
      } else {
        text = mine > 0 ? 'Você ganhou $mine fichas!' : 'Mão encerrada.';
      }

      _emit(_snapshot.copyWith(
        street: 'complete',
        board: (data['board'] as List? ?? const []).cast<String>(),
        handComplete: true,
        isMyTurn: false,
        legalActions: const [],
        resultText: text,
        prizeCents: prizeCents,
      ));
    });
    _socket.on('unauthorized', (_) {
      _emit(_snapshot.copyWith(status: ConnStatus.error, error: 'Não autorizado.'));
    });
    _socket.onConnectError((_) {
      _emit(_snapshot.copyWith(status: ConnStatus.error, error: 'Falha de conexão.'));
    });
  }

  @override
  Stream<GameSnapshot> get stream => _controller.stream;

  @override
  GameSnapshot get current => _snapshot;

  @override
  void act(String type, {int? amount}) {
    final action = <String, dynamic>{'type': type};
    if (amount != null) action['amount'] = amount;
    _socket.emit('hand:action', {'tableId': tableId, 'action': action});
  }

  bool _left = false;

  @override
  Future<void> leaveTable() async {
    if (_left || _socket.disconnected) return;
    _left = true;
    // Ask the server to free the seat and wait for its ack, so the seat is
    // released before we tear the socket down (otherwise the packet is dropped).
    final done = Completer<void>();
    try {
      _socket.emitWithAck('table:leave', {'tableId': tableId}, ack: (_) {
        if (!done.isCompleted) done.complete();
      });
    } catch (_) {
      if (!done.isCompleted) done.complete();
    }
    await done.future.timeout(const Duration(seconds: 2), onTimeout: () {});
  }

  @override
  void dispose() {
    // Best-effort leave in case the caller didn't await leaveTable().
    if (!_left && !_socket.disconnected) {
      try {
        _socket.emit('table:leave', {'tableId': tableId});
      } catch (_) {}
    }
    _socket.dispose();
    _controller.close();
  }
}
