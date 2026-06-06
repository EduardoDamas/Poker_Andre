import 'package:flutter/material.dart';
import '../api/auth_api.dart';
import '../theme.dart';
import '../widgets/premium.dart';
import 'login_screen.dart';

/// New-account registration: phone, name, CPF, birthdate.
/// On success navigates back to LoginScreen with the phone pre-filled.
class RegisterScreen extends StatefulWidget {
  final AuthApi api;
  final String initialPhone;
  const RegisterScreen({super.key, required this.api, this.initialPhone = ''});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _phone = TextEditingController();
  final _name = TextEditingController();
  final _cpf = TextEditingController();
  final _birth = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _phone.text = widget.initialPhone;
  }

  Future<void> _register() async {
    final phone = _phone.text.trim();
    final name = _name.text.trim();
    final cpf = _cpf.text.trim();
    final birth = _birth.text.trim();

    if (phone.isEmpty || name.isEmpty || cpf.isEmpty || birth.isEmpty) {
      setState(() => _error = 'Preencha todos os campos.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    try {
      await widget.api.register(
        phone: phone,
        displayName: name,
        cpf: cpf,
        birthDate: birth,
      );
      if (!mounted) return;
      // Go back to login with phone pre-filled so they can request OTP.
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => LoginScreen(api: widget.api, initialPhone: phone),
        ),
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
      appBar: AppBar(
        leading: const BackButton(color: Brand.textPri),
        title: Text('Criar conta', style: Brand.h3),
      ),
      body: Container(
        decoration: const BoxDecoration(gradient: Brand.obsidianGrad),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Cadastro', style: Brand.h2, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text('Preencha seus dados para criar sua conta.',
                      style: Brand.caption, textAlign: TextAlign.center),
                  const SizedBox(height: 36),
                  _Field(controller: _phone, label: 'Telefone', hint: '+5511999998888',
                      type: TextInputType.phone),
                  const SizedBox(height: 16),
                  _Field(controller: _name, label: 'Nome completo', hint: 'João Silva'),
                  const SizedBox(height: 16),
                  _Field(controller: _cpf, label: 'CPF', hint: '000.000.000-00',
                      type: TextInputType.number),
                  const SizedBox(height: 16),
                  _Field(controller: _birth, label: 'Data de nascimento', hint: '1990-01-31',
                      type: TextInputType.datetime),
                  const SizedBox(height: 8),
                  Text('Formato: AAAA-MM-DD  (ex: 1990-01-31)',
                      style: Brand.micro.copyWith(color: Brand.textTer)),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(_error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Brand.danger)),
                  ],
                  const SizedBox(height: 28),
                  GradientButton('Criar conta', busy: _busy, onPressed: _register),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final TextInputType type;
  const _Field({
    required this.controller,
    required this.label,
    this.hint = '',
    this.type = TextInputType.text,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: type,
      style: Brand.label,
      decoration: InputDecoration(labelText: label, hintText: hint),
    );
  }
}
