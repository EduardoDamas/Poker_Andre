import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import 'auth_api.dart' show AuthException;

/// A tournament entry checkout option (InfinitePay link + amount).
class EntryLink {
  final int level;
  final bool subscriber;
  final String method; // 'pix' | 'card'
  final int amountCents;
  final String url;

  EntryLink({
    required this.level,
    required this.subscriber,
    required this.method,
    required this.amountCents,
    required this.url,
  });

  factory EntryLink.fromJson(Map<String, dynamic> j) => EntryLink(
        level: j['level'] as int,
        subscriber: j['subscriber'] as bool,
        method: j['method'] as String,
        amountCents: j['amountCents'] as int,
        url: j['url'] as String,
      );
}

/// A purchasable subscription plan and its price.
class SubscriptionPlan {
  final String plan; // MONTHLY | QUARTERLY | SEMIANNUAL | ANNUAL
  final int priceCents;

  SubscriptionPlan({required this.plan, required this.priceCents});

  factory SubscriptionPlan.fromJson(Map<String, dynamic> j) => SubscriptionPlan(
        plan: j['plan'] as String,
        priceCents: int.tryParse('${j['priceCents']}') ?? 0,
      );
}

/// Client for the /payments endpoints (InfinitePay checkout data). Needs the JWT.
class PaymentsApi {
  final String baseUrl;
  final http.Client _client;

  PaymentsApi({String? baseUrl, http.Client? client})
      : baseUrl = baseUrl ?? AppConfig.apiBase,
        _client = client ?? http.Client();

  Map<String, String> _auth(String token) => {'Authorization': 'Bearer $token'};

  /// All tournament entry options (every level × subscriber × method).
  Future<List<EntryLink>> fetchEntries(String token) async {
    final res = await _client.get(Uri.parse('$baseUrl/payments/tournament-entries'), headers: _auth(token));
    if (res.statusCode == 401) throw AuthException('Sessão expirada. Entre novamente.');
    if (res.statusCode != 200) throw AuthException('Não foi possível carregar os torneios.');
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => EntryLink.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// The purchasable subscription plans and their prices.
  Future<List<SubscriptionPlan>> fetchSubscriptions(String token) async {
    final res = await _client.get(Uri.parse('$baseUrl/payments/subscriptions'), headers: _auth(token));
    if (res.statusCode == 401) throw AuthException('Sessão expirada. Entre novamente.');
    if (res.statusCode != 200) throw AuthException('Não foi possível carregar as assinaturas.');
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => SubscriptionPlan.fromJson(e as Map<String, dynamic>)).toList();
  }
}
