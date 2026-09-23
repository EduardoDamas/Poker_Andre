import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'game_events.dart';
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
  final GameEvents _events;
  final _controller = StreamController<GameSnapshot>.broadcast();
  GameSnapshot _snapshot = const GameSnapshot();

  SocketGameConnection({
    required String baseUrl,
    required String token,
    required this.userId,
    required this.tableId,
    this.maxSeats = 8,
    this.level,
  })  : _events = GameEvents(userId, defaultSeats: maxSeats),
        _socket = io.io(
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
      // Surface a rejected join (insufficient balance, withdrew from a running
      // tournament, blocked account…) instead of freezing on "Aguardando".
      _socket.emitWithAck('table:join', join, ack: (resp) {
        if (resp is Map && resp['ok'] == false) {
          _emit(_snapshot.copyWith(
            status: ConnStatus.error,
            error: '${resp['error'] ?? 'Não foi possível entrar na mesa.'}',
          ));
        }
      });
    });
    _socket.on('table:waiting', (_) => _emit(_events.waiting(_snapshot)));
    _socket.on('hand:hole', (data) => _emit(_events.hole(_snapshot, data as Map)));
    _socket.on('table:state', (data) => _emit(_events.tableState(_snapshot, data as Map)));
    _socket.on('game:state', (data) => _emit(_events.gameState(_snapshot, data as Map)));
    _socket.on('hand:result', (data) => _emit(_events.handResult(_snapshot, data as Map)));
    // Promotion bracket: waiting room, table moves, knockouts, the champion.
    _socket.on('promo:lobby', (data) => _emit(_events.lobby(_snapshot, data as Map)));
    _socket.on('tournament:table', (data) => _emit(_events.movedToTable(_snapshot, data as Map)));
    _socket.on('tournament:advanced', (data) => _emit(_events.advanced(_snapshot, data as Map)));
    _socket.on('tournament:eliminated', (data) => _emit(_events.eliminated(_snapshot, data as Map)));
    _socket.on('tournament:champion', (data) => _emit(_events.champion(_snapshot, data as Map)));
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
