import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:capa_contest/api/points_api.dart';
import 'package:capa_contest/format.dart';
import 'package:capa_contest/theme.dart';
import 'package:capa_contest/widgets/lucky_wheel.dart';

/// Daily wheel on a 360dp-wide phone (the most common Android width, and
/// BlueStacks' default): the whole wheel fits, and prizes read like the wheel.
void main() {
  final segments = [
    for (final p in [0, 100, 200, 500, 1000, 2000, 10000])
      WheelSegmentInfo(label: p == 0 ? 'Nada' : pts(p), freePoints: p, paidPoints: 0),
    for (final p in [5, 10, 20, 50]) WheelSegmentInfo(label: '$p P', freePoints: 0, paidPoints: p),
  ];

  Future<void> open(WidgetTester tester, Future<SpinOutcome> Function() spin) async {
    tester.view.physicalSize = const Size(540, 960);
    tester.view.devicePixelRatio = 1.5;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      theme: buildCapaTheme(),
      home: Builder(
        builder: (ctx) => Scaffold(
          body: TextButton(
            onPressed: () => showLuckyWheel(ctx, segments: segments, spin: spin),
            child: const Text('abrir'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
  }

  testWidgets('the wheel is not cut off at 360dp', (tester) async {
    await open(tester, () async => throw Exception('x'));
    final box = tester.getRect(find.byKey(const Key('wheelBox')));
    final wheel = tester.getRect(find.byKey(const Key('wheelPaint')));
    expect(wheel.left, greaterThanOrEqualTo(box.left - 0.5));
    expect(wheel.right, lessThanOrEqualTo(box.right + 0.5));
    expect(wheel.width, greaterThan(200)); // scaled, not shrunk to nothing
    expect(tester.takeException(), isNull);
  });

  testWidgets('the prize uses thousands dots, like the wheel', (tester) async {
    await open(
        tester,
        () async => SpinOutcome(
              segmentIndex: 5,
              freePoints: 2000,
              paidPoints: 0,
              streakDays: 30,
              milestone: PointsMilestone(days: 30, freePoints: 50000, paidPoints: 0),
            ));
    await tester.tap(find.text('Girar'));
    await tester.pumpAndSettle();
    expect(find.text('+2.000 pontos grátis!'), findsOneWidget);
    expect(find.textContaining('+50.000 pontos grátis'), findsOneWidget);
    expect(tester.takeException(), isNull); // no overflow with the bonus line
    await tester.ensureVisible(find.text('Receber'));
    await tester.tap(find.text('Receber'));
    await tester.pumpAndSettle();
    expect(find.text('Roleta Diária'), findsNothing);
  });
}
