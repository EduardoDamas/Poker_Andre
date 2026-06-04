/// Format integer cents as Brazilian currency, e.g. 100000 -> "R$ 1.000,00".
String brl(int cents) {
  final negative = cents < 0;
  final v = cents.abs();
  final reais = (v ~/ 100).toString();
  final ct = (v % 100).toString().padLeft(2, '0');
  // Thousands separator with dots.
  final buf = StringBuffer();
  for (var i = 0; i < reais.length; i++) {
    if (i > 0 && (reais.length - i) % 3 == 0) buf.write('.');
    buf.write(reais[i]);
  }
  return '${negative ? '-' : ''}R\$ $buf,$ct';
}
