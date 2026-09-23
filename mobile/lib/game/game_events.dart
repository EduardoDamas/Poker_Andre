import 'game_snapshot.dart';

/// Turns server events into the next [GameSnapshot] for player [userId].
///
/// Pure functions, no socket: [SocketGameConnection] feeds them what arrives,
/// and tests feed them payloads directly.
class GameEvents {
  final String userId;
  final int defaultSeats;
  const GameEvents(this.userId, {this.defaultSeats = 8});

  /// A clean slate for a new hand (or a new table) that keeps the seats and
  /// everything the promotion bracket has told us so far.
  GameSnapshot _fresh(GameSnapshot s, {String street = 'preflop', List<String> holeCards = const []}) =>
      GameSnapshot(
        status: s.status,
        street: street,
        holeCards: holeCards,
        maxSeats: s.maxSeats,
        seats: s.seats,
        lobby: s.lobby,
        stage: s.stage,
        notice: s.notice,
        out: s.out,
        finished: s.finished,
      );

  /// The table went back to "waiting for players" (opponents withdrew — no
  /// walkover payout): clear any hand/result state, keep seats.
  GameSnapshot waiting(GameSnapshot s) => _fresh(s);

  /// New hole cards = a new hand: clear the previous hand's result/banner and
  /// board so the result text never overlaps live action buttons.
  GameSnapshot hole(GameSnapshot s, Map data) =>
      _fresh(s, holeCards: (data['cards'] as List).cast<String>());

  /// Seat occupancy for the round-table layout. `seats` is one entry per seat,
  /// null = empty. Absent players leave their seat empty; the rest are drawn.
  GameSnapshot tableState(GameSnapshot s, Map data) {
    final max = (data['maxSeats'] as num?)?.toInt() ?? defaultSeats;
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
    return s.copyWith(maxSeats: max, seats: seats);
  }

  /// Whose turn it is. On a promotion table the server acts for a player who
  /// runs out of time (`turnMs`), so the app can count it down.
  GameSnapshot gameState(GameSnapshot s, Map data, {DateTime? now}) {
    final acting = data['actingPlayerId'] as String?;
    final mine = acting == userId;
    final turnMs = (data['turnMs'] as num?)?.toInt();
    final deadline =
        mine && turnMs != null ? (now ?? DateTime.now()).add(Duration(milliseconds: turnMs)) : null;
    final next = s.copyWith(
      street: data['street'] as String? ?? s.street,
      board: (data['board'] as List? ?? const []).cast<String>(),
      actingPlayerId: acting,
      legalActions: (data['legalActions'] as List? ?? const []).cast<String>(),
      isMyTurn: mine,
    );
    return _withDeadline(next, deadline);
  }

  GameSnapshot handResult(GameSnapshot s, Map data) {
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
      } else if (tourn['tableWinnerId'] != null) {
        // A promotion table played down to one: its winner goes on.
        text = tourn['tableWinnerId'] == userId ? 'Você venceu sua mesa! 🎉' : 'Mesa encerrada.';
      } else {
        final remaining = (tourn['remaining'] as num?)?.toInt() ?? 0;
        text = mine > 0
            ? 'Você venceu a mão! ($remaining jogadores restantes)'
            : 'Mão encerrada. ($remaining jogadores restantes)';
      }
    } else {
      text = mine > 0 ? 'Você ganhou $mine fichas!' : 'Mão encerrada.';
    }

    return _withDeadline(
      s.copyWith(
        street: 'complete',
        board: (data['board'] as List? ?? const []).cast<String>(),
        handComplete: true,
        isMyTurn: false,
        legalActions: const [],
        resultText: text,
        prizeCents: prizeCents,
        finished: tourn?['over'] == true,
      ),
      null,
    );
  }

  // --- Promotion bracket ---

  /// `promo:lobby` — places held, the minimum, and when it may start.
  GameSnapshot lobby(GameSnapshot s, Map data) => s.copyWith(
        lobby: PromoLobby(
          registered: (data['registered'] as num?)?.toInt() ?? 0,
          minPlayers: (data['minPlayers'] as num?)?.toInt() ?? 2,
          maxPlayers: (data['maxPlayers'] as num?)?.toInt() ?? 100,
          startsAt: DateTime.parse('${data['startsAt']}').toLocal(),
          startAnywayAt: data['startAnywayAt'] == null
              ? null
              : DateTime.parse('${data['startAnywayAt']}').toLocal(),
        ),
      );

  /// `tournament:table` — seated at a (new) table of the bracket.
  GameSnapshot movedToTable(GameSnapshot s, Map data) {
    final round = (data['round'] as num?)?.toInt() ?? 1;
    return GameSnapshot(
      status: s.status,
      lobby: s.lobby,
      stage: data['final'] == true ? 'Mesa final' : 'Rodada $round',
    );
  }

  /// `tournament:advanced` — won their table; waiting for the others.
  GameSnapshot advanced(GameSnapshot s, Map data) {
    final left = (data['tablesLeft'] as num?)?.toInt() ?? 0;
    final wait = left <= 0
        ? 'Preparando a próxima mesa…'
        : left == 1
            ? 'Aguardando 1 mesa terminar…'
            : 'Aguardando $left mesas terminarem…';
    return s.copyWith(notice: 'Você venceu sua mesa! 🎉\n$wait');
  }

  /// `tournament:eliminated` — knocked out, with the place they finished in.
  GameSnapshot eliminated(GameSnapshot s, Map data) {
    final place = (data['place'] as num?)?.toInt();
    final players = (data['players'] as num?)?.toInt();
    final where = place == null
        ? ''
        : players == null
            ? '\nVocê ficou em $placeº lugar.'
            : '\nVocê ficou em $placeº lugar entre $players.';
    return _withDeadline(
      s.copyWith(out: true, notice: 'Você foi eliminado.$where\nObrigado por participar!', isMyTurn: false),
      null,
    );
  }

  /// `tournament:champion` — the whole tournament is over.
  GameSnapshot champion(GameSnapshot s, Map data) {
    if (data['winnerId'] == userId || s.out) return s.copyWith(finished: true); // the result says it
    return s.copyWith(finished: true, notice: 'O torneio terminou. Obrigado por participar!');
  }

  GameSnapshot _withDeadline(GameSnapshot s, DateTime? deadline) => GameSnapshot(
        status: s.status,
        error: s.error,
        street: s.street,
        board: s.board,
        holeCards: s.holeCards,
        actingPlayerId: s.actingPlayerId,
        legalActions: s.legalActions,
        isMyTurn: s.isMyTurn,
        handComplete: s.handComplete,
        resultText: s.resultText,
        prizeCents: s.prizeCents,
        maxSeats: s.maxSeats,
        seats: s.seats,
        lobby: s.lobby,
        stage: s.stage,
        notice: s.notice,
        out: s.out,
        finished: s.finished,
        turnDeadline: deadline,
      );
}
