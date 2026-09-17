import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../api/limits_api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/premium.dart';

/// Jogo responsável — the player's own deposit ceilings and self-exclusion.
///
/// Lowering a ceiling takes effect immediately; raising one waits 24h, so the
/// screen shows any pending change and when it lands.
class LimitsScreen extends StatefulWidget {
  final AuthSession session;
  final LimitsApi limitsApi;
  LimitsScreen({super.key, required this.session, LimitsApi? limitsApi})
      : limitsApi = limitsApi ?? LimitsApi();

  @override
  State<LimitsScreen> createState() => _LimitsScreenState();
}

class _LimitsScreenState extends State<LimitsScreen> {
  PlayerLimits? _limits;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final l = await widget.limitsApi.fetch(widget.session.accessToken);
      if (!mounted) return;
      setState(() => _limits = l);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  Future<void> _run(Future<PlayerLimits> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      final l = await action();
      if (!mounted) return;
      setState(() => _limits = l);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editLimit(String label, String window, int? current) async {
    final ctrl = TextEditingController(
        text: current == null ? '' : (current / 100).toStringAsFixed(2).replaceAll('.', ','));
    final result = await showDialog<Object?>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Brand.surface,
        title: Text('Limite $label', style: Brand.h3),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            controller: ctrl,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: Brand.money,
            decoration: const InputDecoration(labelText: 'Valor em R\$', hintText: '500,00'),
          ),
          const SizedBox(height: 10),
          Text(
            'Reduzir vale na hora. Aumentar só passa a valer 24 horas depois.',
            style: Brand.micro,
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          if (current != null)
            TextButton(
              onPressed: () => Navigator.pop(ctx, _remove),
              child: const Text('Remover limite'),
            ),
          TextButton(
            onPressed: () {
              final raw = ctrl.text.trim().replaceAll('.', '').replaceAll(',', '.');
              final reais = double.tryParse(raw);
              if (reais == null || reais <= 0) return;
              Navigator.pop(ctx, (reais * 100).round());
            },
            child: const Text('Salvar'),
          ),
        ],
      ),
    );
    // null = dialog dismissed (do nothing); _remove = clear the limit.
    if (!mounted || result == null) return;
    final cents = identical(result, _remove) ? null : result as int;
    await _run(
      () => widget.limitsApi.save(
        widget.session.accessToken,
        dailyCents: window == 'daily' ? cents : keepLimit,
        weeklyCents: window == 'weekly' ? cents : keepLimit,
        monthlyCents: window == 'monthly' ? cents : keepLimit,
      ),
      cents == null ? 'Limite removido.' : 'Limite salvo.',
    );
  }

  Future<void> _selfExclude() async {
    final days = await showDialog<int?>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Brand.surface,
        title: Text('Autoexclusão', style: Brand.h3),
        content: Text(
          'Durante a pausa você não poderá depositar nem entrar em mesas a dinheiro. '
          'Não é possível encurtar o período depois de confirmado.',
          style: Brand.body,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, 7), child: const Text('7 dias')),
          TextButton(onPressed: () => Navigator.pop(ctx, 30), child: const Text('30 dias')),
          TextButton(onPressed: () => Navigator.pop(ctx, 90), child: const Text('90 dias')),
        ],
      ),
    );
    if (days == null || !mounted) return;
    await _run(
      () => widget.limitsApi.selfExclude(widget.session.accessToken, days),
      'Autoexclusão ativada por $days dias.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = _limits;
    return Scaffold(
      appBar: AppBar(title: const Text('Autoexclusão e limites')),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: _error != null
            ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, style: Brand.body)))
            : l == null
                ? const Center(child: CircularProgressIndicator(color: Brand.crimson))
                : RefreshIndicator(
                    color: Brand.crimson,
                    backgroundColor: Brand.surface,
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.all(20),
                      children: [
                        Text(
                          'Defina quanto você pode depositar em cada período. '
                          'É você quem decide, e vale para a sua conta.',
                          style: Brand.body,
                        ),
                        const SizedBox(height: 16),
                        if (l.selfExcluded) _excludedBanner(l),
                        if (l.hasPending) _pendingBanner(l),
                        _limitTile('diário', 'daily', l.dailyCents, l.usedDailyCents),
                        _limitTile('semanal', 'weekly', l.weeklyCents, l.usedWeeklyCents),
                        _limitTile('mensal', 'monthly', l.monthlyCents, l.usedMonthlyCents),
                        const SizedBox(height: 24),
                        Text('PAUSA', style: Brand.micro),
                        const SizedBox(height: 8),
                        if (!l.selfExcluded)
                          GradientButton('Ativar autoexclusão',
                              variant: BtnVariant.danger,
                              icon: Icons.block_outlined,
                              onPressed: _busy ? null : _selfExclude),
                        const SizedBox(height: 16),
                        Text(
                          'Se precisar de ajuda com jogo compulsivo, procure apoio profissional. '
                          'Jogue com responsabilidade: maiores de 18 anos.',
                          style: Brand.micro,
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _excludedBanner(PlayerLimits l) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Brand.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Brand.danger),
        ),
        child: Row(children: [
          const Icon(Icons.block_outlined, color: Brand.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Autoexclusão ativa até ${_date(l.selfExcludedUntil!)}. '
              'Depósitos e mesas a dinheiro estão bloqueados.',
              style: Brand.caption,
            ),
          ),
        ]),
      );

  Widget _pendingBanner(PlayerLimits l) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Brand.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Brand.gold),
        ),
        child: Row(children: [
          const Icon(Icons.schedule, color: Brand.gold, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Aumento solicitado. Passa a valer em ${_date(l.pendingEffectiveAt!)} às '
              '${_time(l.pendingEffectiveAt!)}. Até lá vale o limite atual.',
              style: Brand.caption,
            ),
          ),
        ]),
      );

  Widget _limitTile(String label, String window, int? cents, int used) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        child: Material(
          color: Brand.surface,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: _busy ? null : () => _editLimit(label, window, cents),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14), border: Border.all(color: Brand.border)),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Limite $label', style: Brand.label),
                    const SizedBox(height: 3),
                    Text(
                      cents == null
                          ? 'Sem limite · já depositado: ${brl(used)}'
                          : '${brl(cents)} · já usado: ${brl(used)}',
                      style: Brand.micro,
                    ),
                  ]),
                ),
                Text(cents == null ? 'Definir' : 'Alterar',
                    style: Brand.micro.copyWith(color: Brand.gold)),
                const Icon(Icons.chevron_right, color: Brand.textTer, size: 20),
              ]),
            ),
          ),
        ),
      );

  String _date(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  String _time(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

/// "Remover limite" pops this, so a dismissed dialog (null) is never mistaken
/// for a request to clear the player's limit.
const Object _remove = Object();
