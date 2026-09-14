import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api/auth_api.dart' show AuthSession;
import '../api/points_api.dart';
import '../theme.dart';
import '../widgets/lucky_wheel.dart';
import '../widgets/premium.dart';

/// Pontos — free/paid balances, conversion (1 pago = 1000 grátis), the daily
/// wheel, streak progress and the reward history.
class PointsScreen extends StatefulWidget {
  final AuthSession session;
  final PointsApi api;
  PointsScreen({super.key, required this.session, PointsApi? api}) : api = api ?? PointsApi();

  @override
  State<PointsScreen> createState() => _PointsScreenState();
}

class _PointsScreenState extends State<PointsScreen> {
  PointsStatus? _status;
  String? _error;
  bool _paidToFree = true; // conversion direction
  final _amount = TextEditingController();
  bool _converting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await widget.api.fetchStatus(widget.session.accessToken);
      if (mounted) setState(() => _status = s);
    } catch (e) {
      if (mounted) setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
    }
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  String _fmt(int n) => n.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => '.');

  // ── Conversion ────────────────────────────────────────────────────────────

  ({int input, int output})? get _preview {
    final s = _status;
    final raw = int.tryParse(_amount.text.trim());
    if (s == null || raw == null || raw <= 0) return null;
    if (_paidToFree) return (input: raw, output: raw * s.conversionRate);
    if (raw % s.conversionRate != 0) return null;
    return (input: raw, output: raw ~/ s.conversionRate);
  }

  Future<void> _convert() async {
    final s = _status;
    final p = _preview;
    if (s == null || p == null) return;
    final direction = _paidToFree ? 'PAID_TO_FREE' : 'FREE_TO_PAID';
    final summary = _paidToFree
        ? '${_fmt(p.input)} pontos pagos → ${_fmt(p.output)} pontos grátis'
        : '${_fmt(p.input)} pontos grátis → ${_fmt(p.output)} pontos pagos';

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Brand.surface,
        title: Text('Confirmar conversão', style: Brand.h3),
        content: Text(summary, style: Brand.body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Converter')),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _converting = true);
    try {
      await widget.api.convert(widget.session.accessToken, direction, p.input);
      _amount.clear();
      await _load();
      _toast('Conversão concluída!');
    } catch (e) {
      _toast('$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _converting = false);
    }
  }

  // ── Wheel ────────────────────────────────────────────────────────────────

  Future<void> _openWheel() async {
    final s = _status;
    if (s == null) return;
    final outcome = await showLuckyWheel(
      context,
      segments: s.wheel,
      spin: () => widget.api.spin(widget.session.accessToken),
    );
    if (outcome != null) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    return Scaffold(
      appBar: AppBar(title: const Text('Pontos')),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: s == null
            ? Center(
                child: _error != null
                    ? Text(_error!, style: const TextStyle(color: Brand.danger))
                    : const CircularProgressIndicator(color: Brand.crimson))
            : RefreshIndicator(
                color: Brand.crimson,
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    // ── Balances ──
                    Row(children: [
                      Expanded(
                          child: _balanceCard('Pontos grátis', _fmt(s.freePoints),
                              Icons.stars_outlined, Brand.crimson)),
                      const SizedBox(width: 12),
                      Expanded(
                          child: _balanceCard('Pontos pagos', _fmt(s.paidPoints),
                              Icons.workspace_premium, Brand.gold)),
                    ]),
                    const SizedBox(height: 8),
                    Center(
                        child: Text('1 ponto pago = ${_fmt(s.conversionRate)} pontos grátis',
                            style: Brand.micro)),
                    const SizedBox(height: 20),

                    // ── Daily wheel + streak ──
                    GlassCard(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          const Icon(Icons.casino_outlined, color: Brand.gold),
                          const SizedBox(width: 8),
                          Text('Roleta diária', style: Brand.h3),
                          const Spacer(),
                          if (!s.canSpinToday && s.todaySpin != null)
                            Text(
                                s.todaySpin!.paidPoints > 0
                                    ? 'Hoje: +${s.todaySpin!.paidPoints} pagos'
                                    : 'Hoje: +${_fmt(s.todaySpin!.freePoints)} grátis',
                                style: Brand.micro.copyWith(color: Brand.champagne)),
                        ]),
                        const SizedBox(height: 10),
                        Text('Sequência atual: ${s.streakDays} dia(s)', style: Brand.caption),
                        if (s.nextMilestone != null) ...[
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(999),
                            child: LinearProgressIndicator(
                              value: (s.streakDays / s.nextMilestone!.days).clamp(0.0, 1.0),
                              minHeight: 6,
                              backgroundColor: Brand.surface2,
                              valueColor: const AlwaysStoppedAnimation(Brand.gold),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Próxima recompensa: ${s.nextMilestone!.days} dias → '
                            '${s.nextMilestone!.paidPoints > 0 ? '${_fmt(s.nextMilestone!.paidPoints)} pontos pagos' : '${_fmt(s.nextMilestone!.freePoints)} pontos grátis'}',
                            style: Brand.micro,
                          ),
                        ],
                        const SizedBox(height: 12),
                        GradientButton(
                          s.canSpinToday ? 'Girar a roleta de hoje' : 'Volte amanhã',
                          icon: Icons.casino,
                          variant: s.canSpinToday ? BtnVariant.crimson : BtnVariant.glass,
                          onPressed: s.canSpinToday ? _openWheel : null,
                        ),
                      ]),
                    ),
                    const SizedBox(height: 20),

                    // ── Conversion ──
                    GlassCard(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          const Icon(Icons.swap_horiz, color: Brand.gold),
                          const SizedBox(width: 8),
                          Text('Converter pontos', style: Brand.h3),
                        ]),
                        const SizedBox(height: 12),
                        SegmentedButton<bool>(
                          segments: const [
                            ButtonSegment(value: true, label: Text('Pagos → Grátis')),
                            ButtonSegment(value: false, label: Text('Grátis → Pagos')),
                          ],
                          selected: {_paidToFree},
                          onSelectionChanged: (v) => setState(() => _paidToFree = v.first),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _amount,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          style: Brand.label,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            labelText: _paidToFree
                                ? 'Quantidade de pontos pagos'
                                : 'Quantidade de pontos grátis (múltiplo de ${_fmt(s.conversionRate)})',
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _preview == null
                              ? 'Informe uma quantidade válida.'
                              : _paidToFree
                                  ? 'Você receberá ${_fmt(_preview!.output)} pontos grátis.'
                                  : 'Você receberá ${_fmt(_preview!.output)} pontos pagos.',
                          style: Brand.caption.copyWith(
                              color: _preview == null ? Brand.textTer : Brand.champagne),
                        ),
                        const SizedBox(height: 12),
                        GradientButton('Converter',
                            icon: Icons.swap_horiz,
                            variant: BtnVariant.gold,
                            busy: _converting,
                            onPressed:
                                _preview == null || _converting ? null : _convert),
                      ]),
                    ),
                    const SizedBox(height: 20),

                    // ── History ──
                    Text('Histórico', style: Brand.h3),
                    const SizedBox(height: 8),
                    if (s.history.isEmpty)
                      Text('Nenhuma movimentação ainda.', style: Brand.caption)
                    else
                      ...s.history.map(_historyTile),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _balanceCard(String label, String value, IconData icon, Color color) => GlassCard(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
        child: Column(children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 6),
          Text(value, style: Brand.h2),
          const SizedBox(height: 2),
          Text(label, style: Brand.micro),
        ]),
      );

  static const _kindLabels = {
    'WHEEL': 'Roleta diária',
    'CONVERSION': 'Conversão',
    'MILESTONE': 'Bônus de sequência',
    'GAME_REWARD': 'Vitória vs robôs',
    'ADJUST': 'Ajuste',
  };
  static const _kindIcons = {
    'WHEEL': Icons.casino_outlined,
    'CONVERSION': Icons.swap_horiz,
    'MILESTONE': Icons.military_tech_outlined,
    'GAME_REWARD': Icons.smart_toy_outlined,
    'ADJUST': Icons.tune,
  };

  Widget _historyTile(PointsTxn t) {
    final parts = <String>[];
    if (t.freeDelta != 0) {
      parts.add('${t.freeDelta > 0 ? '+' : ''}${_fmt(t.freeDelta)} grátis');
    }
    if (t.paidDelta != 0) {
      parts.add('${t.paidDelta > 0 ? '+' : ''}${_fmt(t.paidDelta)} pagos');
    }
    final when =
        '${t.createdAt.day.toString().padLeft(2, '0')}/${t.createdAt.month.toString().padLeft(2, '0')}/${t.createdAt.year}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        child: Row(children: [
          Icon(_kindIcons[t.kind] ?? Icons.circle_outlined, size: 18, color: Brand.textSec),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.memo ?? _kindLabels[t.kind] ?? t.kind, style: Brand.label),
              Text(when, style: Brand.micro),
            ]),
          ),
          Text(parts.isEmpty ? '—' : parts.join(' · '),
              style: Brand.caption.copyWith(
                  color: (t.freeDelta + t.paidDelta) >= 0 ? Brand.success : Brand.danger)),
        ]),
      ),
    );
  }
}
