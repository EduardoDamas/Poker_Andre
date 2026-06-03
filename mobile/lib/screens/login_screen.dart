import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../api/tables_api.dart';
import '../theme.dart';
import 'lobby_screen.dart';

/// Phone-OTP login. Two steps: enter phone → request code; enter code → verify.
class LoginScreen extends StatefulWidget {
  final AuthApi api;
  /// Optional, passed through to the lobby (injectable for tests).
  final TablesApi? tablesApi;
  const LoginScreen({super.key, required this.api, this.tablesApi});

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

  Future<void> _sendCode() async {
    setState(() {
      _busy = true;
      _error = null;
    });
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
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = await widget.api.verifyOtp(_phone.text.trim(), _code.text.trim());
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => LobbyScreen(session: session, api: widget.tablesApi)),
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
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _Wordmark(),
                const SizedBox(height: 8),
                const Text(
                  'Torneios Digitais de Cartas e Tabuleiro',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Brand.gray),
                ),
                const SizedBox(height: 40),
                if (_step == _Step.phone) ...[
                  TextField(
                    key: const Key('phoneField'),
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    style: const TextStyle(color: Brand.white),
                    decoration: const InputDecoration(
                      labelText: 'Telefone',
                      hintText: '+55 11 99999-8888',
                    ),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    key: const Key('sendCodeBtn'),
                    onPressed: _busy ? null : _sendCode,
                    child: _busy ? const _Spinner() : const Text('Enviar código'),
                  ),
                ] else ...[
                  Text(
                    'Código enviado para ${_phone.text.trim()}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Brand.gray),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    key: const Key('codeField'),
                    controller: _code,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    style: const TextStyle(color: Brand.white, letterSpacing: 8),
                    textAlign: TextAlign.center,
                    decoration: const InputDecoration(labelText: 'Código (6 dígitos)'),
                  ),
                  ElevatedButton(
                    key: const Key('verifyBtn'),
                    onPressed: _busy ? null : _verify,
                    child: _busy ? const _Spinner() : const Text('Entrar'),
                  ),
                  TextButton(
                    onPressed: _busy ? null : () => setState(() => _step = _Step.phone),
                    child: const Text('Trocar número', style: TextStyle(color: Brand.gray)),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    key: const Key('errorText'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Brand.redBright),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
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
          TextSpan(text: 'CAPA', style: TextStyle(color: Brand.red)),
          TextSpan(text: ' CONTEST', style: TextStyle(color: Brand.white)),
        ],
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();
  @override
  Widget build(BuildContext context) => const SizedBox(
        height: 22,
        width: 22,
        child: CircularProgressIndicator(strokeWidth: 2, color: Brand.white),
      );
}
