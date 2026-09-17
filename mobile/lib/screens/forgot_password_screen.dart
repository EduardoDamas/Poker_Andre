import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../api/tables_api.dart';
import '../theme.dart';
import '../widgets/premium.dart';
import 'lobby_screen.dart';

/// Esqueci minha senha — a code sent to the player's phone sets a new password.
/// Two steps in one screen: ask for the code, then type it with the new password.
class ForgotPasswordScreen extends StatefulWidget {
  final AuthApi api;
  final TablesApi? tablesApi;
  final String initialPhone;
  const ForgotPasswordScreen({
    super.key,
    required this.api,
    this.tablesApi,
    this.initialPhone = '',
  });

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _error;
  String? _info;

  @override
  void initState() {
    super.initState();
    _phone.text = widget.initialPhone;
  }

  Future<void> _sendCode() async {
    final phone = _phone.text.trim();
    if (phone.isEmpty) {
      setState(() => _error = 'Informe seu telefone.');
      return;
    }
    setState(() { _busy = true; _error = null; _info = null; });
    try {
      await widget.api.requestPasswordReset(phone);
      if (!mounted) return;
      setState(() {
        _codeSent = true;
        _info = 'Se o número estiver cadastrado, enviamos um código de 6 dígitos.';
      });
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    final phone = _phone.text.trim();
    final code = _code.text.trim();
    final password = _password.text;
    if (code.isEmpty || password.isEmpty) {
      setState(() => _error = 'Informe o código e a nova senha.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final session = await widget.api.resetPassword(phone, code, password);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => LobbyScreen(
          session: session,
          api: widget.tablesApi ?? TablesApi(),
          authApi: widget.api,
        ),
      ));
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recuperar senha')),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(
                'Enviamos um código para o seu telefone. Com ele você define uma nova senha.',
                style: Brand.body,
              ),
              const SizedBox(height: 24),
              TextField(
                key: const Key('forgotPhoneField'),
                controller: _phone,
                enabled: !_codeSent,
                keyboardType: TextInputType.phone,
                style: Brand.label,
                decoration: const InputDecoration(
                    labelText: 'Telefone', hintText: '+5511999998888'),
              ),
              const SizedBox(height: 16),
              if (!_codeSent)
                GradientButton('Enviar código',
                    key: const Key('sendCodeBtn'), busy: _busy, onPressed: _sendCode)
              else ...[
                TextField(
                  key: const Key('codeField'),
                  controller: _code,
                  keyboardType: TextInputType.number,
                  style: Brand.label,
                  decoration: const InputDecoration(labelText: 'Código de 6 dígitos'),
                ),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('newPasswordField'),
                  controller: _password,
                  obscureText: true,
                  style: Brand.label,
                  onSubmitted: (_) => _busy ? null : _reset(),
                  decoration: const InputDecoration(labelText: 'Nova senha'),
                ),
                const SizedBox(height: 16),
                GradientButton('Salvar nova senha',
                    key: const Key('resetBtn'), busy: _busy, onPressed: _reset),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: _busy ? null : _sendCode,
                  child: Text('Reenviar código', style: Brand.caption.copyWith(color: Brand.gold)),
                ),
              ],
              if (_info != null) ...[
                const SizedBox(height: 16),
                Text(_info!, key: const Key('infoText'), style: Brand.caption),
              ],
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!,
                    key: const Key('forgotErrorText'),
                    style: Brand.caption.copyWith(color: Brand.danger)),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}
