import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

import 'package:capa_contest/theme.dart';
import 'package:capa_contest/util/payment_link.dart';

/// Payment pages (InfinitePay checkout): straight away in the app; in the
/// browser from a tap on "Abrir pagamento", in a new tab, so iPhone Safari
/// doesn't block it and the app stays open (2026-10).
class _FakeLauncher extends UrlLauncherPlatform with MockPlatformInterfaceMixin {
  final opened = <(String, String?)>[];
  bool result = true;

  @override
  LinkDelegate? get linkDelegate => null;

  @override
  Future<bool> canLaunch(String url) async => true;

  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    opened.add((url, options.webOnlyWindowName));
    return result;
  }
}

void main() {
  late _FakeLauncher launcher;
  const url = 'https://checkout.infinitepay.io/x/abc';

  setUp(() {
    launcher = _FakeLauncher();
    UrlLauncherPlatform.instance = launcher;
  });
  tearDown(() => paymentLinkWebOverride = null);

  Future<bool?> run(WidgetTester tester, {String? message}) async {
    bool? result;
    await tester.pumpWidget(MaterialApp(
      theme: buildCapaTheme(),
      home: Builder(
        builder: (context) => Center(
          child: TextButton(
            key: const Key('pay'),
            onPressed: () async => result = await openPaymentPage(context, url, title: 'Depósito', message: message),
            child: const Text('Pagar'),
          ),
        ),
      ),
    ));
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    return result;
  }

  testWidgets('in the app: opens straight away, no extra step', (tester) async {
    paymentLinkWebOverride = false;
    final ok = await run(tester);
    expect(ok, isTrue);
    expect(launcher.opened.single.$1, url);
    expect(find.text('Abrir pagamento'), findsNothing);
  });

  testWidgets('in the browser: nothing opens until "Abrir pagamento" is tapped, then a new tab', (tester) async {
    paymentLinkWebOverride = true;
    await run(tester, message: 'Seu plano é liberado após a confirmação.');
    expect(launcher.opened, isEmpty);
    expect(find.text('Seu plano é liberado após a confirmação.', findRichText: true), findsNothing);
    expect(find.textContaining('Seu plano é liberado'), findsOneWidget);
    expect(find.textContaining('nova aba'), findsOneWidget);

    await tester.tap(find.byKey(const Key('openPaymentBtn')));
    await tester.pumpAndSettle();
    expect(launcher.opened.single, (url, '_blank'));
    expect(find.text('Abrir pagamento'), findsNothing); // dialog closed
  });

  testWidgets('in the browser: Cancelar opens nothing and reports no failure', (tester) async {
    paymentLinkWebOverride = true;
    bool? result;
    await tester.pumpWidget(MaterialApp(
      theme: buildCapaTheme(),
      home: Builder(
        builder: (context) => TextButton(
          key: const Key('pay'),
          onPressed: () async => result = await openPaymentPage(context, url),
          child: const Text('Pagar'),
        ),
      ),
    ));
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(launcher.opened, isEmpty);
    expect(result, isTrue);
  });

  testWidgets('in the browser: a blocked tab is reported', (tester) async {
    paymentLinkWebOverride = true;
    launcher.result = false;
    bool? result;
    await tester.pumpWidget(MaterialApp(
      theme: buildCapaTheme(),
      home: Builder(
        builder: (context) => TextButton(
          key: const Key('pay'),
          onPressed: () async => result = await openPaymentPage(context, url),
          child: const Text('Pagar'),
        ),
      ),
    ));
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openPaymentBtn')));
    await tester.pumpAndSettle();
    expect(result, isFalse);
  });
}
