import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../api/points_api.dart';
import '../theme.dart';
import '../format.dart';
import '../widgets/premium.dart';
import 'points_screen.dart';
import 'settings_screen.dart';

/// Perfil — player identity, stats, and account actions.
class ProfileScreen extends StatefulWidget {
  final AuthSession session;
  final AuthApi authApi;
  ProfileScreen({super.key, required this.session, AuthApi? authApi}) : authApi = authApi ?? AuthApi();

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic> _me = {};
  final _pointsApi = PointsApi();
  PointsStatus? _points;

  @override
  void initState() {
    super.initState();
    widget.authApi.fetchMe(widget.session.accessToken).then((m) {
      if (mounted) setState(() => _me = m);
    });
    _loadPoints();
  }

  Future<void> _loadPoints() async {
    try {
      final p = await _pointsApi.fetchStatus(widget.session.accessToken);
      if (mounted) setState(() => _points = p);
    } catch (_) {
      // Points stay hidden if the endpoint is unreachable.
    }
  }

  String _fmtPts(int n) =>
      n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => '.');

  String _maskPhone(String p) => p.length < 6 ? p : '${p.substring(0, p.length - 4).replaceAll(RegExp(r'\d'), '•')}${p.substring(p.length - 4)}';

  @override
  Widget build(BuildContext context) {
    final name = _me['displayName']?.toString() ?? widget.session.displayName;
    final phone = _me['phone']?.toString() ?? '';
    final balance = int.tryParse('${_me['balanceCents']}') ?? 0;
    final status = _me['status']?.toString() ?? 'ACTIVE';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Perfil'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: Brand.textSec),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SettingsScreen(session: widget.session))),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: Brand.obsidianGrad,
          image: DecorationImage(
            image: AssetImage('assets/environments/env-profile.webp'),
            fit: BoxFit.cover,
            colorFilter: ColorFilter.mode(Color(0x990A0A0B), BlendMode.srcOver),
          ),
        ),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const SizedBox(height: 12),
            Center(
              child: Container(
                width: 92, height: 92,
                decoration: BoxDecoration(
                  gradient: Brand.crimsonGrad, shape: BoxShape.circle,
                  border: Border.all(color: Brand.gold, width: 2), boxShadow: Brand.glow(Brand.crimson)),
                child: Center(child: Text(name.isNotEmpty ? name[0].toUpperCase() : 'C',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 36))),
              ),
            ),
            const SizedBox(height: 14),
            Center(child: Text(name, style: Brand.h1)),
            const SizedBox(height: 4),
            Center(child: Text(_maskPhone(phone), style: Brand.caption)),
            const SizedBox(height: 8),
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(gradient: Brand.goldGrad, borderRadius: BorderRadius.circular(999)),
                child: Row(mainAxisSize: MainAxisSize.min, children: const [
                  Icon(Icons.workspace_premium, size: 14, color: Brand.onGold),
                  SizedBox(width: 5),
                  Text('Membro', style: TextStyle(color: Brand.onGold, fontWeight: FontWeight.w700, fontSize: 12)),
                ]),
              ),
            ),
            const SizedBox(height: 24),
            Row(children: [
              Expanded(child: _stat('Saldo', brl(balance))),
              const SizedBox(width: 12),
              Expanded(child: _stat('Status', status == 'ACTIVE' ? 'Ativo' : status)),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _stat('Mãos', '—')),
              const SizedBox(width: 12),
              Expanded(child: _stat('Vitórias', '—')),
            ]),
            if (_points != null) ...[
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _stat('Pontos grátis', _fmtPts(_points!.freePoints))),
                const SizedBox(width: 12),
                Expanded(child: _stat('Pontos pagos', _fmtPts(_points!.paidPoints))),
              ]),
              const SizedBox(height: 12),
              GlassCard(
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Icon(Icons.local_fire_department, size: 18, color: Brand.gold),
                    const SizedBox(width: 6),
                    Text('Sequência: ${_points!.streakDays} dia(s)', style: Brand.label),
                    const Spacer(),
                    if (_points!.todaySpin != null)
                      Text(
                          _points!.todaySpin!.paidPoints > 0
                              ? 'Hoje: +${_points!.todaySpin!.paidPoints} pagos'
                              : 'Hoje: +${_fmtPts(_points!.todaySpin!.freePoints)} grátis',
                          style: Brand.micro.copyWith(color: Brand.champagne)),
                  ]),
                  if (_points!.nextMilestone != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Próxima recompensa: ${_points!.nextMilestone!.days} dias → '
                      '${_points!.nextMilestone!.paidPoints > 0 ? '${_fmtPts(_points!.nextMilestone!.paidPoints)} pontos pagos' : '${_fmtPts(_points!.nextMilestone!.freePoints)} pontos grátis'}',
                      style: Brand.micro,
                    ),
                  ],
                ]),
              ),
              const SizedBox(height: 12),
              GradientButton('Pontos e Roleta Diária',
                  icon: Icons.casino_outlined, variant: BtnVariant.gold, onPressed: () async {
                await Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => PointsScreen(session: widget.session)));
                _loadPoints();
              }),
            ],
            const SizedBox(height: 24),
            GradientButton('Sair', variant: BtnVariant.glass, icon: Icons.logout, onPressed: () {
              Navigator.of(context).popUntil((r) => r.isFirst);
            }),
          ],
        ),
      ),
    );
  }

  Widget _stat(String label, String value) => GlassCard(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
        child: Column(children: [
          Text(value, style: Brand.h3),
          const SizedBox(height: 4),
          Text(label, style: Brand.micro),
        ]),
      );
}
