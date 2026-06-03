import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/table_info.dart';
import 'auth_api.dart' show AuthException;

/// Client for the lobby endpoint. Requires the session JWT.
class TablesApi {
  final String baseUrl;
  final http.Client _client;

  TablesApi({this.baseUrl = 'http://10.0.2.2:3000', http.Client? client})
      : _client = client ?? http.Client();

  Future<List<TableInfo>> fetchTables(String token) async {
    final res = await _client.get(
      Uri.parse('$baseUrl/tables'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (res.statusCode == 401) throw AuthException('Sessão expirada. Entre novamente.');
    if (res.statusCode != 200) throw AuthException('Não foi possível carregar as mesas.');
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => TableInfo.fromJson(e as Map<String, dynamic>)).toList();
  }
}
