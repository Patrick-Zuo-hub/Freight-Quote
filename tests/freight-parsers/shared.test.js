import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { getVisibleSheetNames } from '../../lib/freight-sheet-utils.js';
import { FreightError } from '../../lib/freight-errors.js';

test('getVisibleSheetNames excludes hidden and veryHidden sheets', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['A']]), 'Visible');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['B']]), 'Hidden');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['C']]), 'VeryHidden');
  workbook.Workbook = {
    Sheets: [
      { name: 'Visible', Hidden: 0 },
      { name: 'Hidden', Hidden: 1 },
      { name: 'VeryHidden', Hidden: 2 }
    ]
  };

  assert.deepEqual(getVisibleSheetNames(workbook), ['Visible']);
});

test('FreightError serializes code level message and details', () => {
  const error = new FreightError({
    code: 'MISSING_REQUIRED_SHEET',
    level: 'sheet',
    message: '模板已识别，但缺少关键工作表：TK直送',
    details: { sheetName: 'TK直送' }
  });

  assert.deepEqual(error.toJSON(), {
    ok: false,
    code: 'MISSING_REQUIRED_SHEET',
    level: 'sheet',
    message: '模板已识别，但缺少关键工作表：TK直送',
    details: { sheetName: 'TK直送' }
  });
});
