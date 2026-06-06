import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../config.dart';

/// Result of a successful OTP verification.
class AuthSession {
  final String accessToken;
  final String userId;
  final String displayName;
  AuthSession({required this.accessToken, required this.userId, required this.displayName});
}

class AuthException implements Exception {
  final String message;
  AuthException(this.message);
  @override
  String toString() => message;
}

/// Thin client for the CAPA CONTEST auth endpoints.
///
/// baseUrl note: the Android emulator reaches the host machine at 10.0.2.2;
/// a physical device needs the host's LAN IP (e.g. http://192.168.x.x:3000).
class AuthApi {
  final String baseUrl;
  final http.Client _client;

  AuthApi({String? baseUrl, http.Client? client})
      : baseUrl = baseUrl ?? AppConfig.apiBase,
        _client = client ?? http.Client();

  Uri _u(String path) => Uri.parse('$baseUrl$path');

  /// Network timeout — fail fast with a clear message instead of spinning
  /// forever if the server is unreachable (e.g. wrong API_BASE).
  static const _timeout = Duration(seconds: 20);

  /// Wrap a request so a dead host / no internet surfaces as a clean
  /// AuthException rather than an endless loading spinner.
  Future<http.Response> _send(Future<http.Response> Function() req) async {
    try {
      return await req().timeout(_timeout);
    } on TimeoutException {
      throw AuthException('Servidor não respondeu. Verifique sua conexão.');
    } on SocketException {
      throw AuthException('Sem conexão com o servidor.');
    } on http.ClientException {
      throw AuthException('Sem conexão com o servidor.');
    }
  }

  /// Request a one-time login code for [phone] (E.164, e.g. +5511999998888).
  Future<void> requestOtp(String phone) async {
    final res = await _send(() => _client.post(
          _u('/auth/otp/request'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'phone': phone}),
        ));
    if (res.statusCode == 429) {
      throw AuthException('Too many requests. Please wait a minute.');
    }
    if (res.statusCode != 200) {
      throw AuthException('Could not send the code. Check the number.');
    }
  }

  /// Verify [code] for [phone]; returns the session (JWT + user) on success.
  Future<AuthSession> verifyOtp(String phone, String code) async {
    final res = await _send(() => _client.post(
          _u('/auth/otp/verify'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'phone': phone, 'code': code}),
        ));
    if (res.statusCode != 200) {
      throw AuthException('Invalid or expired code.');
    }
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final user = body['user'] as Map<String, dynamic>;
    return AuthSession(
      accessToken: body['accessToken'] as String,
      userId: user['id'] as String,
      displayName: user['displayName'] as String,
    );
  }

  /// Register a new account. Throws [AuthException] on validation errors.
  Future<void> register({
    required String phone,
    required String displayName,
    required String cpf,
    required String birthDate,
  }) async {
    final res = await _send(() => _client.post(
          _u('/auth/register'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'phone': phone,
            'displayName': displayName,
            'cpf': cpf,
            'birthDate': birthDate,
          }),
        ));
    if (res.statusCode == 409) {
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final msg = '${body['message']}';
      if (msg.contains('phone')) throw AuthException('Este telefone já está cadastrado.');
      if (msg.contains('cpf')) throw AuthException('Este CPF já está cadastrado.');
      throw AuthException('Conta já existente.');
    }
    if (res.statusCode != 201) {
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      throw AuthException('${body['message'] ?? 'Erro ao cadastrar.'}');
    }
  }

  /// Current wallet balance in cents (GET /auth/me). 0 on any error.
  Future<int> fetchBalance(String token) async {
    final me = await fetchMe(token);
    return int.tryParse('${me['balanceCents']}') ?? 0;
  }

  /// Full profile + balance (GET /auth/me). Empty map on error.
  Future<Map<String, dynamic>> fetchMe(String token) async {
    try {
      final res = await _client
          .get(_u('/auth/me'), headers: {'Authorization': 'Bearer $token'})
          .timeout(_timeout);
      if (res.statusCode != 200) return {};
      return jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      return {};
    }
  }
}
