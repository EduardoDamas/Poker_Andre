import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../api/tables_api.dart';
import '../theme.dart';
import '../widgets/premium.dart';
import 'lobby_screen.dart';
import 'register_screen.dart';
import 'solo_setup_screen.dart';

/// Phone-OTP login. Two steps: enter phone → request code; enter code → verify.
class LoginScreen extends StatefulWidget {
  final AuthApi api;
  final TablesApi? tablesApi;
  final String initialPhone;
  const LoginScreen({super.key, required this.api, this.tablesApi, this.initialPhone = ''});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

enum _Step { phone, code }

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  _Step _step = _Step.phone;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _phone.text = widget.initialPhone;
  }

  Future<void> _sendCode() async {
    setState(() { _busy = true; _error = null; });
    try {
      await widget.api.requestOtp(_phone.text.trim());
      setState(() => _step = _Step.code);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() { _busy = true; _error = null; });
    try {
      final session = await widget.api.verifyOtp(_phone.text.trim(), _code.text.trim());
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
            builder: (_) => LobbyScreen(session: session, api: widget.tablesApi, authApi: widget.api)),
      );
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _Wordmark(),
                  const SizedBox(height: 10),
                  Text('Torneios Digitais de Cartas e Tabuleiro',
                      textAlign: TextAlign.center, style: Brand.caption),
                  const SizedBox(height: 44),
                  if (_step == _Step.phone) ...[
                    TextField(
                      key: const Key('phoneField'),
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      style: Brand.label,
                      decoration: const InputDecoration(labelText: 'Telefone', hintText: '+5511999998888'),
                    ),
                    const SizedBox(height: 16),
                    GradientButton('Enviar código', key: const Key('sendCodeBtn'), busy: _busy, onPressed: _sendCode),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => RegisterScreen(api: widget.api, initialPhone: _phone.text.trim()),
                      )),
                      child: Text('Não tem conta? Criar conta',
                          style: Brand.caption.copyWith(color: Brand.gold)),
                    ),
                  ] else ...[
                    Text('O administrador enviará o código para você.',
                        textAlign: TextAlign.center, style: Brand.caption),
                    const SizedBox(height: 4),
                    Text(_phone.text.trim(),
                        textAlign: TextAlign.center,
                        style: Brand.label.copyWith(color: Brand.gold)),
                    const SizedBox(height: 16),
                    TextField(
                      key: const Key('codeField'),
                      controller: _code,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      textAlign: TextAlign.center,
                      style: Brand.h2.copyWith(letterSpacing: 10),
                      decoration: const InputDecoration(labelText: 'Código (6 dígitos)', counterText: ''),
                    ),
                    const SizedBox(height: 12),
                    GradientButton('Entrar', key: const Key('verifyBtn'), busy: _busy, onPressed: _verify),
                    TextButton(
                      onPressed: _busy ? null : () => setState(() => _step = _Step.phone),
                      child: Text('Trocar número', style: Brand.caption.copyWith(color: Brand.textTer)),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(_error!, key: const Key('errorText'),
                        textAlign: TextAlign.center, style: const TextStyle(color: Brand.danger)),
                  ],
                  const SizedBox(height: 32),
                  const _Divider(),
                  const SizedBox(height: 20),
                  GradientButton(
                    'Jogar sem conta  ▶',
                    key: const Key('guestBtn'),
                    variant: BtnVariant.gold,
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const SoloSetupScreen()),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('Modo Solo — offline, contra bots, sem internet.',
                      textAlign: TextAlign.center, style: Brand.micro.copyWith(color: Brand.textTer)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) {
    return Row(children: [
      const Expanded(child: Divider(color: Color(0x33FFFFFF), thickness: 1)),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Text('ou', style: Brand.micro.copyWith(color: Brand.textTer)),
      ),
      const Expanded(child: Divider(color: Color(0x33FFFFFF), thickness: 1)),
    ]);
  }
}

class _Wordmark extends StatelessWidget {
  const _Wordmark();
  @override
  Widget build(BuildContext context) {
    return RichText(
      textAlign: TextAlign.center,
      text: const TextSpan(
        style: TextStyle(fontSize: 40, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic),
        children: [
          TextSpan(text: 'CAPA', style: TextStyle(color: Brand.crimson)),
          TextSpan(text: ' CONTEST', style: TextStyle(color: Brand.textPri)),
        ],
      ),
    );
  }
}
