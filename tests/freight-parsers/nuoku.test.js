import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { detectSupplierDataset } from '../../lib/freight-parsers/index.js';
import { FreightError } from '../../lib/freight-errors.js';

function createNuokuPrimarySheet({ withWarehouseAnchor = true, withRecord = true } = {}) {
  const sheet = XLSX.utils.aoa_to_sheet(Array.from({ length: 7 }, () => Array(7).fill('')));

  sheet.D4 = { t: 's', v: '含税' };
  sheet.D5 = { t: 's', v: '华东/宁波/上海/苏州' };
  sheet.D6 = { t: 's', v: '10KG+' };
  sheet.E5 = { t: 's', v: '华南' };
  sheet.E6 = { t: 's', v: '10KG+' };
  sheet.F4 = { t: 's', v: '参考时效' };
  sheet.G4 = { t: 's', v: '理赔时效' };

  if (withWarehouseAnchor) {
    sheet.C6 = { t: 's', v: '仓库代码' };
  } else {
    sheet.C6 = { t: 's', v: '渠道代码' };
  }

  if (withRecord) {
    sheet.B7 = { t: 's', v: '美西特惠-直送' };
    sheet.C7 = { t: 's', v: ' ont8 ' };
    sheet.D7 = { t: 'n', v: 5.18 };
    sheet.E7 = { t: 'n', v: 5.42 };
    sheet.F7 = { t: 's', v: '25天' };
    sheet.G7 = { t: 's', v: '30天' };
  }

  sheet['!ref'] = 'A1:G7';
  return sheet;
}

function createNuokuSplitSectionSheet() {
  const sheet = XLSX.utils.aoa_to_sheet(Array.from({ length: 7 }, () => Array(10).fill('')));

  sheet.C6 = { t: 's', v: '仓库代码' };
  sheet.D4 = { t: 's', v: '含税' };
  sheet.D5 = { t: 's', v: '华东/宁波/上海/苏州' };
  sheet.D6 = { t: 's', v: '10KG+' };
  sheet.E4 = { t: 's', v: '参考时效' };
  sheet.F4 = { t: 's', v: '理赔时效' };
  sheet.G4 = { t: 's', v: '含税' };
  sheet.G5 = { t: 's', v: '华南' };
  sheet.G6 = { t: 's', v: '20KG+' };
  sheet.H4 = { t: 's', v: '参考时效' };
  sheet.I4 = { t: 's', v: '理赔时效' };
  sheet.B7 = { t: 's', v: '美西特惠-直送' };
  sheet.C7 = { t: 's', v: 'ONT8' };
  sheet.D7 = { t: 'n', v: 5.18 };
  sheet.E7 = { t: 's', v: '25天' };
  sheet.F7 = { t: 's', v: '30天' };
  sheet.G7 = { t: 'n', v: 5.42 };
  sheet.H7 = { t: 's', v: '40天' };
  sheet.I7 = { t: 's', v: '45天' };
  sheet['!ref'] = 'A1:J7';
  return sheet;
}

function createVisibleNuokuWorkbook(primarySheet = createNuokuPrimarySheet(), secondarySheet = XLSX.utils.aoa_to_sheet([['anchor']])) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, primarySheet, '直送专线');
  XLSX.utils.book_append_sheet(workbook, secondarySheet, '王牌渠道-全美25日达');
  workbook.Workbook = {
    Sheets: [
      { name: '直送专线', Hidden: 0 },
      { name: '王牌渠道-全美25日达', Hidden: 0 }
    ]
  };
  return workbook;
}

test('纽酷 missing visible required sheet returns unsupported template until both visible anchors exist', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['x']]), '直送专线');
  workbook.Workbook = { Sheets: [{ name: '直送专线', Hidden: 0 }] };
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  assert.throws(() => detectSupplierDataset(buffer), /暂不支持这份报价表模板/);
});

test('纽酷 recognized workbook without warehouse anchor throws structure-level FreightError', () => {
  const workbook = createVisibleNuokuWorkbook(createNuokuPrimarySheet({ withWarehouseAnchor: false }));
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  assert.throws(() => detectSupplierDataset(buffer), (error) => {
    assert.ok(error instanceof FreightError);
    assert.deepEqual(error.toJSON(), {
      ok: false,
      code: 'WAREHOUSE_COLUMN_NOT_FOUND',
      level: 'structure',
      message: '模板已识别，但未在纽酷报价表中找到“仓库代码”列锚点。',
      details: {
        supplierId: 'nuoku-vip',
        sheetName: '直送专线',
        cell: 'C6'
      }
    });
    return true;
  });
});

test('纽酷 workbook parses visible sheets and maps yiwu and shenzhen prices', () => {
  const workbook = createVisibleNuokuWorkbook();
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const dataset = detectSupplierDataset(buffer, { filename: 'nuoku.xlsx' });

  assert.equal(dataset.supplier.id, 'nuoku-vip');
  assert.equal(dataset.sourceFilename, 'nuoku.xlsx');
  assert.equal(dataset.notes, '纽酷义乌价格按“华东/宁波/上海/苏州”口径读取，深圳价格按“华南”口径读取。');
  assert.equal(dataset.records.length, 1);
  assert.equal(dataset.records[0].warehouseCode, 'ONT8');
  assert.equal(dataset.records[0].yiwuOriginLabel, '华东/宁波/上海/苏州');
  assert.equal(dataset.records[0].shenzhenOriginLabel, '华南');
  assert.equal(dataset.records[0].yiwuPackageTaxPrice, 5.18);
});

test('纽酷 keeps yiwu and shenzhen values within one coherent pricing section', () => {
  const workbook = createVisibleNuokuWorkbook(createNuokuSplitSectionSheet());
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const dataset = detectSupplierDataset(buffer, { filename: 'nuoku-split.xlsx' });

  assert.equal(dataset.records.length, 1);
  assert.equal(dataset.records[0].yiwuPackageTaxPrice, 5.18);
  assert.equal(dataset.records[0].shenzhenPackageTaxPrice, null);
  assert.equal(dataset.records[0].taxStartStandard, '10KG+');
  assert.equal(dataset.records[0].referenceAging, '25天');
  assert.equal(dataset.records[0].compensationAging, '30天');
});
