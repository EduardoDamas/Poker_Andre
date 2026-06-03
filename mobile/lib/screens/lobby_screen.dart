import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../api/tables_api.dart';
import '../game/game_connection.dart';
import '../models/table_info.dart';
import '../theme.dart';
import 'table_screen.dart';

/// Post-login lobby: lists the joinable Poker rooms from the backend.
class LobbyScreen extends StatefulWidget {
  final AuthSession session;
  final TablesApi api;
  LobbyScreen({super.key, required this.session, TablesApi? api})
      : api = api ?? TablesApi();

  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  late Future<List<TableInfo>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.fetchTables(widget.session.accessToken);
  }

  void _reload() {
    setState(() => _future = widget.api.fetchTables(widget.session.accessToken));
  }

  void _open(TableInfo table) {
    final connection = SocketGameConnection(
      baseUrl: widget.api.baseUrl,
      token: widget.session.accessToken,
      userId: widget.session.userId,
      tableId: table.id,
      maxSeats: table.maxSeats,
    );
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => TableScreen(connection: connection, title: table.name)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mesas'),
        actions: [
          IconButton(
            key: const Key('reloadBtn'),
            icon: const Icon(Icons.refresh),
            onPressed: _reload,
          ),
        ],
      ),
      body: FutureBuilder<List<TableInfo>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(color: Brand.red));
          }
          if (snap.hasError) {
            return Center(
              child: Text('${snap.error}',
                  key: const Key('lobbyError'), style: const TextStyle(color: Brand.redBright)),
            );
          }
          final tables = snap.data ?? [];
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: tables.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (_, i) => _TableCard(table: tables[i], onOpen: () => _open(tables[i])),
          );
        },
      ),
    );
  }
}

class _TableCard extends StatelessWidget {
  final TableInfo table;
  final VoidCallback onOpen;
  const _TableCard({required this.table, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Brand.charcoal,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: Brand.red,
          child: Text('${table.level}',
              style: const TextStyle(color: Brand.white, fontWeight: FontWeight.bold)),
        ),
        title: Text(table.name, style: const TextStyle(color: Brand.white, fontWeight: FontWeight.bold)),
        subtitle: Text('Entrada ${table.entryLabel}', style: const TextStyle(color: Brand.gray)),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.people, color: Brand.gray, size: 18),
            Text('${table.players}/${table.maxSeats}', style: const TextStyle(color: Brand.gray)),
          ],
        ),
        onTap: onOpen,
      ),
    );
  }
}
