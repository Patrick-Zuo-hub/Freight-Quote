import XLSX from 'xlsx';
import { FreightError } from '../freight-errors.js';
import { getVisibleSheetNames } from '../freight-sheet-utils.js';
import { assertSheetExists, normalizeWarehouseCode } from './shared.js';

const MEIQI_SUPPLIER = {
  id: 'meiqi-us',
  name: '美琦国际',
  code: 'meiqi',
  order: 3
};

const MEIQI_REQUIRED_SHEETS = ['TK直送', 'Match系列 '];

const MEIQI_SINGLE_GROUP_SHEETS = {
  'TK拆送': {
    channelCell: { column: 2, row: 4 },
    originCell: { column: 4, row: 5 },
    startStandardCell: { column: 4, row: 6 },
    warehouseColumn: 3,
    priceColumn: 4,
    referenceColumn: 6,
    compensationColumn: null,
    startRow: 7
  },
  'TK直送': {
    channelCell: { column: 2, row: 4 },
    originCell: { column: 4, row: 5 },
    startStandardCell: { column: 4, row: 6 },
    warehouseColumn: 3,
    priceColumn: 4,
    referenceColumn: 6,
    compensationColumn: null,
    startRow: 7
  },
  'TK-奥克兰': {
    channelCell: { column: 2, row: 4 },
    originCell: { column: 4, row: 5 },
    startStandardCell: { column: 4, row: 6 },
    warehouseColumn: 3,
    priceColumn: 4,
    referenceColumn: 6,
    compensationColumn: null,
    startRow: 7
  },
  'TH特惠': {
    channelCell: { column: 3, row: 10 },
    originValue: '深圳/中山/广州/义乌/苏州/汕头/厦门',
    startStandardCell: { column: 3, row: 4 },
    warehouseColumn: 2,
    priceColumn: 3,
    referenceColumn: 8,
    compensationColumn: null,
    startRow: 5
  },
  '休斯敦': {
    channelCell: { column: 2, row: 4 },
    originCell: { column: 3, row: 5 },
    startStandardCell: { column: 3, row: 6 },
    warehouseColumn: 2,
    priceColumn: 3,
    referenceColumn: 5,
    compensationColumn: 6,
    startRow: 7
  },
  '萨瓦纳': {
    channelCell: { column: 2, row: 4 },
    originCell: { column: 3, row: 5 },
    startStandardCell: { column: 3, row: 6 },
    warehouseColumn: 2,
    priceColumn: 3,
    referenceColumn: 5,
    compensationColumn: 6,
    startRow: 7
  }
};

const MEIQI_MULTI_GROUP_SHEETS = {
  'Match系列 ': {
    warehouseColumn: 3,
    startRow: 7,
    groups: [
      { channelColumn: 4, originColumn: 4, startStandardColumn: 4, priceColumn: 4, referenceColumn: 5, compensationColumn: 6 },
      { channelColumn: 7, originColumn: 7, startStandardColumn: 7, priceColumn: 7, referenceColumn: 8, compensationColumn: 9 },
      { channelColumn: 10, originColumn: 10, startStandardColumn: 10, priceColumn: 10, referenceColumn: 11, compensationColumn: 12 }
    ]
  },
  '纽约': {
    warehouseColumn: 3,
    startRow: 7,
    groups: [
      { channelColumn: 4, originColumn: 4, startStandardColumn: 4, priceColumn: 4, referenceColumn: 6, compensationColumn: null },
      { channelColumn: 7, originColumn: 7, startStandardColumn: 7, priceColumn: 7, referenceColumn: 9, compensationColumn: null }
    ]
  },
  '芝加哥': {
    warehouseColumn: 2,
    startRow: 7,
    groups: [
      { channelColumn: 3, originColumn: 3, startStandardColumn: 3, priceColumn: 3, referenceColumn: 5, compensationColumn: 6 },
      { channelColumn: 7, originColumn: 7, startStandardColumn: 7, priceColumn: 7, referenceColumn: 9, compensationColumn: 10 }
    ]
  }
};

function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '' || value === '-') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compactWhitespace(value) {
  return toText(value).replace(/\s+/g, ' ').trim();
}

function sheetValueByColumnNumber(sheet, columnNumber, rowNumber) {
  const address = XLSX.utils.encode_cell({ c: columnNumber - 1, r: rowNumber - 1 });
  const cell = sheet[address];
  return cell ? cell.v : null;
}

function extractWarehouseCodes(value) {
  const text = compactWhitespace(value).toUpperCase();
  if (!text) {
    return [];
  }

  const matches = text.match(/[A-Z]{2,}(?:-[A-Z0-9]+)*\d[A-Z0-9-]*/g) || [];
  return Array.from(new Set(matches.map((item) => normalizeWarehouseCode(item)).filter(Boolean)));
}

function buildMeiqiPriceRecord({
  sheetName,
  rowNumber,
  channel,
  warehouseCode,
  price,
  originLabel,
  startStandard,
  referenceAging,
  compensationAging
}) {
  return {
    supplierId: MEIQI_SUPPLIER.id,
    supplierName: MEIQI_SUPPLIER.name,
    sheetName,
    rowNumber,
    channel,
    baseChannel: channel.replace(/-直送$/u, ''),
    isDirect: /直送/u.test(channel),
    rawWarehouseCode: warehouseCode,
    warehouseCode,
    rawOriginLabel: originLabel,
    yiwuPackageTaxPrice: price,
    shenzhenPackageTaxPrice: price,
    yiwuOriginLabel: originLabel,
    shenzhenOriginLabel: originLabel,
    taxStartStandard: startStandard,
    referenceAging,
    compensationAging
  };
}

function collectMeiqiSingleGroupRecords(sheetName, sheet, config) {
  const channel = compactWhitespace(sheetValueByColumnNumber(sheet, config.channelCell.column, config.channelCell.row)) || sheetName;
  const originLabel = config.originValue
    ? compactWhitespace(config.originValue)
    : compactWhitespace(sheetValueByColumnNumber(sheet, config.originCell.column, config.originCell.row));
  const startStandard = compactWhitespace(sheetValueByColumnNumber(sheet, config.startStandardCell.column, config.startStandardCell.row));
  const records = [];
  const range = XLSX.utils.decode_range(sheet['!ref']);

  for (let rowNumber = config.startRow; rowNumber <= range.e.r + 1; rowNumber += 1) {
    const warehouseCodes = extractWarehouseCodes(sheetValueByColumnNumber(sheet, config.warehouseColumn, rowNumber));
    const price = toNumber(sheetValueByColumnNumber(sheet, config.priceColumn, rowNumber));

    if (!warehouseCodes.length || price === null) {
      continue;
    }

    const referenceAging = compactWhitespace(sheetValueByColumnNumber(sheet, config.referenceColumn, rowNumber));
    const compensationAging = config.compensationColumn
      ? compactWhitespace(sheetValueByColumnNumber(sheet, config.compensationColumn, rowNumber))
      : '';

    for (const warehouseCode of warehouseCodes) {
      records.push(
        buildMeiqiPriceRecord({
          sheetName,
          rowNumber,
          channel,
          warehouseCode,
          price,
          originLabel,
          startStandard,
          referenceAging,
          compensationAging
        })
      );
    }
  }

  return records;
}

function collectMeiqiMultiGroupRecords(sheetName, sheet, config) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const records = [];

  for (const group of config.groups) {
    const channel = compactWhitespace(sheetValueByColumnNumber(sheet, group.channelColumn, 4));
    const originLabel = compactWhitespace(sheetValueByColumnNumber(sheet, group.originColumn, 5));
    const startStandard = compactWhitespace(sheetValueByColumnNumber(sheet, group.startStandardColumn, 6));

    if (!channel) {
      continue;
    }

    for (let rowNumber = config.startRow; rowNumber <= range.e.r + 1; rowNumber += 1) {
      const warehouseCodes = extractWarehouseCodes(sheetValueByColumnNumber(sheet, config.warehouseColumn, rowNumber));
      const price = toNumber(sheetValueByColumnNumber(sheet, group.priceColumn, rowNumber));

      if (!warehouseCodes.length || price === null) {
        continue;
      }

      const referenceAging = compactWhitespace(sheetValueByColumnNumber(sheet, group.referenceColumn, rowNumber));
      const compensationAging = group.compensationColumn
        ? compactWhitespace(sheetValueByColumnNumber(sheet, group.compensationColumn, rowNumber))
        : '';

      for (const warehouseCode of warehouseCodes) {
        records.push(
          buildMeiqiPriceRecord({
            sheetName,
            rowNumber,
            channel,
            warehouseCode,
            price,
            originLabel,
            startStandard,
            referenceAging,
            compensationAging
          })
        );
      }
    }
  }

  return records;
}

export function createMeiqiDataset(workbook, { filename = 'meiqi.xlsx' } = {}) {
  const visibleSheetNames = getVisibleSheetNames(workbook);

  for (const sheetName of MEIQI_REQUIRED_SHEETS) {
    const sheet = visibleSheetNames.includes(sheetName) ? workbook.Sheets[sheetName] : undefined;
    assertSheetExists(sheet, sheetName, MEIQI_SUPPLIER.name);

    if (!sheet['!ref']) {
      throw new FreightError({
        code: 'EMPTY_REQUIRED_SHEET',
        level: 'structure',
        message: `工作表“${sheetName}”没有可读取的数据。`,
        details: {
          supplierId: MEIQI_SUPPLIER.id,
          sheetName
        }
      });
    }
  }

  const records = [];

  for (const [sheetName, config] of Object.entries(MEIQI_SINGLE_GROUP_SHEETS)) {
    if (!visibleSheetNames.includes(sheetName)) {
      continue;
    }

    records.push(...collectMeiqiSingleGroupRecords(sheetName, workbook.Sheets[sheetName], config));
  }

  for (const [sheetName, config] of Object.entries(MEIQI_MULTI_GROUP_SHEETS)) {
    if (!visibleSheetNames.includes(sheetName)) {
      continue;
    }

    records.push(...collectMeiqiMultiGroupRecords(sheetName, workbook.Sheets[sheetName], config));
  }

  if (!records.length) {
    throw new FreightError({
      code: 'NO_USABLE_RECORDS',
      level: 'import',
      message: '未在美琦报价表中解析到可用于仓库代码查询的渠道数据。',
      details: { supplierId: MEIQI_SUPPLIER.id }
    });
  }

  return {
    supplier: MEIQI_SUPPLIER,
    sourceFilename: filename,
    records,
    notes: '美琦当前按原表主出货口径展示。若原表未单独拆出义乌列，则义乌价与深圳价按同口径同价展示。'
  };
}
