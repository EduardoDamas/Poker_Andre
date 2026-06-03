/// A joinable Poker room shown in the lobby.
class TableInfo {
  final String id;
  final String name;
  final int level;
  final int entryCents;
  final int maxSeats;
  final int players;

  TableInfo({
    required this.id,
    required this.name,
    required this.level,
    required this.entryCents,
    required this.maxSeats,
    required this.players,
  });

  factory TableInfo.fromJson(Map<String, dynamic> j) => TableInfo(
        id: j['id'] as String,
        name: j['name'] as String,
        level: j['level'] as int,
        entryCents: j['entryCents'] as int,
        maxSeats: j['maxSeats'] as int,
        players: j['players'] as int,
      );

  /// Entry fee formatted as Brazilian currency, e.g. "R$ 20,00".
  String get entryLabel {
    final reais = (entryCents / 100).toStringAsFixed(2).replaceAll('.', ',');
    return 'R\$ $reais';
  }
}
