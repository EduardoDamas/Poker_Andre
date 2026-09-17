import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import 'auth_api.dart' show AuthException;

/// The player's own responsible-gaming settings: deposit ceilings per rolling
/// window, a raise waiting out its cooling-off period, and self-exclusion.
class PlayerLimits {
  final int? dailyCents;
  final int? weeklyCents;
  final int? monthlyCents;
  final int? pendingDailyCents;
  final int? pendingWeeklyCents;
  final int? pendingMonthlyCents;
  final DateTime? pendingEffectiveAt;
  final DateTime? selfExcludedUntil;
  final bool selfExcluded;
  final int usedDailyCents;
  final int usedWeeklyCents;
  final int usedMonthlyCents;

  PlayerLimits({
    this.dailyCents,
    this.weeklyCents,
    this.monthlyCents,
    this.pendingDailyCents,
    this.pendingWeeklyCents,
    this.pendingMonthlyCents,
    this.pendingEffectiveAt,
    this.selfExcludedUntil,
    required this.selfExcluded,
    required this.usedDailyCents,
    required this.usedWeeklyCents,
    required this.usedMonthlyCents,
  });

  bool get hasPending => pendingEffectiveAt != null;

  static int? _cents(dynamic v) => v == null ? null : int.tryParse('$v');
  static DateTime? _date(dynamic v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();

  factory PlayerLimits.fromJson(Map<String, dynamic> j) {
    final pending = j['pending'] as Map<String, dynamic>?;
    final used = (j['used'] as Map<String, dynamic>?) ?? const {};
    return PlayerLimits(
      dailyCents: _cents(j['dailyCents']),
      weeklyCents: _cents(j['weeklyCents']),
      monthlyCents: _cents(j['monthlyCents']),
      pendingDailyCents: _cents(pending?['dailyCents']),
      pendingWeeklyCents: _cents(pending?['weeklyCents']),
      pendingMonthlyCents: _cents(pending?['monthlyCents']),
      pendingEffectiveAt: _date(pending?['effectiveAt']),
      selfExcludedUntil: _date(j['selfExcludedUntil']),
      selfExcluded: j['selfExcluded'] == true,
      usedDailyCents: _cents(used['daily']) ?? 0,
      usedWeeklyCents: _cents(used['weekly']) ?? 0,
      usedMonthlyCents: _cents(used['monthly']) ?? 0,
    );
  }
}

/// Client for /limits — the player's own deposit ceilings and self-exclusion.
class LimitsApi {
  final String baseUrl;
  final http.Client _client;

  LimitsApi({String? baseUrl, http.Client? client})
      : baseUrl = baseUrl ?? AppConfig.apiBase,
        _client = client ?? http.Client();

  Map<String, String> _headers(String token) => {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      };

  PlayerLimits _parse(http.Response res, String whenFailing) {
    if (res.statusCode == 401) throw AuthException('Sessão expirada. Entre novamente.');
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw AuthException(_message(res) ?? whenFailing);
    }
    return PlayerLimits.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// The backend's own message (e.g. "Limite diário de R$500,00 atingido").
  String? _message(http.Response res) {
    try {
      final body = jsonDecode(res.body);
      if (body is Map && body['message'] != null) {
        final m = body['message'];
        return m is List ? m.join('\n') : '$m';
      }
    } catch (_) {}
    return null;
  }

  Future<PlayerLimits> fetch(String token) async {
    final res = await _client.get(Uri.parse('$baseUrl/limits'), headers: _headers(token));
    return _parse(res, 'Não foi possível carregar seus limites.');
  }

  /// Set ceilings in cents. Pass null for a window to remove its limit; omit a
  /// window to leave it untouched.
  Future<PlayerLimits> save(
    String token, {
    Object? dailyCents = keepLimit,
    Object? weeklyCents = keepLimit,
    Object? monthlyCents = keepLimit,
  }) async {
    final body = <String, dynamic>{
      if (!identical(dailyCents, keepLimit)) 'dailyCents': dailyCents,
      if (!identical(weeklyCents, keepLimit)) 'weeklyCents': weeklyCents,
      if (!identical(monthlyCents, keepLimit)) 'monthlyCents': monthlyCents,
    };
    final res = await _client.put(Uri.parse('$baseUrl/limits'),
        headers: _headers(token), body: jsonEncode(body));
    return _parse(res, 'Não foi possível salvar o limite.');
  }

  /// Take a break for [days], or indefinitely when [days] is null.
  Future<PlayerLimits> selfExclude(String token, int? days) async {
    final res = await _client.post(
      Uri.parse('$baseUrl/limits/self-exclusion'),
      headers: _headers(token),
      body: jsonEncode(days == null ? <String, dynamic>{} : {'days': days}),
    );
    return _parse(res, 'Não foi possível ativar a autoexclusão.');
  }
}

/// Sentinel so `null` can mean "remove the limit" and this one "leave as is".
/// Callers pass it explicitly for the windows they are not changing.
const Object keepLimit = Object();
