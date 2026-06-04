import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets/premium.dart';

/// Configurações — local preferences + account actions.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _sound = true;
  bool _haptics = true;
  bool _notifications = true;
  bool _animations = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Configurações')),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _section('Jogo'),
            _toggle('Som', _sound, (v) => setState(() => _sound = v)),
            _toggle('Vibração', _haptics, (v) => setState(() => _haptics = v)),
            _toggle('Animações', _animations, (v) => setState(() => _animations = v)),
            const SizedBox(height: 16),
            _section('Notificações'),
            _toggle('Push', _notifications, (v) => setState(() => _notifications = v)),
            const SizedBox(height: 16),
            _section('Jogo responsável'),
            _link('Limites de depósito', Icons.shield_outlined),
            _link('Autoexclusão', Icons.block_outlined),
            const SizedBox(height: 16),
            _section('Sobre'),
            _link('Termos de uso', Icons.description_outlined),
            _link('Privacidade', Icons.lock_outline),
            _link('Versão 1.0.0', Icons.info_outline),
            const SizedBox(height: 24),
            GradientButton('Sair da conta', variant: BtnVariant.danger, icon: Icons.logout,
                onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst)),
          ],
        ),
      ),
    );
  }

  Widget _section(String title) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(title.toUpperCase(), style: Brand.micro),
      );

  Widget _toggle(String label, bool value, ValueChanged<bool> onChanged) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        decoration: BoxDecoration(color: Brand.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: Brand.border)),
        child: Row(children: [
          Expanded(child: Text(label, style: Brand.label)),
          Switch(value: value, onChanged: onChanged, activeThumbColor: Colors.white, activeTrackColor: Brand.crimson),
        ]),
      );

  Widget _link(String label, IconData icon) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        child: Material(
          color: Brand.surface,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () {},
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: Brand.border)),
              child: Row(children: [
                Icon(icon, size: 20, color: Brand.textSec),
                const SizedBox(width: 12),
                Expanded(child: Text(label, style: Brand.label)),
                const Icon(Icons.chevron_right, color: Brand.textTer, size: 20),
              ]),
            ),
          ),
        ),
      );
}
