import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/auth_api.dart';
import '../api/payments_api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/premium.dart';

/// Torneios — pick a room level and pay the entry via InfinitePay (Pix/cartão),
/// plus the subscription plans. Entry prices reflect whether you're a subscriber.
class TournamentsScreen extends StatefulWidget {
  final AuthSession session;
  final AuthApi authApi;
  final PaymentsApi paymentsApi;
  TournamentsScreen({
    super.key,
    required this.session,
    AuthApi? authApi,
    PaymentsApi? paymentsApi,
  })  : authApi = authApi ?? AuthApi(),
        paymentsApi = paymentsApi ?? PaymentsApi();

  @override
  State<TournamentsScreen> createState() => _TournamentsScreenState();
}

class _TournamentsScreenState extends State<TournamentsScreen> {
  List<EntryLink> _entries = [];
  List<SubscriptionPlan> _plans = [];
  bool _subscriber = false;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final token = widget.session.accessToken;
      final entries = await widget.paymentsApi.fetchEntries(token);
      final plans = await widget.paymentsApi.fetchSubscriptions(token);
      final me = await widget.authApi.fetchMe(token);
      final sub = '${me['subscription'] ?? 'NONE'}';
      if (!mounted) return;
      setState(() {
        _entries = entries;
        _plans = plans;
        _subscriber = sub.isNotEmpty && sub != 'NONE';
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  List<int> get _levels {
    final set = <int>{for (final e in _entries) e.level};
    final list = set.toList()..sort();
    return list;
  }

  EntryLink? _entryFor(int level, String method) {
    for (final e in _entries) {
      if (e.level == level && e.subscriber == _subscriber && e.method == method) return e;
    }
    return null;
  }

  Future<void> _openCheckout(String url) async {
    try {
      final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Não foi possível abrir o pagamento.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Não foi possível abrir o pagamento.')));
      }
    }
  }

  void _chooseMethod(int level) {
    final pix = _entryFor(level, 'pix');
    final card = _entryFor(level, 'card');
    showModalBottomSheet(
      context: context,
      backgroundColor: Brand.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
            child: Row(children: [
              Text('Inscrição — Nível $level', style: Brand.h3),
              const Spacer(),
              Text(_subscriber ? 'Assinante' : 'Não assinante',
                  style: Brand.micro.copyWith(color: Brand.gold)),
            ]),
          ),
          if (pix != null)
            ListTile(
              leading: const Icon(Icons.pix, color: Brand.gold),
              title: const Text('Pagar com Pix'),
              trailing: Text(brl(pix.amountCents), style: Brand.label.copyWith(color: Brand.gold)),
              onTap: () {
                Navigator.pop(ctx);
                _openCheckout(pix.url);
              },
            ),
          if (card != null)
            ListTile(
              leading: const Icon(Icons.credit_card, color: Brand.gold),
              title: const Text('Pagar com cartão'),
              trailing: Text(brl(card.amountCents), style: Brand.label.copyWith(color: Brand.gold)),
              onTap: () {
                Navigator.pop(ctx);
                _openCheckout(card.url);
              },
            ),
          const SizedBox(height: 12),
        ]),
      ),
    );
  }

  String _planName(String plan) {
    switch (plan) {
      case 'MONTHLY':
        return 'Mensal';
      case 'QUARTERLY':
        return 'Trimestral';
      case 'SEMIANNUAL':
        return 'Semestral';
      case 'ANNUAL':
        return 'Anual';
      default:
        return plan;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Torneios')),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: Brand.crimson))
            : RefreshIndicator(
                color: Brand.crimson,
                backgroundColor: Brand.surface,
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    _intro(),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: Brand.danger)),
                    ],
                    const SizedBox(height: 24),
                    const SectionHeader('Salas de Torneio'),
                    const SizedBox(height: 12),
                    for (final level in _levels) ...[
                      _levelCard(level),
                      const SizedBox(height: 12),
                    ],
                    const SizedBox(height: 12),
                    const SectionHeader('Assinaturas'),
                    const SizedBox(height: 12),
                    _subsIntro(),
                    const SizedBox(height: 12),
                    for (final p in _plans) ...[
                      _planCard(p),
                      const SizedBox(height: 12),
                    ],
                  ],
                ),
              ),
      ),
    );
  }

  Widget _intro() => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Brand.crimsonDeep, Brand.bg]),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Brand.gold.withValues(alpha: 0.4)),
          boxShadow: Brand.cardShadow,
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.emoji_events, color: Brand.gold, size: 26),
            const SizedBox(width: 10),
            Text('Torneios CAPA', style: Brand.h2),
          ]),
          const SizedBox(height: 10),
          Text('Escolha o nível da sala e pague a inscrição por Pix ou cartão. '
              'O vencedor recebe o prêmio conforme a ocupação da sala.', style: Brand.body),
        ]),
      );

  Widget _levelCard(int level) {
    final pix = _entryFor(level, 'pix');
    return GlassCard(
      onTap: () => _chooseMethod(level),
      padding: const EdgeInsets.all(14),
      child: Row(children: [
        LevelBadge(level),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Nível $level', style: Brand.h3),
            const SizedBox(height: 3),
            Text('Entrada ${pix != null ? brl(pix.amountCents) : '--'} (Pix)', style: Brand.caption),
          ]),
        ),
        const Icon(Icons.chevron_right, color: Brand.textTer),
      ]),
    );
  }

  Widget _subsIntro() => Text(
        'Assinantes pagam entrada com desconto e recebem uma fração maior do '
        'prêmio (Não assinante 25% · Mensal 30% · Trimestral 50% · Semestral 75% · Anual 100%).',
        style: Brand.caption,
      );

  Widget _planCard(SubscriptionPlan p) => GlassCard(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          const Icon(Icons.workspace_premium, color: Brand.gold, size: 22),
          const SizedBox(width: 12),
          Expanded(child: Text(_planName(p.plan), style: Brand.h3)),
          Text(brl(p.priceCents), style: Brand.label.copyWith(color: Brand.gold)),
        ]),
      );
}
