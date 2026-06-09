import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../theme.dart';
import '../format.dart';
import '../widgets/premium.dart';

/// Carteira — balance + Pix deposit/withdraw entry points (Phase 1: manual).
class WalletScreen extends StatefulWidget {
  final AuthSession session;
  final AuthApi authApi;
  WalletScreen({super.key, required this.session, AuthApi? authApi}) : authApi = authApi ?? AuthApi();

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  int _balance = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    widget.authApi.fetchBalance(widget.session.accessToken).then((b) {
      if (mounted) setState(() { _balance = b; _loading = false; });
    });
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _refreshBalance() async {
    final b = await widget.authApi.fetchBalance(widget.session.accessToken);
    if (mounted) setState(() => _balance = b);
  }

  // Ask for an amount in BRL, returns cents (or null if cancelled).
  Future<int?> _askAmountCents(String title) async {
    final ctrl = TextEditingController();
    return showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Brand.surface,
        title: Text(title, style: Brand.h3),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: Brand.money,
          decoration: const InputDecoration(labelText: 'Valor em R\$', hintText: '50,00'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(
            onPressed: () {
              final raw = ctrl.text.trim().replaceAll('.', '').replaceAll(',', '.');
              final reais = double.tryParse(raw);
              Navigator.pop(ctx, reais == null ? null : (reais * 100).round());
            },
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
  }

  Future<void> _deposit() async {
    final cents = await _askAmountCents('Depositar via Pix');
    if (cents == null || cents <= 0) return;
    try {
      await widget.authApi.requestDeposit(widget.session.accessToken, cents);
      _toast('Depósito registrado! Aguarde a confirmação do administrador.');
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _withdraw() async {
    final cents = await _askAmountCents('Sacar via Pix');
    if (cents == null || cents <= 0) return;
    if (!mounted) return;
    final keyCtrl = TextEditingController();
    final pixKey = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Brand.surface,
        title: Text('Chave Pix para recebimento', style: Brand.h3),
        content: TextField(
          controller: keyCtrl,
          autofocus: true,
          style: Brand.label,
          decoration: const InputDecoration(labelText: 'Chave Pix (CPF, e-mail, telefone…)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, keyCtrl.text.trim()), child: const Text('Solicitar')),
        ],
      ),
    );
    if (pixKey == null || pixKey.isEmpty) return;
    try {
      await widget.authApi.requestWithdrawal(widget.session.accessToken, cents, pixKey);
      await _refreshBalance();
      _toast('Saque solicitado! O administrador fará o Pix manualmente.');
    } catch (e) {
      _toast('$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Carteira')),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const SizedBox(height: 12),
            Center(child: Text('Saldo', style: Brand.micro)),
            const SizedBox(height: 8),
            Center(
              child: _loading
                  ? const SizedBox(height: 40, child: Center(child: CircularProgressIndicator(color: Brand.gold)))
                  : Row(mainAxisSize: MainAxisSize.min, children: [
                      Container(
                        width: 26, height: 26,
                        decoration: const BoxDecoration(gradient: Brand.goldGrad, shape: BoxShape.circle),
                        child: const Center(child: Text(r'$', style: TextStyle(color: Brand.onGold, fontWeight: FontWeight.w800))),
                      ),
                      const SizedBox(width: 10),
                      Text(brl(_balance), style: Brand.display.copyWith(color: Brand.gold)),
                    ]),
            ),
            const SizedBox(height: 24),
            Row(children: [
              Expanded(child: GradientButton('Depositar', icon: Icons.south, variant: BtnVariant.gold, onPressed: _deposit)),
              const SizedBox(width: 12),
              Expanded(child: GradientButton('Sacar', icon: Icons.north, variant: BtnVariant.glass, onPressed: _withdraw)),
            ]),
            const SizedBox(height: 28),
            const SectionHeader('Transações'),
            const SizedBox(height: 12),
            GlassCard(
              child: Column(children: [
                _tx(Icons.emoji_events, 'Saldo inicial', brl(_balance), Brand.success),
                const Divider(color: Brand.border, height: 24),
                Text('Histórico completo em breve.', style: Brand.caption),
              ]),
            ),
            const SizedBox(height: 16),
            Text('Fase 1: depósitos e saques via Pix são processados manualmente pelo '
                'administrador. A automação total chega na Fase 2.', style: Brand.caption),
          ],
        ),
      ),
    );
  }

  Widget _tx(IconData icon, String label, String amount, Color color) => Row(children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 12),
        Expanded(child: Text(label, style: Brand.label)),
        Text(amount, style: Brand.money.copyWith(color: color, fontSize: 15)),
      ]);
}
