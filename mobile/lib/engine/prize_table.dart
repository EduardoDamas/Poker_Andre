// Prize by room occupancy — Dart port of backend/src/poker/prize-table.ts
// (real CAPACONTEST.pdf values). Prize = multiplier(occupancy) × entry (V.I.).

class _Tier {
  final double minOccupancy;
  final int multiplier;
  const _Tier(this.minOccupancy, this.multiplier);
}

// % of tables occupied → multiplier of V.I. (100%→200 … 10-19%→20, <10%→0).
const _tiers = [
  _Tier(0.0, 0),
  _Tier(0.1, 20),
  _Tier(0.2, 40),
  _Tier(0.3, 60),
  _Tier(0.4, 80),
  _Tier(0.5, 100),
  _Tier(0.6, 120),
  _Tier(0.7, 140),
  _Tier(0.8, 160),
  _Tier(0.9, 180),
  _Tier(1.0, 200),
];

int multiplierFor(double occupancy) {
  var m = 0;
  for (final t in _tiers) {
    if (occupancy >= t.minOccupancy) {
      m = t.multiplier;
    } else {
      break;
    }
  }
  return m;
}

/// Winner's prize in cents: multiplier(occupancy) × entry value (V.I.).
int prizeCentsFor(int entryCents, double occupancy) =>
    multiplierFor(occupancy) * entryCents;
