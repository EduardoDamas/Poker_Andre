import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import 'auth_api.dart' show AuthException;

class RankingEntry {
  final int position;
  final String name;
  final int prizeCents;
  final int wins;
  RankingEntry({required this.position, required this.name, required this.prizeCents, required this.wins});

  factory RankingEntry.fromJson(Map<String, dynamic> j) => RankingEntry(
        position: (j['position'] as num).toInt(),
        name: j['name'] as String,
        prizeCents: int.tryParse('${j['prizeCents']}') ?? 0,
        wins: (j['wins'] as num?)?.toInt() ?? 0,
      );
}

class WinnerEntry {
  final String name;
  final int level;
  final int prizeCents;
  final DateTime createdAt;
  WinnerEntry({required this.name, required this.level, required this.prizeCents, required this.createdAt});

  factory WinnerEntry.fromJson(Map<String, dynamic> j) => WinnerEntry(
        name: j['name'] as String,
        level: (j['level'] as num).toInt(),
        prizeCents: int.tryParse('${j['prizeCents']}') ?? 0,
        createdAt: DateTime.tryParse('${j['createdAt']}') ?? DateTime.now(),
      );
}

/// Client for the leaderboards + winners feed.
class RankingsApi {
  final String baseUrl;
  final http.Client _client;

  RankingsApi({String? baseUrl, http.Client? client})
      : baseUrl = baseUrl ?? AppConfig.apiBase,
        _client = client ?? http.Client();

  Map<String, String> _auth(String token) => {'Authorization': 'Bearer $token'};

  /// period: 'daily' | 'weekly' | 'monthly'.
  Future<List<RankingEntry>> fetchRankings(String token, String period) async {
    final res = await _client.get(
        Uri.parse('$baseUrl/rankings?period=$period'), headers: _auth(token));
    if (res.statusCode == 401) throw AuthException('Sessão expirada. Entre novamente.');
    if (res.statusCode != 200) throw AuthException('Não foi possível carregar o ranking.');
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return ((body['entries'] as List?) ?? const [])
        .map((e) => RankingEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<WinnerEntry>> fetchWinners(String token) async {
    final res =
        await _client.get(Uri.parse('$baseUrl/rankings/winners'), headers: _auth(token));
    if (res.statusCode == 401) throw AuthException('Sessão expirada. Entre novamente.');
    if (res.statusCode != 200) throw AuthException('Não foi possível carregar os vencedores.');
    return (jsonDecode(res.body) as List)
        .map((e) => WinnerEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
