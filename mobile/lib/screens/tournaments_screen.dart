import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/auth_api.dart';
import '../api/payments_api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/premium.dart';

/// Torneios — pick a room level and pay the entry via InfinitePay (card only for now),
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
  // An open purchase waiting for the admin to confirm the payment.
  SubscriptionRequestResult? _pendingPlan;
  String? _busyPlan;

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
      final requests = await widget.paymentsApi.fetchSubscriptionRequests(token);
      if (!mounted) return;
      setState(() {
        _entries = entries;
        _plans = plans;
        _subscriber = sub.isNotEmpty && sub != 'NONE';
        _pendingPlan = requests.where((r) => r.status == 'REQUESTED').firstOrNull;
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
    // Pix is disabled for now (card-only) — the merchant re-enables Pix in
    // InfinitePay once the bank reconciliation is set up.
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

  /// Buy a plan: record the request, then open the merchant's checkout link.
  /// The plan is released after the payment is confirmed (not automatic).
  Future<void> _subscribe(SubscriptionPlan plan) async {
    setState(() => _busyPlan = plan.plan);
    SubscriptionRequestResult req;
    try {
      req = await widget.paymentsApi.requestSubscription(widget.session.accessToken, plan.plan);
    } catch (e) {
      if (mounted) {
        setState(() => _busyPlan = null);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
      return;
    }
    if (!mounted) return;
    // Clear the spinner before the checkout/dialog: the card is done loading.
    setState(() {
      _pendingPlan = req;
      _busyPlan = null;
    });

    try {
      // Open the checkout without blocking: the explanation shows right away,
      // and a launch failure surfaces its own message.
      if (req.url.isNotEmpty) unawaited(_openCheckout(req.url));
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: Brand.surface,
          title: Text('Assinatura ${_planName(plan.plan)}', style: Brand.h3),
          content: Text(
            'Depois de concluir o pagamento, seu plano é liberado assim que confirmarmos '
            'o recebimento. Você verá o desconto nas inscrições assim que isso acontecer.',
            style: Brand.body,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Entendi')),
          ],
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
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
        decoration: const BoxDecoration(
          gradient: Brand.obsidianGrad,
          image: DecorationImage(
            image: AssetImage('assets/environments/env-tournament-arena.webp'),
            fit: BoxFit.cover,
            colorFilter: ColorFilter.mode(Color(0x800A0A0B), BlendMode.srcOver),
          ),
        ),
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
          Text('Escolha o nível da sala e pague a inscrição com cartão. '
              'O vencedor recebe o prêmio conforme a ocupação da sala.', style: Brand.body),
        ]),
      );

  Widget _levelCard(int level) {
    final card = _entryFor(level, 'card');
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
            Text('Entrada ${card != null ? brl(card.amountCents) : '--'} (cartão)', style: Brand.caption),
          ]),
        ),
        const Icon(Icons.chevron_right, color: Brand.textTer),
      ]),
    );
  }

  Widget _subsIntro() => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          'Assinantes pagam entrada com desconto e recebem uma fração maior do '
          'prêmio (Não assinante 25% · Mensal 30% · Trimestral 50% · Semestral 75% · Anual 100%).',
          style: Brand.caption,
        ),
        const SizedBox(height: 6),
        Text(
          'Toque no plano para assinar com cartão. O plano é liberado após a confirmação do pagamento.',
          style: Brand.micro,
        ),
      ]);

  Widget _planCard(SubscriptionPlan p) {
    final pending = _pendingPlan?.plan == p.plan;
    return GlassCard(
      onTap: _busyPlan == null ? () => _subscribe(p) : null,
      padding: const EdgeInsets.all(14),
      child: Row(children: [
        const Icon(Icons.workspace_premium, color: Brand.gold, size: 22),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_planName(p.plan), style: Brand.h3),
            if (pending) ...[
              const SizedBox(height: 3),
              Text('Aguardando confirmação do pagamento', style: Brand.micro.copyWith(color: Brand.gold)),
            ],
          ]),
        ),
        if (_busyPlan == p.plan)
          const SizedBox(
            width: 18, height: 18,
            child: CircularProgressIndicator(strokeWidth: 2, color: Brand.crimson),
          )
        else
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(brl(p.cardPriceCents), style: Brand.label.copyWith(color: Brand.gold)),
            Text('no cartão', style: Brand.micro),
          ]),
      ]),
    );
  }
}
