// End-to-end test of the app against a real server.
//
// Every player here is the app's own code — AuthApi (register, login, password
// reset, deposit), TablesApi (lobby), PaymentsApi, LimitsApi and
// SocketGameConnection with its GameEvents — talking HTTP and Socket.IO to a
// running backend. Assertions are on what the app would show (GameSnapshot).
// A TCP relay in the test cuts some phones' connections to test network loss.
//
// Needs a server with short timings (see docs/E2E.md):
//   flutter test test_e2e/app_e2e_test.dart --dart-define=E2E_API=http://127.0.0.1:3300
//
// Not part of `flutter test` (it lives outside test/): it needs that server.
@Timeout(Duration(minutes: 5))
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:capa_contest/api/auth_api.dart';
import 'package:capa_contest/api/limits_api.dart';
import 'package:capa_contest/api/payments_api.dart';
import 'package:capa_contest/api/tables_api.dart';
import 'package:capa_contest/game/game_connection.dart';
import 'package:capa_contest/game/game_snapshot.dart';

const base = String.fromEnvironment('E2E_API', defaultValue: 'http://127.0.0.1:3300');
final serverPort = Uri.parse(base).port;

final auth = AuthApi(baseUrl: base);
final tables = TablesApi(baseUrl: base);
final payments = PaymentsApi(baseUrl: base);
final limits = LimitsApi(baseUrl: base);

// ---------------------------------------------------------------------------
// Accounts — created exactly as the app does: register, then log in.

final _rnd = Random();
final _run = DateTime.now().millisecondsSinceEpoch % 10000;
var _seq = 0;
const password = 'segredo123';

String _cpf() {
  while (true) {
    final d = List.generate(9, (_) => _rnd.nextInt(10));
    if (d.toSet().length == 1) continue;
    int dv(List<int> ds) {
      final w = ds.length + 1;
      var s = 0;
      for (var i = 0; i < ds.length; i++) {
        s += ds[i] * (w - i);
      }
      final r = s % 11;
      return r < 2 ? 0 : 11 - r;
    }

    d.add(dv(d));
    d.add(dv(d));
    return d.join();
  }
}

String _phone() {
  _seq += 1;
  return '+55119${_run.toString().padLeft(4, '0')}${_seq.toString().padLeft(4, '0')}';
}

class Player {
  final String phone;
  final AuthSession session;
  Player(this.phone, this.session);
  String get id => session.userId;
  String get token => session.accessToken;
}

Future<Player> newPlayer([String name = 'Jogador E2E']) async {
  final phone = _phone();
  for (var attempt = 0;; attempt++) {
    try {
      await auth.register(
        phone: phone,
        displayName: name,
        cpf: _cpf(),
        birthDate: '1990-05-17',
        password: password,
        acceptedTerms: true,
      );
      break;
    } on AuthException catch (e) {
      if (!e.message.contains('CPF') || attempt > 5) rethrow; // a random CPF collided
    }
  }
  return Player(phone, await auth.login(phone, password));
}

Future<List<Player>> players(int n) async {
  final out = <Player>[];
  // A few at a time: fast, without flooding the server with password hashing.
  for (var i = 0; i < n; i += 10) {
    out.addAll(await Future.wait(List.generate(min(10, n - i), (_) => newPlayer())));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The organizer (admin API, as the panel calls it).

late String adminToken;

Future<dynamic> admin(String method, String path, [Map<String, dynamic>? body]) async {
  final uri = Uri.parse('$base$path');
  final headers = {'Authorization': 'Bearer $adminToken', 'Content-Type': 'application/json'};
  final res = method == 'GET'
      ? await http.get(uri, headers: headers)
      : await http.post(uri, headers: headers, body: jsonEncode(body ?? {}));
  if (res.statusCode >= 300) throw StateError('$method $path → ${res.statusCode} ${res.body}');
  return res.body.isEmpty ? null : jsonDecode(res.body);
}

Future<String> schedule({
  required String name,
  required Duration startsIn,
  int minPlayers = 2,
  int maxPlayers = 100,
  int? waitMinutes = 30,
  int robots = 0,
  int prize = 25000,
  int subscriberPrize = 50000,
}) async {
  final e = await admin('POST', '/admin/promo-events', {
    'name': name,
    'startsAt': DateTime.now().add(startsIn).toUtc().toIso8601String(),
    'prizeCents': prize,
    'prizeSubscriberCents': subscriberPrize,
    'minPlayers': minPlayers,
    'maxPlayers': maxPlayers,
    'waitMinutes': waitMinutes,
    'robots': robots,
  });
  return 'promo-${e['id']}';
}

Future<Map<String, dynamic>> event(String roomId) async {
  final all = (await admin('GET', '/admin/promo-events')) as List;
  return all.cast<Map<String, dynamic>>().firstWhere((e) => 'promo-${e['id']}' == roomId);
}

// ---------------------------------------------------------------------------
// A seat at the table: the app's connection, plus a player who checks or calls
// (or, when afk, never touches the phone).

class Seat {
  final Player player;
  final SocketGameConnection conn;
  final bool afk;
  final List<GameSnapshot> seen = [];
  List<String>? _answered;
  late final StreamSubscription<GameSnapshot> _sub;
  var actions = 0;

  Seat(this.player, String roomId, {this.afk = false, String url = base, int? level = 0, int maxSeats = 100})
      : conn = SocketGameConnection(
          baseUrl: url,
          token: player.token,
          userId: player.id,
          tableId: roomId,
          maxSeats: maxSeats,
          level: level,
        ) {
    _sub = conn.stream.listen(_on);
  }

  void _on(GameSnapshot s) {
    seen.add(s);
    if (afk || !s.isMyTurn || s.legalActions.isEmpty) return;
    // One answer per decision: a new game:state brings a new list.
    if (identical(s.legalActions, _answered)) return;
    _answered = s.legalActions;
    final a = s.legalActions;
    actions += 1;
    conn.act(a.contains('check') ? 'check' : a.contains('call') ? 'call' : 'fold');
  }

  GameSnapshot get now => conn.current;

  Future<GameSnapshot> until(bool Function(GameSnapshot) test, {Duration timeout = const Duration(seconds: 90)}) {
    if (test(conn.current)) return Future.value(conn.current);
    return conn.stream.firstWhere(test).timeout(timeout);
  }

  bool saw(bool Function(GameSnapshot) test) => seen.any(test);

  Future<void> close() async {
    await _sub.cancel();
    conn.dispose();
  }
}

bool isChampion(GameSnapshot s) => s.resultText?.contains('Você venceu o torneio') ?? false;
bool isOut(GameSnapshot s) => s.out;
bool isOver(GameSnapshot s) => s.finished || s.out;

Future<void> closeAll(Iterable<Seat> seats) => Future.wait(seats.map((s) => s.close()));

// ---------------------------------------------------------------------------
// A TCP relay between a phone and the server, to cut its network.

class Relay {
  final ServerSocket _server;
  final _open = <Socket>[];
  var blocked = false;

  Relay._(this._server) {
    _server.listen((client) async {
      if (blocked) {
        client.destroy();
        return;
      }
      final upstream = await Socket.connect('127.0.0.1', serverPort);
      _open..add(client)..add(upstream);
      client.listen(upstream.add, onDone: upstream.destroy, onError: (_) => upstream.destroy());
      upstream.listen(client.add, onDone: client.destroy, onError: (_) => client.destroy());
    });
  }

  static Future<Relay> start() async => Relay._(await ServerSocket.bind('127.0.0.1', 0));

  String get url => 'http://127.0.0.1:${_server.port}';

  /// The phone loses its connection (it will try to reconnect).
  void drop() {
    for (final s in _open) {
      s.destroy();
    }
    _open.clear();
  }

  Future<void> close() async {
    drop();
    await _server.close();
  }
}

// ---------------------------------------------------------------------------

void main() {
  setUpAll(() async {
    final res = await http.post(Uri.parse('$base/admin/auth/login'),
        headers: {'Content-Type': 'application/json'}, body: jsonEncode({'username': 'e2e', 'password': ''}));
    expect(res.statusCode, anyOf(200, 201), reason: 'local server must run with ADMIN_OPEN=1');
    adminToken = (jsonDecode(res.body) as Map)['accessToken'] as String;
  });

  group('account', () {
    test('register, log in, wrong password, duplicate, forgot password', () async {
      final p = await newPlayer('Maria E2E');
      final me = await auth.fetchMe(p.token);
      expect(me['displayName'], 'Maria E2E');
      expect(await auth.fetchBalance(p.token), 0);

      await expectLater(auth.login(p.phone, 'errada'), throwsA(isA<AuthException>()));
      await expectLater(
        auth.register(
            phone: p.phone, displayName: 'Outra Pessoa', cpf: _cpf(), birthDate: '1990-01-01', password: password, acceptedTerms: true),
        throwsA(predicate((e) => e is AuthException && e.message.contains('telefone'))),
      );

      await auth.requestPasswordReset(p.phone);
      final pending = (await admin('GET', '/admin/otp/pending')) as List;
      final code = pending.cast<Map>().lastWhere((o) => o['phone'] == p.phone)['code'] as String;
      final session = await auth.resetPassword(p.phone, code, 'novaSenha9');
      expect(session.userId, p.id);
      await expectLater(auth.login(p.phone, password), throwsA(isA<AuthException>()));
      expect((await auth.login(p.phone, 'novaSenha9')).userId, p.id);
    });
  });

  group('promotion — before the day', () {
    test('the lobby announces it with its date; joining early says when the room opens', () async {
      final roomId = await schedule(name: 'E2E Anúncio', startsIn: const Duration(days: 2));
      final p = await newPlayer();
      final lobby = await tables.fetchTables(p.token);
      final room = lobby.firstWhere((t) => t.id == roomId);
      expect(room.name, matches(RegExp(r'^E2E Anúncio — GRÁTIS · \S{3} \d\d/\d\d \d\d:\d\d$')));
      expect(room.entryLabel, 'Grátis');
      expect(room.maxSeats, 100);
      expect(lobby.where((t) => t.level > 0), hasLength(7)); // the paid rooms are still there

      final seat = Seat(p, roomId);
      final s = await seat.until((s) => s.status == ConnStatus.error);
      expect(s.error, matches(RegExp(r'^A sala do torneio abre às \d\d:\d\d e o torneio começa .+ às \d\d:\d\d\. Volte nesse horário!$')));
      await seat.close();
      await admin('POST', '/admin/promo-events/${roomId.substring(6)}/cancel');
    });
  });

  group('promotion — the waiting room', () {
    test('counts places, frees a place when someone leaves, starts at its time', () async {
      final ps = await players(6);
      final roomId = await schedule(name: 'E2E Espera', startsIn: const Duration(seconds: 8), minPlayers: 3, maxPlayers: 3);
      final a = Seat(ps[0], roomId);
      final b = Seat(ps[1], roomId);
      await a.until((s) => s.lobby?.registered == 1 || s.lobby?.registered == 2);
      final lobbyAfterTwo = await a.until((s) => s.lobby?.registered == 2);
      expect(lobbyAfterTwo.lobby!.minPlayers, 3);
      expect(lobbyAfterTwo.lobby!.maxPlayers, 3);
      expect(lobbyAfterTwo.stage, isNull);

      // b gives the place back ("Sair" before the start) …
      await b.conn.leaveTable();
      await a.until((s) => s.lobby?.registered == 1);
      // … c and d take the places; a 4th would find them gone.
      final c = Seat(ps[2], roomId);
      final d = Seat(ps[3], roomId);
      await a.until((s) => s.lobby?.registered == 3);
      final e = Seat(ps[4], roomId);
      expect((await e.until((s) => s.status == ConnStatus.error)).error, contains('vagas'));

      // At its time it starts: a single table of 3 is the final table.
      final seated = await a.until((s) => s.holeCards.isNotEmpty, timeout: const Duration(seconds: 20));
      expect(seated.stage, 'Mesa final');
      final late = Seat(ps[5], roomId);
      expect((await late.until((s) => s.status == ConnStatus.error)).error, contains('já começou'));

      final seats = [a, c, d];
      await Future.wait(seats.map((s) => s.until(isOver)));
      final champs = seats.where((s) => s.saw(isChampion)).toList();
      expect(champs, hasLength(1));
      expect(champs.single.saw((s) => s.prizeCents == 25000), isTrue);
      expect(await auth.fetchBalance(champs.single.player.token), 25000);
      await closeAll([a, b, c, d, e, late]);
    });
  });

  group('promotion — the real format', () {
    test('100 phones: 10 tables of 10, winners move to a final table of 10, one champion paid R\$250', () async {
      final ps = await players(100);
      final roomId = await schedule(name: 'E2E 100', startsIn: const Duration(seconds: 15), minPlayers: 100);
      final seats = ps.map((p) => Seat(p, roomId)).toList();
      await Future.wait(seats.map((s) => s.until((s) => s.lobby?.registered == 100, timeout: const Duration(seconds: 60))));

      await Future.wait(seats.map((s) => s.until(isOver, timeout: const Duration(minutes: 8))));

      final champions = seats.where((s) => s.saw(isChampion)).toList();
      expect(champions, hasLength(1), reason: 'exactly one phone is told it won the tournament');
      final champ = champions.single;
      expect(champ.saw((s) => s.prizeCents == 25000), isTrue);
      expect(await auth.fetchBalance(champ.player.token), 25000);

      final finalists = seats.where((s) => s.saw((s) => s.stage == 'Mesa final')).toList();
      expect(finalists, hasLength(10), reason: 'the 10 table winners meet at the final');
      expect(seats.every((s) => s.saw((s) => s.stage == 'Rodada 1')), isTrue);
      for (final f in finalists) {
        expect(f.saw((s) => s.notice?.startsWith('Você venceu sua mesa') ?? false) ||
            f.saw((s) => s.resultText == 'Você venceu sua mesa! 🎉'), isTrue);
      }
      final out = seats.where((s) => s != champ).toList();
      expect(out.every((s) => s.saw(isOut)), isTrue, reason: 'every other phone is told it is out');
      expect(out.every((s) => s.saw((s) => s.notice?.contains('lugar entre 100') ?? false)), isTrue);
      // A table win is never announced as the tournament.
      expect(out.any((s) => s.saw(isChampion)), isFalse);
      // Nobody else was paid.
      for (final s in out.take(10)) {
        expect(await auth.fetchBalance(s.player.token), 0);
      }
      // The turn clock was shown on every table.
      expect(seats.where((s) => s.saw((s) => s.turnDeadline != null)).length, greaterThan(90));
      final e = await event(roomId);
      expect(e['status'], 'PAID');
      expect(e['startedWith'], 100);
      await closeAll(seats);
    }, timeout: const Timeout(Duration(minutes: 12)));
  });

  group('promotion — when things go wrong', () {
    test('AFK, a short network drop, a long one, and someone who quits — it still ends', () async {
      final ps = await players(16);
      final roomId = await schedule(name: 'E2E Falhas', startsIn: const Duration(seconds: 8), minPlayers: 16);
      final shortRelay = await Relay.start();
      final longRelay = await Relay.start();
      final afk = Seat(ps[0], roomId, afk: true);
      final flaky = Seat(ps[1], roomId, url: shortRelay.url);
      final gone = Seat(ps[2], roomId, url: longRelay.url);
      final quitter = Seat(ps[3], roomId);
      final rest = ps.skip(4).map((p) => Seat(p, roomId)).toList();
      final all = [afk, flaky, gone, quitter, ...rest];

      // Everyone dealt in.
      await Future.wait([flaky, gone, quitter].map((s) => s.until((s) => s.holeCards.isNotEmpty, timeout: const Duration(seconds: 30))));

      // A 1-second drop: the app reconnects by itself and keeps its seat.
      shortRelay.drop();
      final seenBefore = flaky.seen.length;
      // Longer than the grace period (3s here, 60s in production): out.
      longRelay.blocked = true;
      longRelay.drop();
      // "Sair da mesa" in the middle of the tournament: a withdrawal.
      await quitter.conn.leaveTable();

      await Future.delayed(const Duration(seconds: 6));
      longRelay.blocked = false;

      await Future.wait([afk, flaky, ...rest].map((s) => s.until(isOver, timeout: const Duration(minutes: 5))));
      expect(all.where((s) => s.saw(isChampion)), hasLength(1));

      // The short drop: back at the table (dealt again, or told how it ended).
      final after = flaky.seen.skip(seenBefore);
      expect(after.any((s) => s.holeCards.isNotEmpty || s.notice != null || s.finished), isTrue,
          reason: 'the reconnected phone kept playing');
      expect(flaky.now.status, isNot(ConnStatus.error));

      // The long drop: when the phone comes back, it is told it is out.
      // While it cannot reconnect, the app says it is reconnecting (not a final error).
      expect(gone.saw((s) => s.status == ConnStatus.connecting && s.error == 'Conexão perdida. Reconectando…'), isTrue);
      final back = await gone.until((s) => (s.error?.contains('eliminado') ?? false) || s.out,
          timeout: const Duration(seconds: 30));
      expect(back.error ?? back.notice, contains('eliminado'));

      // The AFK phone showed the turn clock and was played for.
      expect(afk.saw((s) => s.isMyTurn && s.turnDeadline != null), isTrue);
      await closeAll(all);
      await shortRelay.close();
      await longRelay.close();
    }, timeout: const Timeout(Duration(minutes: 8)));

    test('a player in self-exclusion cannot enter', () async {
      final roomId = await schedule(name: 'E2E Autoexclusão', startsIn: const Duration(minutes: 5));
      final p = await newPlayer();
      await limits.selfExclude(p.token, 7);
      final seat = Seat(p, roomId);
      expect((await seat.until((s) => s.status == ConnStatus.error)).error, contains('autoexclusão'));
      await seat.close();
      await admin('POST', '/admin/promo-events/${roomId.substring(6)}/cancel');
    });
  });

  group('promotion — the subscriber prize', () {
    test('subscribers at the start: the champion gets R\$500', () async {
      final ps = await players(3);
      for (final p in ps) {
        await admin('POST', '/admin/users/${p.id}/subscription', {
          'subscription': 'MONTHLY',
          'untilMs': DateTime.now().add(const Duration(days: 30)).millisecondsSinceEpoch,
        });
      }
      final roomId = await schedule(name: 'E2E Assinantes', startsIn: const Duration(seconds: 4), minPlayers: 3);
      final seats = ps.map((p) => Seat(p, roomId)).toList();
      await Future.wait(seats.map((s) => s.until(isOver)));
      final champ = seats.singleWhere((s) => s.saw(isChampion));
      expect(champ.saw((s) => s.prizeCents == 50000), isTrue);
      expect(await auth.fetchBalance(champ.player.token), 50000);
      await closeAll(seats);
    });

    test('a plan bought in the app before the start and released after it still pays R\$500', () async {
      final ps = await players(4);
      for (final p in ps) {
        await payments.requestSubscription(p.token, 'MONTHLY'); // paid through the fixed link
      }
      final roomId = await schedule(name: 'E2E Plano pendente', startsIn: const Duration(seconds: 4), minPlayers: 4);
      final seats = ps.map((p) => Seat(p, roomId)).toList();
      await seats.first.until((s) => s.stage != null, timeout: const Duration(seconds: 20));
      // Released in the panel only now, after the start.
      final reqs = (await admin('GET', '/admin/subscription-requests?status=REQUESTED')) as List;
      for (final r in reqs.cast<Map>().where((r) => ps.any((p) => p.id == r['userId']))) {
        await admin('POST', '/admin/subscription-requests/${r['id']}/confirm', {'adminNote': 'e2e'});
      }
      await Future.wait(seats.map((s) => s.until(isOver)));
      final champ = seats.singleWhere((s) => s.saw(isChampion));
      final paid = await auth.fetchBalance(champ.player.token);
      expect(paid, 50000, reason: 'plan asked for before the start counts');
      await closeAll(seats);
    });
  });

  group('rehearsal', () {
    test('one phone and 25 robots play every stage; nothing is paid', () async {
      final p = await newPlayer();
      final roomId = await schedule(
          name: 'E2E Ensaio', startsIn: const Duration(seconds: 4), minPlayers: 2, maxPlayers: 30, waitMinutes: 0, robots: 25);
      final lobbyNow = await tables.fetchTables(p.token);
      expect(lobbyNow.any((t) => t.id == roomId), isTrue, reason: 'listed while its room is open');
      final seat = Seat(p, roomId);
      final seated = await seat.until((s) => s.stage != null, timeout: const Duration(seconds: 20));
      expect(seated.stage, 'Rodada 1'); // 26 players → 4 tables
      await seat.until(isOver, timeout: const Duration(minutes: 5));
      // Wait for the whole bracket (the phone may be out early).
      for (var i = 0; i < 120; i++) {
        if ((await event(roomId))['status'] == 'PAID') break;
        await Future.delayed(const Duration(seconds: 1));
      }
      final e = await event(roomId);
      expect(e['status'], 'PAID');
      expect(e['prizePaidCents'], '0');
      expect(e['startedWith'], 26);
      expect(await auth.fetchBalance(p.token), 0);
      await seat.close();
    }, timeout: const Timeout(Duration(minutes: 6)));
  });

  group('paid rooms still work', () {
    test('deposit, confirmed in the panel, play Nível 1 heads-up, the winner is paid', () async {
      final ps = await players(2);
      for (final p in ps) {
        await auth.requestDeposit(p.token, 10000, pixReference: 'e2e-${p.id.substring(0, 8)}');
      }
      final deps = (await admin('GET', '/admin/deposits?status=REQUESTED')) as List;
      for (final d in deps.cast<Map>().where((d) => ps.any((p) => p.id == d['userId']))) {
        await admin('POST', '/admin/deposits/${d['id']}/confirm', {'adminNote': 'e2e'});
      }
      for (final p in ps) {
        expect(await auth.fetchBalance(p.token), 10000);
      }
      final seats = ps.map((p) => Seat(p, 'poker-l1', level: 1, maxSeats: 8)).toList();
      await Future.wait(seats.map((s) => s.until((s) => s.finished)));
      expect(seats.where((s) => s.saw(isChampion)), hasLength(1));
      final balances = [for (final p in ps) await auth.fetchBalance(p.token)];
      balances.sort();
      expect(balances.first, 8000, reason: 'the loser paid the R\$20 entry');
      expect(balances.last, greaterThan(8000), reason: 'the winner got a prize');
      expect(balances.first + balances.last, lessThanOrEqualTo(20000));
      await closeAll(seats);
    });
  });
}
