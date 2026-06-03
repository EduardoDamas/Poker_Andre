enum ConnStatus { connecting, connected, error }

/// Immutable view of the table as the player sees it. Built from socket events
/// (game:state / hand:hole / hand:result) by the GameConnection.
class GameSnapshot {
  final ConnStatus status;
  final String? error;
  final String street; // preflop/flop/turn/river/complete
  final List<String> board; // community cards
  final List<String> holeCards; // this player's two cards
  final String? actingPlayerId;
  final List<String> legalActions;
  final bool isMyTurn;
  final bool handComplete;
  final String? resultText; // human-readable outcome

  const GameSnapshot({
    this.status = ConnStatus.connecting,
    this.error,
    this.street = 'preflop',
    this.board = const [],
    this.holeCards = const [],
    this.actingPlayerId,
    this.legalActions = const [],
    this.isMyTurn = false,
    this.handComplete = false,
    this.resultText,
  });

  GameSnapshot copyWith({
    ConnStatus? status,
    String? error,
    String? street,
    List<String>? board,
    List<String>? holeCards,
    String? actingPlayerId,
    List<String>? legalActions,
    bool? isMyTurn,
    bool? handComplete,
    String? resultText,
  }) {
    return GameSnapshot(
      status: status ?? this.status,
      error: error ?? this.error,
      street: street ?? this.street,
      board: board ?? this.board,
      holeCards: holeCards ?? this.holeCards,
      actingPlayerId: actingPlayerId ?? this.actingPlayerId,
      legalActions: legalActions ?? this.legalActions,
      isMyTurn: isMyTurn ?? this.isMyTurn,
      handComplete: handComplete ?? this.handComplete,
      resultText: resultText ?? this.resultText,
    );
  }
}
