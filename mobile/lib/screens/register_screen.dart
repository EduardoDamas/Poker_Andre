import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/auth_api.dart';
import '../config.dart';
import '../theme.dart';
import '../util/date_br.dart';
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
  final _password = TextEditingController();
  bool _busy = false;
  bool _accepted = false;
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
    final password = _password.text;

    if (phone.isEmpty || name.isEmpty || cpf.isEmpty || birth.isEmpty || password.isEmpty) {
      setState(() => _error = 'Preencha todos os campos.');
      return;
    }
    if (password.length < 6) {
      setState(() => _error = 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (!_accepted) {
      setState(() => _error = 'É preciso aceitar os Termos de Uso e a Política de Privacidade.');
      return;
    }

    // User types DD/MM/AAAA; the API expects ISO (AAAA-MM-DD).
    final isoBirth = brDateToIso(birth);
    if (isoBirth == null) {
      setState(() => _error = 'Data de nascimento inválida. Use DD/MM/AAAA.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    try {
      await widget.api.register(
        phone: phone,
        displayName: name,
        cpf: cpf,
        birthDate: isoBirth,
        password: password,
        acceptedTerms: _accepted,
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
                  Image.asset('assets/brand/logo-symbol.png',
                      height: 72,
                      errorBuilder: (_, _, _) => const SizedBox(height: 8)),
                  const SizedBox(height: 16),
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
                  _Field(
                    controller: _birth,
                    label: 'Data de nascimento',
                    hint: 'DD/MM/AAAA',
                    type: TextInputType.number,
                    formatters: [BrDateInputFormatter()],
                  ),
                  const SizedBox(height: 8),
                  Text('Formato: DD/MM/AAAA  (ex: 31/01/1990)',
                      style: Brand.micro.copyWith(color: Brand.textTer)),
                  const SizedBox(height: 16),
                  _Field(controller: _password, label: 'Senha', hint: 'mínimo 6 caracteres',
                      obscure: true),
                  const SizedBox(height: 20),
                  _TermsConsent(
                    accepted: _accepted,
                    onChanged: (v) => setState(() => _accepted = v),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(_error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Brand.danger)),
                  ],
                  const SizedBox(height: 28),
                  GradientButton('Criar conta',
                      key: const Key('createAccountBtn'), busy: _busy, onPressed: _register),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Consent to the Termos + Privacidade, with the documents one tap away — the
/// acceptance is recorded with its date and version on the server.
class _TermsConsent extends StatelessWidget {
  final bool accepted;
  final ValueChanged<bool> onChanged;
  const _TermsConsent({required this.accepted, required this.onChanged});

  Future<void> _open(BuildContext context, String path) async {
    final uri = Uri.parse('${AppConfig.apiBase}/legal/$path');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Não foi possível abrir o documento.')));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Não foi possível abrir o documento.')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final link = Brand.caption.copyWith(color: Brand.gold, decoration: TextDecoration.underline);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Checkbox(
        key: const Key('termsCheckbox'),
        value: accepted,
        onChanged: (v) => onChanged(v ?? false),
        activeColor: Brand.crimson,
        side: const BorderSide(color: Brand.textTer),
      ),
      Expanded(
        child: Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text.rich(
            TextSpan(style: Brand.caption, children: [
              const TextSpan(text: 'Declaro ter 18 anos ou mais e aceito os '),
              TextSpan(
                text: 'Termos de Uso',
                style: link,
                recognizer: TapGestureRecognizer()..onTap = () => _open(context, 'termos'),
              ),
              const TextSpan(text: ', a '),
              TextSpan(
                text: 'Política de Privacidade',
                style: link,
                recognizer: TapGestureRecognizer()..onTap = () => _open(context, 'privacidade'),
              ),
              const TextSpan(text: ' e o '),
              TextSpan(
                text: 'Regulamento dos Torneios',
                style: link,
                recognizer: TapGestureRecognizer()..onTap = () => _open(context, 'regulamento'),
              ),
              const TextSpan(text: '.'),
            ]),
          ),
        ),
      ),
    ]);
  }
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final TextInputType type;
  final List<TextInputFormatter>? formatters;
  final bool obscure;
  const _Field({
    required this.controller,
    required this.label,
    this.hint = '',
    this.type = TextInputType.text,
    this.formatters,
    this.obscure = false,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: type,
      inputFormatters: formatters,
      obscureText: obscure,
      style: Brand.label,
      decoration: InputDecoration(labelText: label, hintText: hint),
    );
  }
}
