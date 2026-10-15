import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme.dart';

/// Forces the browser path in tests (where kIsWeb is false).
@visibleForTesting
bool? paymentLinkWebOverride;

/// Running in a browser (where payment pages open from a tap in a dialog).
bool get paymentsInBrowser => paymentLinkWebOverride ?? kIsWeb;

/// Opens a payment page (InfinitePay checkout) that the server just created.
///
/// In the app it opens straight away. In the browser it first shows a short
/// "Abrir pagamento" step: Safari on iPhone blocks a new tab opened after a
/// server call, but allows one opened by a tap — and the app stays in its own
/// tab, so the player comes back to it after paying.
///
/// Returns false if the page could not be opened (the caller says so).
Future<bool> openPaymentPage(
  BuildContext context,
  String url, {
  String title = 'Pagamento pronto',
  String? message,
}) async {
  final uri = Uri.parse(url);
  if (!paymentsInBrowser) {
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }
  final opened = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: Brand.surface,
      title: Text(title, style: Brand.h3),
      content: Text(
        '${message == null ? '' : '$message\n\n'}'
        'O pagamento abre numa nova aba, na página segura da InfinitePay. '
        'Depois de pagar, é só voltar para esta aba.',
        style: Brand.body,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
        TextButton(
          key: const Key('openPaymentBtn'),
          onPressed: () async {
            // Called inside the tap, so the browser treats it as the
            // player's own action and lets the new tab open.
            var ok = false;
            try {
              ok = await launchUrl(uri, webOnlyWindowName: '_blank');
            } catch (_) {}
            if (ctx.mounted) Navigator.pop(ctx, ok);
          },
          child: const Text('Abrir pagamento', style: TextStyle(color: Brand.gold, fontWeight: FontWeight.w800)),
        ),
      ],
    ),
  );
  return opened ?? true; // closed with Cancelar / outside: nothing to report
}
