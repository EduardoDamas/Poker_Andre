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
  final int priceCents; // base price
  final int cardPriceCents; // card price (base × 1.25) — what's charged now

  SubscriptionPlan(
      {required this.plan, required this.priceCents, required this.cardPriceCents});

  factory SubscriptionPlan.fromJson(Map<String, dynamic> j) => SubscriptionPlan(
        plan: j['plan'] as String,
        priceCents: int.tryParse('${j['priceCents']}') ?? 0,
        cardPriceCents: int.tryParse('${j['cardPriceCents'] ?? j['priceCents']}') ?? 0,
      );
}

/// A subscription purchase request: the checkout link to open plus its status.
/// The merchant's links are the same for everyone, so the payment cannot be
/// matched automatically — an admin confirms it and the plan is released then.
class SubscriptionRequestResult {
  final String id;
  final String plan;
  final int amountCents;
  final String status; // REQUESTED | CONFIRMED | REJECTED
  final String url;

  SubscriptionRequestResult({
    required this.id,
    required this.plan,
    required this.amountCents,
    required this.status,
    required this.url,
  });

  factory SubscriptionRequestResult.fromJson(Map<String, dynamic> j) => SubscriptionRequestResult(
        id: '${j['id']}',
        plan: '${j['plan']}',
        amountCents: int.tryParse('${j['amountCents']}') ?? 0,
        status: '${j['status']}',
        url: '${j['url'] ?? ''}',
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

  /// Register the intent to buy [plan] and get the checkout link to open.
  Future<SubscriptionRequestResult> requestSubscription(String token, String plan) async {
    final res = await _client.post(
      Uri.parse('$baseUrl/payments/subscription-request'),
      headers: {..._auth(token), 'Content-Type': 'application/json'},
      body: jsonEncode({'plan': plan}),
    );
    if (res.statusCode == 401) throw AuthException('Sessão expirada. Entre novamente.');
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw AuthException('Não foi possível iniciar a assinatura.');
    }
    return SubscriptionRequestResult.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// This player's subscription requests (newest first).
  Future<List<SubscriptionRequestResult>> fetchSubscriptionRequests(String token) async {
    final res = await _client.get(
      Uri.parse('$baseUrl/payments/subscription-requests'),
      headers: _auth(token),
    );
    if (res.statusCode == 401) throw AuthException('Sessão expirada. Entre novamente.');
    if (res.statusCode != 200) throw AuthException('Não foi possível carregar suas assinaturas.');
    final list = jsonDecode(res.body) as List<dynamic>;
    return list
        .map((e) => SubscriptionRequestResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
