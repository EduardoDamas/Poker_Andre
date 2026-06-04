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

  void _soon(String what) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text('$what — disponível em breve (Fase 2: Pix automático)')));

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
              Expanded(child: GradientButton('Depositar', icon: Icons.south, variant: BtnVariant.gold, onPressed: () => _soon('Depósito Pix'))),
              const SizedBox(width: 12),
              Expanded(child: GradientButton('Sacar', icon: Icons.north, variant: BtnVariant.glass, onPressed: () => _soon('Saque Pix'))),
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
