import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreightQueryEngine } from '../lib/freight-query-engine.js';

const storage = {
  suppliers: {
    'zhedao-w14': {
      supplier: { id: 'zhedao-w14', name: '赤道国际', order: 1 },
      notes: '赤道说明',
      records: [
        {
          supplierId: 'zhedao-w14',
          supplierName: '赤道国际',
          warehouseCode: 'ONT8',
          channel: '渠道 B',
          yiwuPackageTaxPrice: 4.6,
          shenzhenPackageTaxPrice: 4.5,
          yiwuOriginLabel: '义乌',
          shenzhenOriginLabel: '深圳',
          taxStartStandard: '100KG',
          referenceAging: '12-15天',
          compensationAging: '7天'
        },
        {
          supplierId: 'zhedao-w14',
          supplierName: '赤道国际',
          warehouseCode: 'ONT8',
          channel: '渠道 A',
          yiwuPackageTaxPrice: 4.4,
          shenzhenPackageTaxPrice: 4.3,
          yiwuOriginLabel: '义乌',
          shenzhenOriginLabel: '深圳',
          taxStartStandard: '100KG',
          referenceAging: '10-12天',
          compensationAging: '5天'
        },
        {
          supplierId: 'zhedao-w14',
          supplierName: '赤道国际',
          warehouseCode: 'LAX9',
          channel: '渠道 C',
          yiwuPackageTaxPrice: 5.2,
          shenzhenPackageTaxPrice: 5,
          yiwuOriginLabel: '义乌',
          shenzhenOriginLabel: '深圳',
          taxStartStandard: '100KG',
          referenceAging: '15-18天',
          compensationAging: '6天'
        }
      ]
    },
    'nuoku-vip': {
      supplier: { id: 'nuoku-vip', name: '纽酷国际', order: 2 },
      notes: '纽酷说明',
      records: [
        {
          supplierId: 'nuoku-vip',
          supplierName: '纽酷国际',
          warehouseCode: 'ONT8',
          channel: '华东卡派',
          baseChannel: '华东卡派',
          isDirect: false,
          yiwuPackageTaxPrice: 4.7,
          shenzhenPackageTaxPrice: 4.9,
          yiwuOriginLabel: '华东',
          shenzhenOriginLabel: '华南',
          taxStartStandard: '71KG',
          referenceAging: '14天',
          compensationAging: '8天'
        }
      ]
    },
    'meiqi-us': {
      supplier: { id: 'meiqi-us', name: '美琦国际', order: 3 },
      notes: '美琦说明',
      records: [
        {
          supplierId: 'meiqi-us',
          supplierName: '美琦国际',
          warehouseCode: 'ONT8',
          channel: '美琦快线',
          rawOriginLabel: '深圳/中山/广州/义乌/苏州',
          yiwuPackageTaxPrice: 5.1,
          shenzhenPackageTaxPrice: 5.1,
          yiwuOriginLabel: '深圳/中山/广州/义乌/苏州',
          shenzhenOriginLabel: '深圳/中山/广州/义乌/苏州',
          taxStartStandard: '50KG',
          referenceAging: '16天',
          compensationAging: ''
        }
      ]
    }
  }
};

const discounts = {
  suppliers: {
    'zhedao-w14': { discountAmount: 0.2, enabled: true },
    'nuoku-vip': { discountAmount: 0, enabled: false },
    'meiqi-us': { discountAmount: 0.1, enabled: true }
  }
};

test('single query sorts records by discounted final price and groups suppliers in order', () => {
  const engine = createFreightQueryEngine({ storage, discounts });

  const result = engine.queryByWarehouse('ont8');

  assert.equal(result.warehouseCode, 'ONT8');
  assert.deepEqual(
    result.supplierGroups.map((group) => group.supplier.id),
    ['zhedao-w14', 'nuoku-vip', 'meiqi-us']
  );
  assert.equal(result.supplierGroups[0].records[0].channel, '渠道 A');
  assert.equal(result.supplierGroups[0].records[0].finalPrice, 4.1);
  assert.equal(result.supplierGroups[0].records[1].finalPrice, 4.3);
});

test('delivery options are derived from parsed records instead of hardcoded labels', () => {
  const engine = createFreightQueryEngine({ storage, discounts });

  const zhedaoOptions = engine.getDeliveryOptions('zhedao-w14');
  const nuokuOptions = engine.getDeliveryOptions('nuoku-vip');
  const meiqiOptions = engine.getDeliveryOptions('meiqi-us');

  assert.deepEqual(zhedaoOptions, [
    { key: 'shenzhen', label: '深圳', mode: 'shenzhen' },
    { key: 'yiwu', label: '义乌', mode: 'yiwu' }
  ]);
  assert.deepEqual(nuokuOptions, [
    { key: 'shenzhen', label: '华南', mode: 'shenzhen' },
    { key: 'yiwu', label: '华东', mode: 'yiwu' }
  ]);
  assert.deepEqual(meiqiOptions, [
    { key: 'shenzhen', label: '深圳/中山/广州/义乌/苏州', mode: 'shenzhen' },
    { key: 'yiwu', label: '深圳/中山/广州/义乌/苏州', mode: 'yiwu' }
  ]);
});

test('batch query preserves pasted order duplicates and shapes rows as fixed cells', () => {
  const engine = createFreightQueryEngine({ storage, discounts });

  const result = engine.batchQuery({
    supplierId: 'zhedao-w14',
    deliveryOptionKey: 'shenzhen',
    warehouseCodes: ['ONT8', '  ', 'ONT8']
  });

  assert.equal(result.supplierId, 'zhedao-w14');
  assert.equal(result.deliveryOptionKey, 'shenzhen');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].warehouseCode, 'ONT8');
  assert.equal(result.rows[1].warehouseCode, 'ONT8');
  assert.deepEqual(result.rows[0].cells[0], {
    channel: '渠道 A',
    finalPrice: 4.1,
    referenceAging: '10-12天',
    compensationAging: '5天',
    taxStartStandard: '100KG',
    originLabel: '深圳'
  });
});

test('batch query pads shorter rows to a fixed cell width for table alignment', () => {
  const engine = createFreightQueryEngine({ storage, discounts });

  const result = engine.batchQuery({
    supplierId: 'zhedao-w14',
    deliveryOptionKey: 'shenzhen',
    warehouseCodes: ['ONT8', 'LAX9']
  });

  assert.equal(result.columnCount, 2);
  assert.equal(result.rows[0].cells.length, 2);
  assert.equal(result.rows[1].cells.length, 2);
  assert.deepEqual(result.rows[1].cells[0], {
    channel: '渠道 C',
    finalPrice: 4.8,
    referenceAging: '15-18天',
    compensationAging: '6天',
    taxStartStandard: '100KG',
    originLabel: '深圳'
  });
  assert.deepEqual(result.rows[1].cells[1], {
    channel: '',
    finalPrice: null,
    referenceAging: '',
    compensationAging: '',
    taxStartStandard: '',
    originLabel: ''
  });
});

test('batch query uses the selected supplier delivery option when shaping rows', () => {
  const engine = createFreightQueryEngine({ storage, discounts });

  const result = engine.batchQuery({
    supplierId: 'nuoku-vip',
    deliveryOptionKey: 'yiwu',
    warehouseCodes: ['ONT8']
  });

  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].cells, [
    {
      channel: '华东卡派',
      finalPrice: 4.7,
      referenceAging: '14天',
      compensationAging: '8天',
      taxStartStandard: '71KG',
      originLabel: '华东'
    }
  ]);
});

test('negative discount amounts increase the final price', () => {
  const engine = createFreightQueryEngine({
    storage,
    discounts: {
      suppliers: {
        'zhedao-w14': { discountAmount: -0.2, enabled: true }
      }
    }
  });

  const result = engine.queryByWarehouse('ONT8');

  assert.equal(result.supplierGroups[0].records[0].finalPrice, 4.5);
  assert.equal(result.supplierGroups[0].records[1].finalPrice, 4.7);
});

test('disabled discounts ignore nonzero discount amounts and preserve parsed prices', () => {
  const engine = createFreightQueryEngine({
    storage,
    discounts: {
      suppliers: {
        'zhedao-w14': { discountAmount: 0.5, enabled: false }
      }
    }
  });

  const result = engine.queryByWarehouse('ONT8');

  assert.equal(result.supplierGroups[0].records[0].finalPrice, 4.3);
  assert.equal(result.supplierGroups[0].records[1].finalPrice, 4.5);
});
