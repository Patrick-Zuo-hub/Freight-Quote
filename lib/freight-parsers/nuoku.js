import XLSX from 'xlsx';
import { FreightError } from '../freight-errors.js';
import { getVisibleSheetNames } from '../freight-sheet-utils.js';
import { assertSheetExists, normalizeWarehouseCode } from './shared.js';

const NUOKU_SUPPLIER = {
  id: 'nuoku-vip',
  name: '纽酷国际',
  code: 'nuoku',
  order: 2
};

const NUOKU_REQUIRED_SHEETS = ['直送专线', '王牌渠道-全美25日达'];

const NUOKU_EXCLUDED_SHEETS = new Set([
  '首推王牌渠道',
  '目录',
  '查询有效性',
  '新增网点报价栏',
  '附加费查询栏',
  '含税海派',
  '一件代发',
  '沃尔玛专线',
  '整柜专线 ',
  '美西留仓中转',
  '赔付标准和注意事项',
  '海内外仓库操作费'
]);

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

function sheetValueByColumnNumber(sheet, columnNumber, rowNumber) {
  const address = XLSX.utils.encode_cell({ c: columnNumber - 1, r: rowNumber - 1 });
  const cell = sheet[address];
  return cell ? cell.v : null;
}

function looksLikeWarehouseCode(value) {
  const text = toText(value);

  if (!text || text.length > 20) {
    return false;
  }

  if (/[\u4e00-\u9fa5]/u.test(text)) {
    return false;
  }

  return /[A-Za-z0-9]/.test(text);
}

function isNuokuPriceType(typeLabel) {
  return typeLabel.includes('含税') || typeLabel.includes('自税');
}

function normalizeNuokuHeaderColumns(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const columns = [];
  let lastTypeLabel = '';

  for (let columnNumber = 4; columnNumber <= range.e.c + 1; columnNumber += 1) {
    const rawTypeLabel = toText(sheetValueByColumnNumber(sheet, columnNumber, 4));
    if (rawTypeLabel) {
      lastTypeLabel = rawTypeLabel;
    }

    columns.push({
      columnNumber,
      typeLabel: lastTypeLabel,
      regionLabel: toText(sheetValueByColumnNumber(sheet, columnNumber, 5)),
      startStandard: toText(sheetValueByColumnNumber(sheet, columnNumber, 6))
    });
  }

  return columns;
}

function buildNuokuSections(headerColumns) {
  const sections = [];
  let index = 0;

  while (index < headerColumns.length) {
    if (!isNuokuPriceType(headerColumns[index].typeLabel)) {
      index += 1;
      continue;
    }

    const section = {
      priceColumns: [],
      timeColumnNumber: null,
      compensationColumnNumber: null
    };

    while (index < headerColumns.length && isNuokuPriceType(headerColumns[index].typeLabel)) {
      const column = headerColumns[index];
      if (column.regionLabel && column.startStandard) {
        section.priceColumns.push(column);
      }
      index += 1;
    }

    while (index < headerColumns.length && !isNuokuPriceType(headerColumns[index].typeLabel)) {
      const column = headerColumns[index];
      if (column.typeLabel.includes('时效') && !column.typeLabel.includes('理赔') && !section.timeColumnNumber) {
        section.timeColumnNumber = column.columnNumber;
      }
      if (column.typeLabel.includes('理赔时效') && !section.compensationColumnNumber) {
        section.compensationColumnNumber = column.columnNumber;
      }
      index += 1;
    }

    if (section.priceColumns.length) {
      sections.push(section);
    }
  }

  return sections;
}

function scoreNuokuShenzhenRegion(regionLabel) {
  if (regionLabel.includes('深圳')) {
    return 0;
  }
  if (regionLabel.includes('深圳总仓')) {
    return 1;
  }
  if (regionLabel.includes('华南')) {
    return 2;
  }
  if (regionLabel.includes('中山') || regionLabel.includes('佛山') || regionLabel.includes('广州') || regionLabel.includes('东莞')) {
    return 3;
  }
  return Number.MAX_SAFE_INTEGER;
}

function scoreNuokuYiwuRegion(regionLabel) {
  if (regionLabel.includes('华东')) {
    return 0;
  }
  if (regionLabel.includes('义乌')) {
    return 1;
  }
  if (regionLabel.includes('金华')) {
    return 2;
  }
  if (regionLabel.includes('宁波') || regionLabel.includes('上海') || regionLabel.includes('苏州') || regionLabel.includes('杭州')) {
    return 3;
  }
  return Number.MAX_SAFE_INTEGER;
}

function pickNuokuPriceColumn(section, scorer) {
  return section.priceColumns
    .filter((column) => column.typeLabel.includes('含税'))
    .map((column) => ({ ...column, score: scorer(column.regionLabel) }))
    .filter((column) => column.score !== Number.MAX_SAFE_INTEGER)
    .sort((left, right) => left.score - right.score)[0] || null;
}

function collectNuokuRecordsFromSheet(sheetName, sheet) {
  if (!sheet || !sheet['!ref'] || NUOKU_EXCLUDED_SHEETS.has(sheetName)) {
    return [];
  }

  if (!toText(sheetValueByColumnNumber(sheet, 3, 6)).includes('仓库代码')) {
    return [];
  }

  const headerColumns = normalizeNuokuHeaderColumns(sheet);
  const sections = buildNuokuSections(headerColumns);
  const shenzhenColumns = sections
    .map((section) => ({
      section,
      priceColumn: pickNuokuPriceColumn(section, scoreNuokuShenzhenRegion)
    }))
    .filter((item) => item.priceColumn);
  const yiwuColumns = sections
    .map((section) => ({
      section,
      priceColumn: pickNuokuPriceColumn(section, scoreNuokuYiwuRegion)
    }))
    .filter((item) => item.priceColumn);

  if (!shenzhenColumns.length && !yiwuColumns.length) {
    return [];
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const records = [];
  let currentChannel = '';

  for (let rowNumber = 7; rowNumber <= range.e.r + 1; rowNumber += 1) {
    const rowChannel = toText(sheetValueByColumnNumber(sheet, 2, rowNumber));
    if (rowChannel) {
      currentChannel = rowChannel;
    }

    const rawWarehouseCode = toText(sheetValueByColumnNumber(sheet, 3, rowNumber));
    if (!looksLikeWarehouseCode(rawWarehouseCode)) {
      continue;
    }

    const warehouseCode = normalizeWarehouseCode(rawWarehouseCode);
    const shenzhenMatch = shenzhenColumns
      .map(({ section, priceColumn }) => ({
        section,
        priceColumn,
        price: toNumber(sheetValueByColumnNumber(sheet, priceColumn.columnNumber, rowNumber))
      }))
      .find((item) => item.price !== null);
    const yiwuMatch = yiwuColumns
      .map(({ section, priceColumn }) => ({
        section,
        priceColumn,
        price: toNumber(sheetValueByColumnNumber(sheet, priceColumn.columnNumber, rowNumber))
      }))
      .find((item) => item.price !== null);

    if (!shenzhenMatch && !yiwuMatch) {
      continue;
    }

    const selectedSection = yiwuMatch?.section || shenzhenMatch?.section || null;
    const channel = currentChannel || sheetName;

    records.push({
      supplierId: NUOKU_SUPPLIER.id,
      supplierName: NUOKU_SUPPLIER.name,
      sheetName,
      rowNumber,
      channel,
      baseChannel: channel.replace(/-直送$/u, ''),
      isDirect: /直送/u.test(channel),
      rawWarehouseCode,
      warehouseCode,
      yiwuPackageTaxPrice: yiwuMatch ? yiwuMatch.price : null,
      shenzhenPackageTaxPrice: shenzhenMatch ? shenzhenMatch.price : null,
      yiwuOriginLabel: yiwuMatch ? yiwuMatch.priceColumn.regionLabel : '',
      shenzhenOriginLabel: shenzhenMatch ? shenzhenMatch.priceColumn.regionLabel : '',
      taxStartStandard: yiwuMatch?.priceColumn.startStandard || shenzhenMatch?.priceColumn.startStandard || '',
      referenceAging: selectedSection?.timeColumnNumber
        ? toText(sheetValueByColumnNumber(sheet, selectedSection.timeColumnNumber, rowNumber))
        : '',
      compensationAging: selectedSection?.compensationColumnNumber
        ? toText(sheetValueByColumnNumber(sheet, selectedSection.compensationColumnNumber, rowNumber))
        : ''
    });
  }

  return records;
}

export function createNuokuDataset(workbook, { filename = 'nuoku.xlsx' } = {}) {
  const visibleSheetNames = getVisibleSheetNames(workbook);

  for (const sheetName of NUOKU_REQUIRED_SHEETS) {
    const sheet = visibleSheetNames.includes(sheetName) ? workbook.Sheets[sheetName] : undefined;
    assertSheetExists(sheet, sheetName, NUOKU_SUPPLIER.name);
  }

  const anchorSheet = workbook.Sheets['直送专线'];
  if (!toText(anchorSheet?.C6?.v).includes('仓库代码')) {
    throw new FreightError({
      code: 'WAREHOUSE_COLUMN_NOT_FOUND',
      level: 'structure',
      message: '模板已识别，但未在纽酷报价表中找到“仓库代码”列锚点。',
      details: {
        supplierId: NUOKU_SUPPLIER.id,
        sheetName: '直送专线',
        cell: 'C6'
      }
    });
  }

  const records = [];

  for (const sheetName of visibleSheetNames) {
    records.push(...collectNuokuRecordsFromSheet(sheetName, workbook.Sheets[sheetName]));
  }

  if (!records.length) {
    throw new FreightError({
      code: 'NO_USABLE_RECORDS',
      level: 'import',
      message: '未在纽酷报价表中解析到可用于仓库代码查询的渠道数据。',
      details: { supplierId: NUOKU_SUPPLIER.id }
    });
  }

  return {
    supplier: NUOKU_SUPPLIER,
    sourceFilename: filename,
    records,
    notes: '纽酷义乌价格按“华东/宁波/上海/苏州”口径读取，深圳价格按“华南”口径读取。'
  };
}
