import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:capa_contest/theme.dart';
import 'package:capa_contest/widgets/waiting_panel.dart';

/// Plain text of a (possibly rich) Text widget found by key.
String textAt(WidgetTester tester, Key key) {
  final widget = tester.widget<Text>(find.byKey(key));
  return widget.data ?? widget.textSpan!.toPlainText();
}

/// The still "waiting for the room to fill" panel the client asked for.
void main() {
  Widget panelWith({
    int seated = 6,
    int needed = 8,
    DateTime? startsAt,
    String room = 'Nível 1 · Sala de Torneio',
  }) =>
      MaterialApp(
        theme: buildCapaTheme(),
        home: Scaffold(
          body: WaitingPanel(
            roomName: room,
            seated: seated,
            needed: needed,
            startsAt: startsAt,
          ),
        ),
      );

  testWidgets('names the room and how many players are missing', (tester) async {
    await tester.pumpWidget(panelWith(seated: 6, needed: 8));

    expect(find.text('Nível 1 · Sala de Torneio'), findsOneWidget);
    expect(textAt(tester, const Key('waitingMissing')), 'Faltam 2 participantes');
    expect(find.text('Na sala: 6 de 8'), findsOneWidget);
  });

  testWidgets('uses the singular for a single missing player', (tester) async {
    await tester.pumpWidget(panelWith(seated: 7, needed: 8));
    expect(textAt(tester, const Key('waitingMissing')), 'Faltam 1 participante');
  });

  testWidgets('says the room is full once nobody is missing', (tester) async {
    await tester.pumpWidget(panelWith(seated: 8, needed: 8));

    expect(find.text('Sala completa'), findsOneWidget);
    expect(find.text('O torneio começa em instantes'), findsOneWidget);
    expect(find.byKey(const Key('waitingMissing')), findsNothing);
  });

  testWidgets('hides the estimate until the server provides a start time', (tester) async {
    await tester.pumpWidget(panelWith());

    expect(find.byKey(const Key('waitingEstimate')), findsNothing);
    expect(find.text('Tempo estimado'), findsNothing);
    expect(find.text('Tempo de espera'), findsOneWidget);
  });

  testWidgets('shows the estimate when the next window is known', (tester) async {
    await tester.pumpWidget(
        panelWith(startsAt: DateTime.now().add(const Duration(minutes: 3, seconds: 8))));

    expect(find.byKey(const Key('waitingEstimate')), findsOneWidget);
    expect(find.text('03:08'), findsOneWidget);
  });

  testWidgets('counts the wait up second by second', (tester) async {
    await tester.pumpWidget(panelWith());
    expect(find.text('00:00'), findsOneWidget);

    await tester.pump(const Duration(seconds: 1));
    expect(find.text('00:01'), findsOneWidget);

    await tester.pump(const Duration(seconds: 64));
    expect(find.text('01:05'), findsOneWidget);
  });

  testWidgets('offers the invite button', (tester) async {
    await tester.pumpWidget(panelWith());
    expect(find.byKey(const Key('inviteFriendsBtn')), findsOneWidget);
    expect(find.text('CONVIDAR AMIGOS'), findsOneWidget);
  });

  testWidgets('is still: no animated widgets in the panel', (tester) async {
    await tester.pumpWidget(panelWith());

    // The client asked for a calm message — no spinners, nothing looping.
    Finder inPanel(Type t) =>
        find.descendant(of: find.byType(WaitingPanel), matching: find.byType(t));
    expect(inPanel(CircularProgressIndicator), findsNothing);
    expect(inPanel(LinearProgressIndicator), findsNothing);
    expect(inPanel(AnimatedContainer), findsNothing);
    expect(inPanel(AnimatedOpacity), findsNothing);
  });
}
