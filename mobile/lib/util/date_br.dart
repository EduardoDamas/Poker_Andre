import 'package:flutter/services.dart';

/// Brazilian date handling (DD/MM/YYYY) with conversion to/from the ISO format
/// (YYYY-MM-DD) the backend expects.

/// Auto-masking input formatter for a date field: as the user types digits the
/// slashes are inserted automatically, producing `DD/MM/YYYY`. Non-digits are
/// ignored and the input is capped at 8 digits (ddmmyyyy).
class BrDateInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final capped = digits.length > 8 ? digits.substring(0, 8) : digits;

    final buf = StringBuffer();
    for (var i = 0; i < capped.length; i++) {
      if (i == 2 || i == 4) buf.write('/'); // after DD and MM
      buf.write(capped[i]);
    }
    final text = buf.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// True when [s] is a well-formed DD/MM/YYYY date that actually exists
/// (e.g. rejects 31/02/2000).
bool isValidBrDate(String s) {
  final m = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(s.trim());
  if (m == null) return false;
  final day = int.parse(m.group(1)!);
  final month = int.parse(m.group(2)!);
  final year = int.parse(m.group(3)!);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  final d = DateTime(year, month, day);
  // DateTime normalises overflow (e.g. Feb 31 → Mar 3); reject if it shifted.
  return d.year == year && d.month == month && d.day == day;
}

/// Convert a DD/MM/YYYY string to the ISO `YYYY-MM-DD` the API expects.
/// Returns null if the date is not valid.
String? brDateToIso(String s) {
  if (!isValidBrDate(s)) return null;
  final m = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(s.trim())!;
  final day = m.group(1)!;
  final month = m.group(2)!;
  final year = m.group(3)!;
  return '$year-$month-$day';
}

/// Convert an ISO `YYYY-MM-DD` (or full ISO datetime) to DD/MM/YYYY for display.
String isoToBrDate(String iso) {
  final datePart = iso.split('T').first;
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(datePart);
  if (m == null) return iso;
  return '${m.group(3)}/${m.group(2)}/${m.group(1)}';
}
