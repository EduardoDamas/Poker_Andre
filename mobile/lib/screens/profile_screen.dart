import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/auth_api.dart';
import '../api/points_api.dart';
import '../config.dart';
import '../theme.dart';
import '../format.dart';
import '../widgets/premium.dart';
import 'points_screen.dart';
import 'login_screen.dart';
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
  ({String code, int invited})? _referral;

  @override
  void initState() {
    super.initState();
    widget.authApi.fetchMe(widget.session.accessToken).then((m) {
      if (mounted) setState(() => _me = m);
    });
    _loadPoints();
    widget.authApi.fetchReferral(widget.session.accessToken).then((r) {
      if (mounted) setState(() => _referral = r);
    }).catchError((_) {
      // The card stays hidden if the code can't be read right now.
    });
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
            if (_referral != null) ...[
              _InviteCard(code: _referral!.code, invited: _referral!.invited),
              const SizedBox(height: 12),
            ],
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
            GradientButton('Sair',
                key: const Key('logoutBtn'),
                variant: BtnVariant.glass,
                icon: Icons.logout,
                onPressed: () => logOut(context)),
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

/// The player's own code to invite friends (client, 2026-10-14): copy it, or
/// send the invitation straight to WhatsApp with the code and the link.
class _InviteCard extends StatelessWidget {
  final String code;
  final int invited;
  const _InviteCard({required this.code, required this.invited});

  String get _message => 'Vem jogar no CAPA CONTEST comigo! Torneios de Poker valendo prêmio. '
      'Use meu código $code no cadastro. Assinando um plano, você começa os torneios pagos com mais fichas. '
      'Baixe o app: ${AppConfig.apiBase}/baixar — ou jogue no navegador: ${AppConfig.apiBase}/jogar/';

  Future<void> _whatsApp(BuildContext context) async {
    final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(_message)}');
    var ok = false;
    try {
      ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Não foi possível abrir o WhatsApp.')));
    }
  }

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: code));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Código $code copiado.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.card_giftcard, size: 18, color: Brand.gold),
          const SizedBox(width: 6),
          Expanded(child: Text('Convide amigos', style: Brand.label, overflow: TextOverflow.ellipsis)),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              invited == 0 ? 'Nenhum amigo ainda' : invited == 1 ? '1 amigo cadastrado' : '$invited amigos cadastrados',
              key: const Key('invitedCount'),
              overflow: TextOverflow.ellipsis,
              style: Brand.micro.copyWith(color: Brand.champagne),
            ),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Text('Seu código', style: Brand.micro),
          const SizedBox(width: 10),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: SelectableText(code,
                  key: const Key('myReferralCode'),
                  style: Brand.h2.copyWith(color: Brand.gold, letterSpacing: 2)),
            ),
          ),
          IconButton(
            key: const Key('copyCode'),
            tooltip: 'Copiar código',
            icon: const Icon(Icons.copy, color: Brand.textSec, size: 20),
            onPressed: () => _copy(context),
          ),
        ]),
        const SizedBox(height: 6),
        Text('Quem se cadastrar com o seu código fica vinculado a você.', style: Brand.micro),
        const SizedBox(height: 12),
        GradientButton('Convidar no WhatsApp',
            key: const Key('inviteWhatsApp'),
            icon: Icons.chat,
            variant: BtnVariant.gold,
            onPressed: () => _whatsApp(context)),
      ]),
    );
  }
}
