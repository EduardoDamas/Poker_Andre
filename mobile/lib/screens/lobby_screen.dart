import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../api/tables_api.dart';
import '../game/game_connection.dart';
import '../models/table_info.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/premium.dart';
import 'table_screen.dart';
import 'tournaments_screen.dart';
import 'wallet_screen.dart';
import 'profile_screen.dart';
import 'solo_setup_screen.dart';

/// Premium lobby: hero header (balance + tier), quick-play, and room cards.
class LobbyScreen extends StatefulWidget {
  final AuthSession session;
  final TablesApi api;
  final AuthApi authApi;
  LobbyScreen({super.key, required this.session, TablesApi? api, AuthApi? authApi})
      : api = api ?? TablesApi(),
        authApi = authApi ?? AuthApi();

  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  late Future<List<TableInfo>> _future;
  int _balance = 0;

  @override
  void initState() {
    super.initState();
    _future = widget.api.fetchTables(widget.session.accessToken);
    _fetchBalance();
  }

  void _reload() {
    setState(() => _future = widget.api.fetchTables(widget.session.accessToken));
    _fetchBalance();
  }

  void _fetchBalance() {
    widget.authApi.fetchBalance(widget.session.accessToken).then((b) {
      if (mounted) setState(() => _balance = b);
    });
  }

  Future<void> _open(TableInfo table) async {
    // Money tournament room: confirm the entry fee (V.I.) before charging.
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Brand.surface,
        title: Text(table.name, style: Brand.h3),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Inscrição: ${table.entryLabel}', style: Brand.label.copyWith(color: Brand.gold)),
          const SizedBox(height: 8),
          Text('O valor é debitado da sua carteira ao entrar. O vencedor do '
              'torneio recebe o prêmio conforme a ocupação da sala.', style: Brand.caption),
          const SizedBox(height: 8),
          Text('Seu saldo: ${brl(_balance)}', style: Brand.caption),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Entrar e pagar')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    if (_balance < table.entryCents) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saldo insuficiente. Faça um depósito na Carteira.')));
      return;
    }

    final connection = SocketGameConnection(
      baseUrl: widget.api.baseUrl,
      token: widget.session.accessToken,
      userId: widget.session.userId,
      tableId: table.id,
      maxSeats: table.maxSeats,
      level: table.level, // tournament room → entry fee charged
    );
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => TableScreen(connection: connection, title: table.name)),
    ).then((_) {
      _reload();
      _fetchBalance();
    });
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.session.displayName;
    return Scaffold(
      appBar: AppBar(
        // Keep the "Mesas" title (test anchor) but as a brand wordmark row.
        title: const Text('Mesas'),
        actions: [
          IconButton(key: const Key('reloadBtn'), icon: const Icon(Icons.refresh, color: Brand.textSec), onPressed: _reload),
          const SizedBox(width: 4),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: SafeArea(
          top: false,
          child: RefreshIndicator(
            color: Brand.crimson,
            backgroundColor: Brand.surface,
            onRefresh: () async => _reload(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                _Header(name: name, balance: _balance),
                const SizedBox(height: 20),
                _FeaturedCard(onTap: () => Navigator.push(
                    context, MaterialPageRoute(builder: (_) => const SoloSetupScreen()))),
                const SizedBox(height: 24),
                const SectionHeader('Salas (online)'),
                const SizedBox(height: 12),
                FutureBuilder<List<TableInfo>>(
                  future: _future,
                  builder: (context, snap) {
                    if (snap.connectionState == ConnectionState.waiting) {
                      return const Padding(
                        padding: EdgeInsets.only(top: 40),
                        child: Center(child: CircularProgressIndicator(color: Brand.crimson)),
                      );
                    }
                    if (snap.hasError) {
                      return Padding(
                        padding: const EdgeInsets.only(top: 24),
                        child: Text('${snap.error}', key: const Key('lobbyError'), style: const TextStyle(color: Brand.danger)),
                      );
                    }
                    final tables = snap.data ?? [];
                    return Column(
                      children: [
                        for (final t in tables) ...[
                          _RoomCard(table: t, onOpen: () => _open(t)),
                          const SizedBox(height: 12),
                        ],
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
      bottomNavigationBar: _BottomNav(session: widget.session, authApi: widget.authApi),
    );
  }
}

class _Header extends StatelessWidget {
  final String name;
  final int balance;
  const _Header({required this.name, required this.balance});
  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(
        width: 44, height: 44,
        decoration: BoxDecoration(
          gradient: Brand.crimsonGrad, shape: BoxShape.circle, boxShadow: Brand.glow(Brand.crimson)),
        child: Center(child: Text(name.isNotEmpty ? name[0].toUpperCase() : 'C',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18))),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: Brand.h3),
          Row(children: [
            const Icon(Icons.workspace_premium, size: 13, color: Brand.gold),
            const SizedBox(width: 4),
            Text('Membro', style: Brand.micro.copyWith(color: Brand.gold)),
          ]),
        ]),
      ),
      BalancePill(balance),
    ]);
  }
}

class _FeaturedCard extends StatelessWidget {
  final VoidCallback onTap;
  const _FeaturedCard({required this.onTap});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Brand.crimsonDeep, Brand.bg]),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Brand.crimson.withValues(alpha: 0.4)),
          boxShadow: Brand.cardShadow,
        ),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('JOGAR SOLO', style: Brand.micro.copyWith(color: Brand.gold)),
              const SizedBox(height: 6),
              const Text('Texas Hold’em vs Bots', style: Brand.h2),
              const SizedBox(height: 4),
              Text('Offline, sem espera — jogue agora', style: Brand.caption),
            ]),
          ),
          const SizedBox(width: 12),
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(
              color: Brand.bg.withValues(alpha: 0.4), shape: BoxShape.circle, border: Border.all(color: Brand.crimson)),
            child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 32),
          ),
        ]),
      ),
    );
  }
}

class _RoomCard extends StatelessWidget {
  final TableInfo table;
  final VoidCallback onOpen;
  const _RoomCard({required this.table, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final full = table.players >= table.maxSeats;
    return GlassCard(
      onTap: onOpen,
      padding: const EdgeInsets.all(14),
      child: Row(children: [
        LevelBadge(table.level),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(table.name, style: Brand.h3),
            const SizedBox(height: 3),
            // Keep "Entrada R$ X,XX" text (test anchor).
            Text('Entrada ${table.entryLabel}', style: Brand.caption),
            const SizedBox(height: 8),
            Row(children: [
              FillDots(filled: table.players, total: table.maxSeats),
              const SizedBox(width: 8),
              Text('${table.players}/${table.maxSeats}', style: Brand.micro.copyWith(color: Brand.textSec)),
            ]),
          ]),
        ),
        const SizedBox(width: 10),
        full
            ? Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(color: Brand.surface2, borderRadius: BorderRadius.circular(12)),
                child: Text('CHEIA', style: Brand.micro.copyWith(color: Brand.textSec)),
              )
            : const Icon(Icons.chevron_right, color: Brand.textTer),
      ]),
    );
  }
}

class _BottomNav extends StatelessWidget {
  final AuthSession session;
  final AuthApi authApi;
  const _BottomNav({required this.session, required this.authApi});

  @override
  Widget build(BuildContext context) {
    void go(Widget screen) => Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

    Widget item(IconData icon, String label, bool active, VoidCallback? onTap) => Expanded(
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 22, color: active ? Brand.crimson : Brand.textTer),
                  const SizedBox(height: 3),
                  Text(label, style: Brand.micro.copyWith(color: active ? Brand.crimson : Brand.textTer)),
                ],
              ),
            ),
          ),
        );

    return Container(
      decoration: const BoxDecoration(
        color: Brand.surface,
        border: Border(top: BorderSide(color: Brand.border)),
      ),
      padding: const EdgeInsets.only(top: 8, bottom: 16),
      child: Row(children: [
        item(Icons.grid_view_rounded, 'Salas', true, null),
        item(Icons.emoji_events_outlined, 'Torneios', false,
            () => go(TournamentsScreen(session: session, authApi: authApi))),
        item(Icons.account_balance_wallet_outlined, 'Carteira', false,
            () => go(WalletScreen(session: session, authApi: authApi))),
        item(Icons.person_outline, 'Perfil', false,
            () => go(ProfileScreen(session: session, authApi: authApi))),
      ]),
    );
  }
}
