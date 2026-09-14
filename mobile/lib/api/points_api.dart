import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import 'auth_api.dart' show AuthException;

/// One slice of the daily wheel, in the exact order the server draws from.
class WheelSegmentInfo {
  final String label;
  final int freePoints;
  final int paidPoints;
  WheelSegmentInfo({required this.label, required this.freePoints, required this.paidPoints});

  factory WheelSegmentInfo.fromJson(Map<String, dynamic> j) => WheelSegmentInfo(
        label: j['label'] as String,
        freePoints: (j['freePoints'] as num?)?.toInt() ?? 0,
        paidPoints: (j['paidPoints'] as num?)?.toInt() ?? 0,
      );
}

class PointsMilestone {
  final int days;
  final int freePoints;
  final int paidPoints;
  PointsMilestone({required this.days, required this.freePoints, required this.paidPoints});

  factory PointsMilestone.fromJson(Map<String, dynamic> j) => PointsMilestone(
        days: (j['days'] as num).toInt(),
        freePoints: (j['freePoints'] as num?)?.toInt() ?? 0,
        paidPoints: (j['paidPoints'] as num?)?.toInt() ?? 0,
      );
}

class PointsTxn {
  final String kind; // WHEEL | CONVERSION | MILESTONE | GAME_REWARD | ADJUST
  final int freeDelta;
  final int paidDelta;
  final String? memo;
  final DateTime createdAt;
  PointsTxn({
    required this.kind,
    required this.freeDelta,
    required this.paidDelta,
    this.memo,
    required this.createdAt,
  });

  factory PointsTxn.fromJson(Map<String, dynamic> j) => PointsTxn(
        kind: j['kind'] as String,
        freeDelta: int.tryParse('${j['freeDelta']}') ?? 0,
        paidDelta: int.tryParse('${j['paidDelta']}') ?? 0,
        memo: j['memo'] as String?,
        createdAt: DateTime.tryParse('${j['createdAt']}') ?? DateTime.now(),
      );
}

class PointsStatus {
  final int freePoints;
  final int paidPoints;
  final int conversionRate; // 1 paid = N free
  final int streakDays;
  final bool canSpinToday;
  final ({int freePoints, int paidPoints})? todaySpin;
  final int totalFreeEarned;
  final PointsMilestone? nextMilestone;
  final List<PointsMilestone> milestones;
  final List<WheelSegmentInfo> wheel;
  final List<PointsTxn> history;

  PointsStatus({
    required this.freePoints,
    required this.paidPoints,
    required this.conversionRate,
    required this.streakDays,
    required this.canSpinToday,
    required this.todaySpin,
    required this.totalFreeEarned,
    required this.nextMilestone,
    required this.milestones,
    required this.wheel,
    required this.history,
  });

  factory PointsStatus.fromJson(Map<String, dynamic> j) => PointsStatus(
        freePoints: int.tryParse('${j['freePoints']}') ?? 0,
        paidPoints: int.tryParse('${j['paidPoints']}') ?? 0,
        conversionRate: (j['conversionRate'] as num?)?.toInt() ?? 1000,
        streakDays: (j['streakDays'] as num?)?.toInt() ?? 0,
        canSpinToday: j['canSpinToday'] == true,
        todaySpin: j['todaySpin'] == null
            ? null
            : (
                freePoints: ((j['todaySpin'] as Map)['freePoints'] as num?)?.toInt() ?? 0,
                paidPoints: ((j['todaySpin'] as Map)['paidPoints'] as num?)?.toInt() ?? 0,
              ),
        totalFreeEarned: int.tryParse('${j['totalFreeEarned']}') ?? 0,
        nextMilestone: j['nextMilestone'] == null
            ? null
            : PointsMilestone.fromJson(j['nextMilestone'] as Map<String, dynamic>),
        milestones: ((j['milestones'] as List?) ?? const [])
            .map((e) => PointsMilestone.fromJson(e as Map<String, dynamic>))
            .toList(),
        wheel: ((j['wheel'] as List?) ?? const [])
            .map((e) => WheelSegmentInfo.fromJson(e as Map<String, dynamic>))
            .toList(),
        history: ((j['history'] as List?) ?? const [])
            .map((e) => PointsTxn.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class SpinOutcome {
  final int segmentIndex;
  final int freePoints;
  final int paidPoints;
  final int streakDays;
  final PointsMilestone? milestone;
  SpinOutcome({
    required this.segmentIndex,
    required this.freePoints,
    required this.paidPoints,
    required this.streakDays,
    this.milestone,
  });

  factory SpinOutcome.fromJson(Map<String, dynamic> j) => SpinOutcome(
        segmentIndex: (j['segmentIndex'] as num).toInt(),
        freePoints: (j['freePoints'] as num?)?.toInt() ?? 0,
        paidPoints: (j['paidPoints'] as num?)?.toInt() ?? 0,
        streakDays: (j['streakDays'] as num?)?.toInt() ?? 0,
        milestone: j['milestone'] == null
            ? null
            : PointsMilestone.fromJson(j['milestone'] as Map<String, dynamic>),
      );
}

/// Client for the /points endpoints (balances, conversion, daily wheel).
class PointsApi {
  final String baseUrl;
  final http.Client _client;

  PointsApi({String? baseUrl, http.Client? client})
      : baseUrl = baseUrl ?? AppConfig.apiBase,
        _client = client ?? http.Client();

  Map<String, String> _headers(String token) => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

  Future<PointsStatus> fetchStatus(String token) async {
    final res = await _client.get(Uri.parse('$baseUrl/points/me'), headers: _headers(token));
    if (res.statusCode == 401) throw AuthException('Sessão expirada. Entre novamente.');
    if (res.statusCode != 200) throw AuthException('Não foi possível carregar os pontos.');
    return PointsStatus.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// Server-side daily spin; throws with the server message when already spun.
  Future<SpinOutcome> spin(String token) async {
    final res = await _client.post(Uri.parse('$baseUrl/points/wheel/spin'),
        headers: _headers(token));
    if (res.statusCode == 201 || res.statusCode == 200) {
      return SpinOutcome.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    }
    final msg = _message(res.body) ?? 'Não foi possível girar a roleta.';
    throw AuthException(msg);
  }

  /// direction: 'PAID_TO_FREE' | 'FREE_TO_PAID'.
  Future<({int freePoints, int paidPoints})> convert(
      String token, String direction, int amount) async {
    final res = await _client.post(
      Uri.parse('$baseUrl/points/convert'),
      headers: _headers(token),
      body: jsonEncode({'direction': direction, 'amount': amount}),
    );
    if (res.statusCode == 201 || res.statusCode == 200) {
      final j = jsonDecode(res.body) as Map<String, dynamic>;
      return (
        freePoints: int.tryParse('${j['freePoints']}') ?? 0,
        paidPoints: int.tryParse('${j['paidPoints']}') ?? 0,
      );
    }
    throw AuthException(_message(res.body) ?? 'Não foi possível converter.');
  }

  /// Claim the share-your-win reward (server grants once per settled win).
  /// Returns the free points awarded; throws with the server's message.
  Future<int> claimShareWin(String token) async {
    final res = await _client.post(Uri.parse('$baseUrl/points/share-win'),
        headers: _headers(token));
    if (res.statusCode == 201 || res.statusCode == 200) {
      return ((jsonDecode(res.body) as Map<String, dynamic>)['awarded'] as num?)
              ?.toInt() ??
          0;
    }
    throw AuthException(_message(res.body) ?? 'Não foi possível registrar a divulgação.');
  }

  /// Best-effort solo-win report (server enforces the daily cap).
  Future<void> reportSoloWin(String token) async {
    try {
      await _client.post(Uri.parse('$baseUrl/points/game-reward'), headers: _headers(token));
    } catch (_) {
      // Offline solo play — the reward just isn't credited this time.
    }
  }

  String? _message(String body) {
    try {
      final m = (jsonDecode(body) as Map<String, dynamic>)['message'];
      return m is List ? m.join(' ') : m?.toString();
    } catch (_) {
      return null;
    }
  }
}
