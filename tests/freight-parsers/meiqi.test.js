import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { detectSupplierDataset } from '../../lib/freight-parsers/index.js';
import { FreightError } from '../../lib/freight-errors.js';

function createMeiqiTkSheet({ withData = true } = {}) {
  const sheet = XLSX.utils.aoa_to_sheet(Array.from({ length: 7 }, () => Array(6).fill('')));

  sheet.B4 = { t: 's', v: 'TK直送' };
  sheet.D5 = { t: 's', v: '深圳/义乌' };
  sheet.D6 = { t: 's', v: '10KG+' };

  if (withData) {
    sheet.C7 = { t: 's', v: 'lax9' };
    sheet.D7 = { t: 'n', v: 6.28 };
    sheet.F7 = { t: 's', v: '18天' };
  }

  sheet['!ref'] = 'A1:F7';
  return sheet;
}

function createVisibleMeiqiWorkbook(tkSheet = createMeiqiTkSheet(), matchSheet = XLSX.utils.aoa_to_sheet([['ok']])) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, tkSheet, 'TK直送');
  XLSX.utils.book_append_sheet(workbook, matchSheet, 'Match系列 ');
  workbook.Workbook = {
    Sheets: [
      { name: 'TK直送', Hidden: 0 },
      { name: 'Match系列 ', Hidden: 0 }
    ]
  };
  return workbook;
}

function createMeiqiMatchSheet() {
  const sheet = XLSX.utils.aoa_to_sheet(Array.from({ length: 7 }, () => Array(12).fill('')));

  sheet.G4 = { t: 's', v: 'Match二组-直送' };
  sheet.G5 = { t: 's', v: '深圳/义乌' };
  sheet.G6 = { t: 's', v: '15KG+' };
  sheet.C7 = { t: 's', v: ' ont8 ' };
  sheet.G7 = { t: 'n', v: 7.15 };
  sheet.H7 = { t: 's', v: '22天' };
  sheet.I7 = { t: 's', v: '28天' };
  sheet['!ref'] = 'A1:L7';
  return sheet;
}

test('美琦 visible workbook with missing structure returns parser-level error', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['bad']]), 'TK直送');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ok']]), 'Match系列 ');
  workbook.Workbook = {
    Sheets: [
      { name: 'TK直送', Hidden: 0 },
      { name: 'Match系列 ', Hidden: 0 }
    ]
  };
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  assert.throws(() => detectSupplierDataset(buffer), (error) => {
    assert.ok(error instanceof FreightError);
    assert.deepEqual(error.toJSON(), {
      ok: false,
      code: 'NO_USABLE_RECORDS',
      level: 'import',
      message: '未在美琦报价表中解析到可用于仓库代码查询的渠道数据。',
      details: { supplierId: 'meiqi-us' }
    });
    return true;
  });
});

test('美琦 only one visible anchor sheet remains unsupported template', () => {
  const workbook = createVisibleMeiqiWorkbook();
  workbook.Workbook = {
    Sheets: [
      { name: 'TK直送', Hidden: 0 },
      { name: 'Match系列 ', Hidden: 1 }
    ]
  };
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  assert.throws(() => detectSupplierDataset(buffer), /暂不支持这份报价表模板/);
});

test('美琦 empty required visible sheet throws structure-level FreightError', () => {
  const workbook = createVisibleMeiqiWorkbook(createMeiqiTkSheet());
  delete workbook.Sheets['Match系列 ']['!ref'];
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  assert.throws(() => detectSupplierDataset(buffer), (error) => {
    assert.ok(error instanceof FreightError);
    assert.deepEqual(error.toJSON(), {
      ok: false,
      code: 'EMPTY_REQUIRED_SHEET',
      level: 'structure',
      message: '工作表“Match系列 ”没有可读取的数据。',
      details: {
        supplierId: 'meiqi-us',
        sheetName: 'Match系列 '
      }
    });
    return true;
  });
});

test('美琦 workbook preserves raw origin label on parsed records', () => {
  const workbook = createVisibleMeiqiWorkbook();
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const dataset = detectSupplierDataset(buffer, { filename: 'meiqi.xlsx' });

  assert.equal(dataset.supplier.id, 'meiqi-us');
  assert.equal(dataset.sourceFilename, 'meiqi.xlsx');
  assert.equal(dataset.records.length, 1);
  assert.equal(dataset.records[0].warehouseCode, 'LAX9');
  assert.equal(dataset.records[0].rawOriginLabel, '深圳/义乌');
  assert.equal(dataset.records[0].yiwuPackageTaxPrice, 6.28);
});

test('美琦 Match系列 multi-group sheet parses a visible grouped channel', () => {
  const workbook = createVisibleMeiqiWorkbook(createMeiqiTkSheet({ withData: false }), createMeiqiMatchSheet());
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const dataset = detectSupplierDataset(buffer, { filename: 'meiqi-match.xlsx' });

  assert.equal(dataset.records.length, 1);
  assert.equal(dataset.records[0].channel, 'Match二组-直送');
  assert.equal(dataset.records[0].warehouseCode, 'ONT8');
  assert.equal(dataset.records[0].rawOriginLabel, '深圳/义乌');
  assert.equal(dataset.records[0].yiwuPackageTaxPrice, 7.15);
});
