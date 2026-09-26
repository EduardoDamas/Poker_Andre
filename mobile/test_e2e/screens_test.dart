// Renders the promotion's key screens at phone size, with real fonts, to PNG
// files for a human look (layout, wording, overflow). Not assertions on pixels.
//
//   flutter test test_e2e/screens_test.dart --dart-define=SHOTS_DIR=C:/tmp/shots
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/api/tables_api.dart';
import 'package:capa_contest/game/game_connection.dart';
import 'package:capa_contest/game/game_snapshot.dart';
import 'package:capa_contest/screens/lobby_screen.dart';
import 'package:capa_contest/screens/table_screen.dart';
import 'package:capa_contest/theme.dart';

const shotsDir = String.fromEnvironment('SHOTS_DIR', defaultValue: 'build/shots');
const fontsDir = 'C:/flutter/bin/cache/artifacts/material_fonts';

class FakeConnection implements GameConnection {
  final _ctrl = StreamController<GameSnapshot>.broadcast();
  final GameSnapshot _snap;
  FakeConnection(this._snap);
  @override
  Stream<GameSnapshot> get stream => _ctrl.stream;
  @override
  GameSnapshot get current => _snap;
  @override
  void act(String type, {int? amount}) {}
  @override
  Future<void> leaveTable() async {}
  @override
  void dispose() => _ctrl.close();
}

Future<void> loadFonts() async {
  Future<ByteData> font(String f) async => ByteData.view((await File('$fontsDir/$f').readAsBytes()).buffer);
  final roboto = FontLoader('Roboto');
  for (final f in ['roboto-regular.ttf', 'roboto-medium.ttf', 'roboto-bold.ttf', 'roboto-black.ttf', 'roboto-italic.ttf']) {
    roboto.addFont(font(f));
  }
  await roboto.load();
  final icons = FontLoader('MaterialIcons')..addFont(font('materialicons-regular.otf'));
  await icons.load();
}

final _key = GlobalKey();

Future<void> shot(WidgetTester tester, String name) async {
  await tester.pump(const Duration(milliseconds: 100));
  await tester.runAsync(() async {
    final boundary = _key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('$shotsDir/$name.png')..createSync(recursive: true);
    file.writeAsBytesSync(png!.buffer.asUint8List());
  });
}

Future<void> precache(WidgetTester tester) async {
  await tester.runAsync(() async {
    final ctx = _key.currentContext!;
    for (final a in [
      'assets/table/tbl-crimson-base.webp',
      'assets/characters/avatars/chr-avatar-default.png',
    ]) {
      await precacheImage(AssetImage(a), ctx);
    }
  });
}

Widget app(Widget home) => RepaintBoundary(
      key: _key,
      child: MaterialApp(debugShowCheckedModeBanner: false, theme: buildCapaTheme(), home: home),
    );

void main() {
  setUpAll(loadFonts);

  void phone(WidgetTester tester) {
    tester.view.physicalSize = const Size(1080, 2340); // 360×780 dp
    tester.view.devicePixelRatio = 3.0;
  }

  Future<void> table(WidgetTester tester, String name, GameSnapshot s) async {
    phone(tester);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(app(TableScreen(connection: FakeConnection(s), title: 'Nível 0 — GRÁTIS · qua 07/10 19:30')));
    await precache(tester);
    await tester.pump();
    await shot(tester, name);
    await tester.pumpWidget(const SizedBox()); // stop the screen's clocks
  }

  final seats10 = [
    for (var i = 0; i < 10; i++) SeatInfo(position: i, userId: 'p$i', hasCards: true, isMe: i == 0),
  ];

  testWidgets('01 lobby: the promotion announced', (tester) async {
    phone(tester);
    addTearDown(tester.view.reset);
    final mock = MockClient((req) async {
      if (req.url.path == '/auth/me') {
        return http.Response(jsonEncode({'balanceCents': '0', 'displayName': 'Maria'}), 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }
      if (req.url.path == '/tables') {
        return http.Response(
          jsonEncode([
            {'id': 'promo-e1', 'name': 'Nível 0 — GRÁTIS · qua 07/10 19:30', 'level': 0, 'entryCents': 0, 'maxSeats': 100, 'players': 37},
            for (var l = 1; l <= 7; l++)
              {'id': 'poker-l$l', 'name': 'Poker — Nível $l', 'level': l, 'entryCents': [2000, 4000, 10000, 20000, 100000, 200000, 1000000][l - 1], 'maxSeats': 8, 'players': l == 1 ? 3 : 0},
          ]),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response('[]', 200, headers: {'content-type': 'application/json'});
    });
    await tester.pumpWidget(app(LobbyScreen(
      session: AuthSession(accessToken: 't', userId: 'u1', displayName: 'Maria'),
      api: TablesApi(client: mock),
      authApi: AuthApi(client: mock),
    )));
    await tester.pumpAndSettle();
    await shot(tester, '01-lobby');
  });

  testWidgets('02 waiting room', (tester) async {
    final start = DateTime.now().add(const Duration(minutes: 18));
    await table(tester, '02-sala-de-espera', GameSnapshot(
      status: ConnStatus.connected,
      lobby: PromoLobby(registered: 64, minPlayers: 80, maxPlayers: 100, startsAt: start,
          startAnywayAt: start.add(const Duration(minutes: 30))),
    ));
  });

  testWidgets('03 my turn at a first-round table of 10', (tester) async {
    await table(tester, '03-minha-vez', GameSnapshot(
      status: ConnStatus.connected, stage: 'Rodada 1', street: 'flop', board: const ['As', 'Kd', '7h'],
      holeCards: const ['Qs', 'Qh'], maxSeats: 10, seats: seats10, actingPlayerId: 'p0', isMyTurn: true,
      legalActions: const ['fold', 'call', 'raise'], turnDeadline: DateTime.now().add(const Duration(seconds: 24)),
    ));
  });

  testWidgets('04 won my table, waiting for the others', (tester) async {
    await table(tester, '04-venceu-a-mesa', const GameSnapshot(
      status: ConnStatus.connected, stage: 'Rodada 1', street: 'complete', handComplete: true,
      resultText: 'Você venceu sua mesa! 🎉', maxSeats: 10,
      notice: 'Você venceu sua mesa! 🎉\nAguardando 3 mesas terminarem…',
    ));
  });

  testWidgets('05 eliminated', (tester) async {
    await table(tester, '05-eliminado', GameSnapshot(
      status: ConnStatus.connected, stage: 'Rodada 1', out: true, maxSeats: 10, seats: seats10,
      notice: 'Você foi eliminado.\nVocê ficou em 37º lugar entre 94.\nObrigado por participar!',
    ));
  });

  testWidgets('06 champion at the final table', (tester) async {
    await table(tester, '06-campeao', GameSnapshot(
      status: ConnStatus.connected, stage: 'Mesa final', street: 'complete', handComplete: true, finished: true,
      board: const ['As', 'Kd', '7h', '2c', '9s'], holeCards: const ['Ah', 'Ac'], maxSeats: 10, seats: seats10,
      resultText: 'Você venceu o torneio! 🏆\nVocê receberá o prêmio via Pix em até 24h.', prizeCents: 50000,
    ));
  });

  testWidgets('07 reconnecting', (tester) async {
    await table(tester, '07-reconectando', const GameSnapshot(
      status: ConnStatus.connecting, error: 'Conexão perdida. Reconectando…',
    ));
  });

  testWidgets('08 too early', (tester) async {
    await table(tester, '08-cedo-demais', const GameSnapshot(
      status: ConnStatus.error,
      error: 'A sala do torneio abre às 19:00 e o torneio começa quarta-feira, 07/10 às 19:30. Volte nesse horário!',
    ));
  });

  testWidgets('09 back during the tournament asks first', (tester) async {
    phone(tester);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(app(Builder(builder: (ctx) {
      return Scaffold(
        body: Center(
          child: TextButton(
            key: const Key('open'),
            onPressed: () => Navigator.push(ctx, MaterialPageRoute(builder: (_) => TableScreen(
                  connection: FakeConnection(GameSnapshot(
                    status: ConnStatus.connected, stage: 'Rodada 1', holeCards: const ['Qs', 'Qh'],
                    maxSeats: 10, seats: seats10,
                  )),
                  title: 'Nível 0 — GRÁTIS · qua 07/10 19:30',
                ))),
            child: const Text('open'),
          ),
        ),
      );
    })));
    await tester.tap(find.byKey(const Key('open')));
    await tester.pumpAndSettle();
    await precache(tester);
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    await shot(tester, '09-sair-pergunta');
  });
}
