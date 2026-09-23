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

/// A promotion's waiting room, from `promo:lobby`: how many hold a place, how
/// many it needs, and when it may start.
class PromoLobby {
  final int registered;
  final int minPlayers;
  final int maxPlayers;
  final DateTime startsAt;

  /// After this, it starts with whoever is present even below [minPlayers].
  final DateTime? startAnywayAt;

  const PromoLobby({
    required this.registered,
    required this.minPlayers,
    required this.maxPlayers,
    required this.startsAt,
    this.startAnywayAt,
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

  // --- Promotion bracket (kept across hands and tables) ---
  final PromoLobby? lobby; // waiting room, until the tournament starts
  final String? stage; // "Rodada 1" / "Mesa final" once seated in the bracket
  final String? notice; // won your table and waiting / knocked out / finished
  final bool out; // knocked out of the tournament
  final bool finished; // the whole tournament has its champion
  final DateTime? turnDeadline; // when the table acts for you if you don't

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
    this.lobby,
    this.stage,
    this.notice,
    this.out = false,
    this.finished = false,
    this.turnDeadline,
  });

  /// Still in a running promotion bracket: leaving now would forfeit the place.
  bool get inBracket => stage != null && !out && !finished;

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
    PromoLobby? lobby,
    String? stage,
    String? notice,
    bool? out,
    bool? finished,
    DateTime? turnDeadline,
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
      lobby: lobby ?? this.lobby,
      stage: stage ?? this.stage,
      notice: notice ?? this.notice,
      out: out ?? this.out,
      finished: finished ?? this.finished,
      turnDeadline: turnDeadline ?? this.turnDeadline,
    );
  }
}
