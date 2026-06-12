import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:capa_contest/util/date_br.dart';

TextEditingValue _type(String s) =>
    TextEditingValue(text: s, selection: TextSelection.collapsed(offset: s.length));

void main() {
  group('BrDateInputFormatter', () {
    final f = BrDateInputFormatter();

    String mask(String input) =>
        f.formatEditUpdate(const TextEditingValue(), _type(input)).text;

    test('inserts slashes automatically as digits are typed', () {
      expect(mask('3'), '3');
      expect(mask('31'), '31');
      expect(mask('311'), '31/1');
      expect(mask('3101'), '31/01');
      expect(mask('31011'), '31/01/1');
      expect(mask('31011990'), '31/01/1990');
    });

    test('strips non-digits and caps at 8 digits', () {
      expect(mask('31/01/1990'), '31/01/1990');
      expect(mask('31011990999'), '31/01/1990'); // extra digits dropped
      expect(mask('ab31cd01'), '31/01');
    });

    test('keeps the caret at the end', () {
      final r = f.formatEditUpdate(const TextEditingValue(), _type('3101'));
      expect(r.selection.baseOffset, r.text.length);
    });
  });

  group('date conversion', () {
    test('valid BR date converts to ISO', () {
      expect(brDateToIso('31/01/1990'), '1990-01-31');
      expect(brDateToIso('01/12/2000'), '2000-12-01');
    });

    test('invalid dates are rejected', () {
      expect(isValidBrDate('31/02/2000'), false); // Feb 31 doesn't exist
      expect(isValidBrDate('00/01/2000'), false);
      expect(isValidBrDate('15/13/2000'), false);
      expect(isValidBrDate('1/1/2000'), false); // not zero-padded
      expect(brDateToIso('31/02/2000'), null);
    });

    test('ISO converts back to BR for display', () {
      expect(isoToBrDate('1990-01-31'), '31/01/1990');
      expect(isoToBrDate('1990-01-31T00:00:00.000Z'), '31/01/1990');
    });
  });
}
