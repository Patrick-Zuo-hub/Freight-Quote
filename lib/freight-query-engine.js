function normalizeWarehouseCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function roundPrice(value) {
  return Number(Number(value).toFixed(2));
}

function applyDiscount(rawPrice, discountConfig) {
  if (rawPrice === null || rawPrice === undefined || !Number.isFinite(Number(rawPrice))) {
    return null;
  }

  if (!discountConfig?.enabled) {
    return roundPrice(rawPrice);
  }

  return roundPrice(Number(rawPrice) - Number(discountConfig.discountAmount || 0));
}

function supplierOrderOf(supplier) {
  return Number.isFinite(Number(supplier?.order)) ? Number(supplier.order) : Number.MAX_SAFE_INTEGER;
}

function getDiscountForSupplier(discounts, supplierId) {
  return discounts?.suppliers?.[supplierId] || null;
}

function getModeValue(record, mode, fieldBase) {
  const fieldName = `${mode}${fieldBase}`;
  return record?.[fieldName] ?? null;
}

function getDeliveryOptionsForDataset(dataset) {
  const records = Array.isArray(dataset?.records) ? dataset.records : [];
  const options = new Map();
  const seenLabels = new Set();

  for (const mode of ['shenzhen', 'yiwu']) {
    const labelField = `${mode}OriginLabel`;
    const priceField = `${mode}PackageTaxPrice`;
    const matchedRecord = records.find((record) => {
      const label = String(record?.[labelField] || '').trim();
      const price = record?.[priceField];
      return label && Number.isFinite(Number(price));
    });

    if (matchedRecord) {
      const label = String(matchedRecord[labelField]).trim();
      if (seenLabels.has(label)) {
        continue;
      }
      seenLabels.add(label);
      options.set(mode, {
        key: mode,
        label,
        mode
      });
    }
  }

  return [...options.values()];
}

function mapBatchCell(record, discountConfig, deliveryOptionKey) {
  const originLabel = String(getModeValue(record, deliveryOptionKey, 'OriginLabel') || '').trim();
  const finalPrice = applyDiscount(getModeValue(record, deliveryOptionKey, 'PackageTaxPrice'), discountConfig);

  return {
    channel: record.channel,
    finalPrice,
    referenceAging: record.referenceAging || '',
    compensationAging: record.compensationAging || '',
    taxStartStandard: record.taxStartStandard || '',
    originLabel
  };
}

function createEmptyBatchCell() {
  return {
    channel: '',
    finalPrice: null,
    referenceAging: '',
    compensationAging: '',
    taxStartStandard: '',
    originLabel: ''
  };
}

function mapSingleRecord(record, discountConfig) {
  const candidates = ['shenzhen', 'yiwu']
    .map((mode) => {
      const originLabel = String(getModeValue(record, mode, 'OriginLabel') || '').trim();
      const finalPrice = applyDiscount(getModeValue(record, mode, 'PackageTaxPrice'), discountConfig);
      if (!originLabel || finalPrice === null) {
        return null;
      }
      return { mode, originLabel, finalPrice };
    })
    .filter(Boolean)
    .sort((left, right) => left.finalPrice - right.finalPrice || left.mode.localeCompare(right.mode, 'zh-CN'))[0] || null;

  return {
    supplierId: record.supplierId,
    supplierName: record.supplierName,
    sheetName: record.sheetName,
    channel: record.channel,
    warehouseCode: record.warehouseCode,
    rawWarehouseCode: record.rawWarehouseCode,
    yiwuPackageTaxPrice: record.yiwuPackageTaxPrice ?? null,
    shenzhenPackageTaxPrice: record.shenzhenPackageTaxPrice ?? null,
    yiwuOriginLabel: record.yiwuOriginLabel || '',
    shenzhenOriginLabel: record.shenzhenOriginLabel || '',
    referenceAging: record.referenceAging || '',
    compensationAging: record.compensationAging || '',
    taxStartStandard: record.taxStartStandard || '',
    finalPrice: candidates?.finalPrice ?? null,
    deliveryOptionKey: candidates?.mode ?? null,
    originLabel: candidates?.originLabel ?? ''
  };
}

function sortRecords(records) {
  return records.slice().sort((left, right) => {
    const leftPrice = left.finalPrice ?? Number.MAX_SAFE_INTEGER;
    const rightPrice = right.finalPrice ?? Number.MAX_SAFE_INTEGER;
    return leftPrice - rightPrice || String(left.channel || '').localeCompare(String(right.channel || ''), 'zh-CN');
  });
}

export function createFreightQueryEngine({ storage, discounts = { suppliers: {} } } = {}) {
  const supplierStorage = storage?.suppliers || {};

  function getDeliveryOptions(supplierId) {
    const dataset = supplierStorage[supplierId];
    if (!dataset) {
      return [];
    }

    return getDeliveryOptionsForDataset(dataset);
  }

  function batchQuery({ supplierId, deliveryOptionKey, warehouseCodes = [] } = {}) {
    const dataset = supplierStorage[supplierId];
    if (!dataset) {
      return { supplierId, deliveryOptionKey, columnCount: 0, rows: [] };
    }

    const normalizedCodes = warehouseCodes
      .map((warehouseCode) => normalizeWarehouseCode(warehouseCode))
      .filter(Boolean);
    const discountConfig = getDiscountForSupplier(discounts, supplierId);

    const rows = normalizedCodes.map((warehouseCode) => {
      const cells = sortRecords(
        dataset.records
          .filter((record) => normalizeWarehouseCode(record.warehouseCode) === warehouseCode)
          .map((record) => mapBatchCell(record, discountConfig, deliveryOptionKey))
          .filter((record) => record.finalPrice !== null)
      );

      return { warehouseCode, cells };
    });

    const columnCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
    const paddedRows = rows.map((row) => ({
      warehouseCode: row.warehouseCode,
      cells: row.cells.concat(Array.from({ length: columnCount - row.cells.length }, () => createEmptyBatchCell()))
    }));

    return { supplierId, deliveryOptionKey, columnCount, rows: paddedRows };
  }

  function queryByWarehouse(warehouseCode) {
    const normalizedCode = normalizeWarehouseCode(warehouseCode);

    const supplierGroups = Object.values(supplierStorage)
      .map((dataset) => {
        const discountConfig = getDiscountForSupplier(discounts, dataset?.supplier?.id);
        const matchedRecords = Array.isArray(dataset.records)
          ? dataset.records
              .filter((record) => normalizeWarehouseCode(record.warehouseCode) === normalizedCode)
              .map((record) => mapSingleRecord(record, discountConfig))
              .filter((record) => record.finalPrice !== null)
          : [];

        if (!matchedRecords.length) {
          return null;
        }

        const records = sortRecords(matchedRecords).map((record, index) => ({
          ...record,
          rank: index + 1
        }));

        return {
          supplier: dataset.supplier,
          notes: dataset.notes || '',
          count: records.length,
          records
        };
      })
      .filter(Boolean)
      .sort((left, right) => supplierOrderOf(left.supplier) - supplierOrderOf(right.supplier));

    return {
      warehouseCode: normalizedCode,
      totalCount: supplierGroups.reduce((sum, group) => sum + group.count, 0),
      supplierGroups
    };
  }

  return {
    getDeliveryOptions,
    batchQuery,
    queryByWarehouse
  };
}
