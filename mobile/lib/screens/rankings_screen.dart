import 'package:flutter/material.dart';
import '../api/auth_api.dart' show AuthSession;
import '../api/rankings_api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/premium.dart';

/// Ranking — leaderboards (diário/semanal/mensal) + the winners feed
/// (quem ganhou, quanto e em que nível).
class RankingsScreen extends StatefulWidget {
  final AuthSession session;
  final RankingsApi api;
  RankingsScreen({super.key, required this.session, RankingsApi? api})
      : api = api ?? RankingsApi();

  @override
  State<RankingsScreen> createState() => _RankingsScreenState();
}

class _RankingsScreenState extends State<RankingsScreen> {
  bool _showWinners = false;
  String _period = 'daily';
  List<RankingEntry>? _ranking;
  List<WinnerEntry>? _winners;
  String? _error;

  static const _periods = {
    'daily': 'Diário',
    'weekly': 'Semanal',
    'monthly': 'Mensal',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.fetchRankings(widget.session.accessToken, _period);
      final w = await widget.api.fetchWinners(widget.session.accessToken);
      if (mounted) setState(() { _ranking = r; _winners = w; });
    } catch (e) {
      if (mounted) setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ranking')),
      body: Container(
        decoration: const BoxDecoration(
          gradient: Brand.obsidianGrad,
          image: DecorationImage(
            image: AssetImage('assets/environments/env-tournament-arena.webp'),
            fit: BoxFit.cover,
            colorFilter: ColorFilter.mode(Color(0x990A0A0B), BlendMode.srcOver),
          ),
        ),
        child: RefreshIndicator(
          color: Brand.crimson,
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('Ranking')),
                  ButtonSegment(value: true, label: Text('Vencedores')),
                ],
                selected: {_showWinners},
                onSelectionChanged: (v) => setState(() => _showWinners = v.first),
              ),
              const SizedBox(height: 16),
              if (_error != null)
                Text(_error!, style: const TextStyle(color: Brand.danger))
              else if (_showWinners)
                ..._winnersList()
              else
                ..._rankingList(),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _rankingList() {
    return [
      Row(
        children: _periods.entries.map((e) {
          final sel = _period == e.key;
          return Expanded(
            child: GestureDetector(
              onTap: () {
                setState(() => _period = e.key);
                _load();
              },
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 4),
                padding: const EdgeInsets.symmetric(vertical: 10),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: sel ? Brand.goldGrad : null,
                  color: sel ? null : Brand.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: sel ? Brand.gold : Brand.border),
                ),
                child: Text(e.value,
                    style: TextStyle(
                        color: sel ? Brand.onGold : Brand.textSec,
                        fontWeight: FontWeight.w700,
                        fontSize: 13)),
              ),
            ),
          );
        }).toList(),
      ),
      const SizedBox(height: 16),
      if (_ranking == null)
        const Center(
            child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(color: Brand.crimson)))
      else if (_ranking!.isEmpty)
        Center(
            child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Nenhuma vitória neste período ainda.\nSeja o primeiro!',
              textAlign: TextAlign.center, style: Brand.caption),
        ))
      else
        ..._ranking!.map(_rankingTile),
    ];
  }

  Widget _rankingTile(RankingEntry e) {
    final medal = switch (e.position) {
      1 => const Color(0xFFF5C45E),
      2 => const Color(0xFFC0C7D1),
      3 => const Color(0xFFCD8A54),
      _ => Brand.surface2,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        child: Row(children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: medal, shape: BoxShape.circle),
            child: Text('${e.position}',
                style: TextStyle(
                    color: e.position <= 3 ? Brand.onGold : Brand.textPri,
                    fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(e.name, style: Brand.label),
              Text('${e.wins} vitória(s)', style: Brand.micro),
            ]),
          ),
          Text(brl(e.prizeCents), style: Brand.money.copyWith(color: Brand.gold)),
        ]),
      ),
    );
  }

  List<Widget> _winnersList() {
    if (_winners == null) {
      return const [
        Center(
            child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(color: Brand.crimson)))
      ];
    }
    if (_winners!.isEmpty) {
      return [
        Center(
            child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Nenhum vencedor ainda. Pode ser você!',
              textAlign: TextAlign.center, style: Brand.caption),
        ))
      ];
    }
    return _winners!.map((w) {
      final when =
          '${w.createdAt.day.toString().padLeft(2, '0')}/${w.createdAt.month.toString().padLeft(2, '0')}';
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: GlassCard(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
          child: Row(children: [
            const Icon(Icons.emoji_events, color: Brand.gold, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(w.name, style: Brand.label),
                Text('Nível ${w.level} · $when', style: Brand.micro),
              ]),
            ),
            Text(brl(w.prizeCents), style: Brand.money.copyWith(color: Brand.gold)),
          ]),
        ),
      );
    }).toList();
  }
}
