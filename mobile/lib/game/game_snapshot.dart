enum ConnStatus { connecting, connected, error }

/// One occupied seat as broadcast in `table:state`. Absent players are
/// represented by a `null` entry in [GameSnapshot.seats] (the seat stays empty).
class SeatInfo {
  final int position;
  final String userId;
  final bool hasCards;
  final bool isMe;
  const SeatInfo({
    required this.position,
    required this.userId,
    this.hasCards = false,
    this.isMe = false,
  });
}

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
  final int? prizeCents; // winner's prize (R$) when you win, per the prize table
  final int maxSeats; // total seats at the table (round-table layout)
  final List<SeatInfo?> seats; // one entry per seat; null = empty seat

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
    this.prizeCents,
    this.maxSeats = 0,
    this.seats = const [],
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
    int? prizeCents,
    int? maxSeats,
    List<SeatInfo?>? seats,
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
      prizeCents: prizeCents ?? this.prizeCents,
      maxSeats: maxSeats ?? this.maxSeats,
      seats: seats ?? this.seats,
    );
  }
}
