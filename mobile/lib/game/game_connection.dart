import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'game_snapshot.dart';

/// Abstraction over the realtime table connection so the UI is testable
/// without a live socket. The UI listens to [stream] and calls [act].
abstract class GameConnection {
  Stream<GameSnapshot> get stream;
  GameSnapshot get current;
  void act(String type, {int? amount});
  void dispose();
}

/// Socket.IO-backed implementation. Connects, joins the table, and translates
/// server events into [GameSnapshot]s.
class SocketGameConnection implements GameConnection {
  final String tableId;
  final String userId;
  final int maxSeats;
  final io.Socket _socket;
  final _controller = StreamController<GameSnapshot>.broadcast();
  GameSnapshot _snapshot = const GameSnapshot();

  SocketGameConnection({
    required String baseUrl,
    required String token,
    required this.userId,
    required this.tableId,
    this.maxSeats = 8,
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
      _socket.emit('table:join', {'tableId': tableId, 'maxSeats': maxSeats});
    });
    _socket.on('hand:hole', (data) {
      final cards = (data['cards'] as List).cast<String>();
      _emit(_snapshot.copyWith(holeCards: cards));
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
      _emit(_snapshot.copyWith(
        street: 'complete',
        board: (data['board'] as List? ?? const []).cast<String>(),
        handComplete: true,
        isMyTurn: false,
        legalActions: const [],
        resultText: mine > 0 ? 'Você ganhou $mine fichas!' : 'Mão encerrada.',
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

  @override
  void dispose() {
    _socket.dispose();
    _controller.close();
  }
}
