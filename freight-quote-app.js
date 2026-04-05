const DEFAULT_BATCH_ROWS = 8;
const HOT_WAREHOUSE_CODES = [
  'AVP1',
  'CLT2',
  'FWA4',
  'IND9',
  'SBD1',
  'ABE8',
  'LGB8',
  'LAS1',
  'RDU2',
  'LAX9',
  'GYR2',
  'RMN3',
  'FTW1',
  'ONT8',
  'SCK4',
  'GYR3',
  'PSP3'
];

const state = {
  meta: null,
  supplierFiles: {},
  supplierStatus: {},
  isLoadingMeta: false,
  batch: {
    supplierId: '',
    deliveryOptionKey: '',
    warehouseCodes: Array.from({ length: DEFAULT_BATCH_ROWS }, () => ''),
    result: null,
    status: { tone: 'ok', message: '把 Excel 里的仓库代码列直接粘贴进左侧第一列，然后点击计算。' },
    running: false
  },
  comparison: {
    warehouseCode: '',
    result: null,
    status: { tone: 'ok', message: '输入一个仓库代码后查询，各家物流会继续按升序排列。' },
    running: false
  }
};

const elements = {
  banner: document.getElementById('meta-banner'),
  summaryGrid: document.getElementById('summary-grid'),
  supplierPanel: document.getElementById('supplier-panel'),
  batchRoot: document.getElementById('batch-query-root'),
  comparisonRoot: document.getElementById('comparison-root')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeWarehouseCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function formatDateTime(value) {
  if (!value) {
    return '未上传';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
    return '';
  }

  return Number(value).toFixed(2);
}

function getSuppliers() {
  return Array.isArray(state.meta?.suppliers) ? state.meta.suppliers : [];
}

function getSupplierById(supplierId) {
  return getSuppliers().find((supplier) => supplier.id === supplierId) || null;
}

function getSelectedDeliveryOptions() {
  return getSupplierById(state.batch.supplierId)?.deliveryOptions || [];
}

function createEmptyBatchCell() {
  return {
    finalPrice: null,
    channel: '',
    originLabel: '',
    referenceAging: '',
    compensationAging: '',
    taxStartStandard: ''
  };
}

function ensureBatchState() {
  const suppliers = getSuppliers();

  if (!state.batch.supplierId || !getSupplierById(state.batch.supplierId)) {
    state.batch.supplierId = suppliers[0]?.id || '';
  }

  const deliveryOptions = getSelectedDeliveryOptions();
  if (!deliveryOptions.some((option) => option.key === state.batch.deliveryOptionKey)) {
    state.batch.deliveryOptionKey = deliveryOptions[0]?.key || '';
  }

  if (!Array.isArray(state.batch.warehouseCodes)) {
    state.batch.warehouseCodes = [];
  }

  while (state.batch.warehouseCodes.length < DEFAULT_BATCH_ROWS) {
    state.batch.warehouseCodes.push('');
  }
}

function setBanner(message, tone = 'ok') {
  elements.banner.textContent = message;
  elements.banner.className = tone === 'ok' ? 'banner' : `banner ${tone}`;
}

function setSupplierStatus(supplierId, message, tone = 'ok') {
  state.supplierStatus[supplierId] = { message, tone };
  renderSupplierPanel();
}

function setBatchStatus(message, tone = 'ok') {
  state.batch.status = { message, tone };
  renderBatchSection();
}

function setComparisonStatus(message, tone = 'ok') {
  state.comparison.status = { message, tone };
  renderComparisonSection();
}

async function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('文件读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options
  });
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload?.message || '请求失败。');
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function fetchMeta() {
  state.isLoadingMeta = true;

  try {
    const payload = await fetchJson('/api/freight/meta');
    state.meta = payload;
    ensureBatchState();

    if (payload.hasDataset) {
      const activeSuppliers = getSuppliers()
        .filter((supplier) => supplier.hasDataset)
        .map((supplier) => supplier.name)
        .join(' / ');
      setBanner(`当前已生效 ${payload.activeSupplierCount || 0} 家物流商：${activeSuppliers || '暂无'}。上传会按供应商入口独立覆盖。`);
    } else {
      setBanner('当前还没有生效报价数据，请先上传赤道、纽酷或美琦报价表。', 'warn');
    }

    renderAll();
  } catch (error) {
    setBanner(error.message || '当前报价数据无法读取，请确认本地服务已启动。', 'danger');
    renderAll();
  } finally {
    state.isLoadingMeta = false;
  }
}

async function saveDiscount(supplierId) {
  const supplier = getSupplierById(supplierId);
  if (!supplier) {
    return;
  }

  const amountInput = document.querySelector(`[data-role="discountAmount"][data-supplier-id="${supplierId}"]`);
  const enabledInput = document.querySelector(`[data-role="discountEnabled"][data-supplier-id="${supplierId}"]`);

  const discountAmount = Number(amountInput?.value || 0);
  const enabled = Boolean(enabledInput?.checked);

  setSupplierStatus(supplierId, '正在保存优惠金额...', 'warn');

  try {
    const payload = await fetchJson('/api/freight/discounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supplierId, discountAmount, enabled })
    });

    if (state.meta) {
      const target = getSupplierById(supplierId);
      if (target) {
        target.discount = payload.discount;
      }
    }

    setSupplierStatus(supplierId, '优惠金额已保存，后续查询会按当前设置计算。', 'ok');

    if (state.batch.result || state.comparison.result) {
      await fetchMeta();
    } else {
      renderSupplierPanel();
    }
  } catch (error) {
    setSupplierStatus(supplierId, error.message || '优惠金额保存失败。', 'danger');
  }
}

async function uploadSupplierWorkbook(supplierId) {
  const supplier = getSupplierById(supplierId);
  const file = state.supplierFiles[supplierId];

  if (!supplier) {
    return;
  }

  if (!file) {
    setSupplierStatus(supplierId, `请先选择${supplier.name}报价表。`, 'warn');
    return;
  }

  setSupplierStatus(supplierId, `正在上传${supplier.name}报价表...`, 'warn');

  try {
    const contentBase64 = await readFileAsBase64(file);
    const payload = await fetchJson('/api/freight/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        supplierId,
        filename: file.name,
        contentBase64
      })
    });

    state.supplierFiles[supplierId] = null;
    state.batch.result = null;
    state.comparison.result = null;
    setSupplierStatus(supplierId, payload.message || `${supplier.name}报价已更新。`, 'ok');
    await fetchMeta();
  } catch (error) {
    const level = error.payload?.level;
    const tone = level === 'structure' || level === 'sheet' || level === 'template' ? 'warn' : 'danger';
    setSupplierStatus(supplierId, error.message || '报价表上传失败。', tone);
  }
}

function parseWarehousePaste(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((item) => normalizeWarehouseCode(item))
    .filter(Boolean);
}

function setBatchWarehouseValue(index, value) {
  ensureBatchState();
  state.batch.warehouseCodes[index] = normalizeWarehouseCode(value);
  state.batch.result = null;
}

function handleBatchPaste(index, event) {
  const text = event.clipboardData?.getData('text');
  const rows = parseWarehousePaste(text);
  if (!rows.length) {
    return;
  }

  ensureBatchState();
  const nextCodes = [...state.batch.warehouseCodes];
  rows.forEach((warehouseCode, offset) => {
    nextCodes[index + offset] = warehouseCode;
  });
  state.batch.warehouseCodes = nextCodes;
  state.batch.result = null;
  renderBatchSection();
  event.preventDefault();
}

async function runBatchQuery() {
  ensureBatchState();

  if (!state.batch.supplierId) {
    setBatchStatus('请先选择物流商。', 'warn');
    return;
  }

  if (!state.batch.deliveryOptionKey) {
    setBatchStatus('请先选择交货仓库。', 'warn');
    return;
  }

  const warehouseCodes = state.batch.warehouseCodes.map((item) => normalizeWarehouseCode(item)).filter(Boolean);
  if (!warehouseCodes.length) {
    setBatchStatus('先在第一列粘贴或输入仓库代码，再点击计算。', 'warn');
    return;
  }

  state.batch.running = true;
  setBatchStatus(`正在计算 ${warehouseCodes.length} 个仓库代码...`, 'warn');
  renderBatchSection();

  try {
    const payload = await fetchJson('/api/freight/batch-query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        supplierId: state.batch.supplierId,
        deliveryOptionKey: state.batch.deliveryOptionKey,
        warehouseCodes
      })
    });

    state.batch.warehouseCodes = warehouseCodes;
    state.batch.result = payload;
    setBatchStatus(`已完成 ${warehouseCodes.length} 个仓库代码的批量查询。`, 'ok');
  } catch (error) {
    state.batch.result = null;
    setBatchStatus(error.message || '批量查询失败，请稍后重试。', 'danger');
  } finally {
    state.batch.running = false;
    renderBatchSection();
  }
}

async function runComparisonQuery() {
  const warehouseCode = normalizeWarehouseCode(state.comparison.warehouseCode);
  state.comparison.warehouseCode = warehouseCode;
  renderComparisonSection();

  if (!warehouseCode) {
    setComparisonStatus('请先输入仓库代码。', 'warn');
    return;
  }

  state.comparison.running = true;
  setComparisonStatus(`正在查询 ${warehouseCode}...`, 'warn');
  renderComparisonSection();

  try {
    const payload = await fetchJson(`/api/freight/query?warehouse=${encodeURIComponent(warehouseCode)}`);
    state.comparison.result = payload;

    if (payload.totalCount) {
      setComparisonStatus(`已查询到 ${warehouseCode} 的 ${payload.totalCount} 条渠道结果。`, 'ok');
    } else {
      setComparisonStatus(`没有找到 ${warehouseCode} 的可用渠道结果。`, 'warn');
    }
  } catch (error) {
    state.comparison.result = null;
    setComparisonStatus(error.message || '查询失败，请稍后重试。', 'danger');
  } finally {
    state.comparison.running = false;
    renderComparisonSection();
  }
}

function renderSummary() {
  const meta = state.meta;
  const cards = [
    {
      label: '已生效物流商',
      value: meta?.activeSupplierCount ?? 0
    },
    {
      label: '覆盖仓库代码',
      value: meta?.totalWarehouseCount ?? 0
    },
    {
      label: '当前渠道记录',
      value: meta?.totalRecordCount ?? 0
    }
  ];

  elements.summaryGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card">
          <strong>${escapeHtml(card.value)}</strong>
          <span>${escapeHtml(card.label)}</span>
        </article>
      `
    )
    .join('');
}

function renderSupplierPanel() {
  const suppliers = getSuppliers();

  elements.supplierPanel.innerHTML = suppliers
    .map((supplier) => {
      const discount = supplier.discount || { discountAmount: 0, enabled: false };
      const status = state.supplierStatus[supplier.id] || {
        message: supplier.hasDataset
          ? `当前生效文件：${supplier.sourceFilename || '已上传'}`
          : `等待选择${supplier.name}报价表。`,
        tone: supplier.hasDataset ? 'ok' : 'warn'
      };

      return `
        <article class="supplier-card">
          <div class="supplier-top">
            <div>
              <h3>${escapeHtml(supplier.name)}</h3>
              <div class="supplier-meta">
                <div>更新时间：${escapeHtml(formatDateTime(supplier.uploadedAt))}</div>
                <div>当前文件：${escapeHtml(supplier.sourceFilename || '未上传')}</div>
                <div>渠道记录：${escapeHtml(supplier.recordCount || 0)} 条，仓库代码：${escapeHtml(supplier.warehouseCount || 0)} 个</div>
              </div>
            </div>
            <span class="badge ${supplier.hasDataset ? 'live' : ''}">${supplier.hasDataset ? '当前生效中' : '等待上传'}</span>
          </div>

          <div class="field-row">
            <label for="discount-${supplier.id}">优惠金额</label>
            <div class="discount-grid">
              <input
                class="number-input"
                id="discount-${supplier.id}"
                type="number"
                step="0.01"
                value="${escapeHtml(discount.discountAmount ?? 0)}"
                data-role="discountAmount"
                data-supplier-id="${escapeHtml(supplier.id)}"
                placeholder="例如 0.30，负值表示附加费"
              />
              <label class="toggle">
                <input
                  type="checkbox"
                  data-role="discountEnabled"
                  data-supplier-id="${escapeHtml(supplier.id)}"
                  ${discount.enabled ? 'checked' : ''}
                />
                纳入计算
              </label>
            </div>
          </div>

          <div class="field-row">
            <label for="upload-${supplier.id}">上传报价文件</label>
            <input
              class="file-input"
              id="upload-${supplier.id}"
              type="file"
              accept=".xlsx,.xls,.xlsm"
              data-role="uploadInput"
              data-supplier-id="${escapeHtml(supplier.id)}"
            />
          </div>

          <div class="action-row">
            <button
              class="button"
              type="button"
              data-role="uploadButton"
              data-supplier-id="${escapeHtml(supplier.id)}"
              ${state.supplierFiles[supplier.id] ? '' : 'disabled'}
            >
              上传报价
            </button>
            <button
              class="button secondary"
              type="button"
              data-role="discountSave"
              data-supplier-id="${escapeHtml(supplier.id)}"
            >
              保存优惠
            </button>
          </div>

          <div class="status ${escapeHtml(status.tone || 'ok')}">${escapeHtml(status.message || '')}</div>
        </article>
      `;
    })
    .join('');
}

function renderBatchSection() {
  ensureBatchState();

  const suppliers = getSuppliers();
  const deliveryOptions = getSelectedDeliveryOptions();
  const rows = [];
  const computedRows = state.batch.result?.rows || [];
  const totalRows = Math.max(DEFAULT_BATCH_ROWS, state.batch.warehouseCodes.length, computedRows.length);
  const columnCount = Math.max(1, state.batch.result?.columnCount || 1);

  for (let index = 0; index < totalRows; index += 1) {
    const resultRow = computedRows[index] || {
      warehouseCode: state.batch.warehouseCodes[index] || '',
      cells: Array.from({ length: columnCount }, () => createEmptyBatchCell())
    };

    const cells = resultRow.cells || Array.from({ length: columnCount }, () => createEmptyBatchCell());
    const codeValue = state.batch.warehouseCodes[index] || resultRow.warehouseCode || '';

    rows.push(`
      <tr>
        <td class="sticky-cell">
          <textarea
            class="warehouse-input"
            rows="1"
            data-role="batchWarehouse"
            data-index="${index}"
            placeholder="${index === 0 ? '直接粘贴 Excel 仓库代码列' : ''}"
          >${escapeHtml(codeValue)}</textarea>
        </td>
        ${cells
          .map(
            (cell) => `
              <td class="price-cell">${escapeHtml(formatPrice(cell.finalPrice) || '')}</td>
              <td class="channel-cell">${escapeHtml(cell.channel || '')}</td>
            `
          )
          .join('')}
      </tr>
    `);
  }

  elements.batchRoot.innerHTML = `
    <section class="field-group">
      <h3>选择物流商</h3>
      <div class="option-list">
        ${suppliers
          .map(
            (supplier) => `
              <button
                type="button"
                class="pill ${supplier.id === state.batch.supplierId ? 'is-active' : ''}"
                data-role="batchSupplier"
                data-supplier-id="${escapeHtml(supplier.id)}"
              >
                ${escapeHtml(supplier.name)}
              </button>
            `
          )
          .join('')}
      </div>
    </section>

    <section class="field-group">
      <h3>选择交货仓库</h3>
      <div class="option-list">
        ${
          deliveryOptions.length
            ? deliveryOptions
                .map(
                  (option) => `
                    <button
                      type="button"
                      class="pill ${option.key === state.batch.deliveryOptionKey ? 'is-active' : ''}"
                      data-role="batchDelivery"
                      data-delivery-key="${escapeHtml(option.key)}"
                    >
                      ${escapeHtml(option.label)}
                    </button>
                  `
                )
                .join('')
            : '<span class="muted-value">当前这家物流商还没有可用的交货仓库选项，先上传有效报价后再查。</span>'
        }
      </div>
    </section>

    <section class="grid-section">
      <div class="grid-header">
        <h3>仓库代码、单价和渠道名称</h3>
        <button class="button" type="button" id="batch-run-btn" ${state.batch.running ? 'disabled' : ''}>
          ${state.batch.running ? '计算中...' : '计算'}
        </button>
      </div>
      <div class="table-wrap">
        <table class="batch-table">
          <thead>
            <tr>
              <th class="sticky-cell">仓库代码</th>
              ${Array.from({ length: columnCount })
                .map(
                  (_, index) => `
                    <th>单价 ${index + 1}</th>
                    <th>渠道名称 ${index + 1}</th>
                  `
                )
                .join('')}
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
      <div class="status ${escapeHtml(state.batch.status.tone || 'ok')}">${escapeHtml(state.batch.status.message || '')}</div>
    </section>
  `;
}

function renderComparisonSection() {
  const warehouseCode = state.comparison.warehouseCode || '';
  const supplierGroups = state.comparison.result?.supplierGroups || [];

  elements.comparisonRoot.innerHTML = `
    <section class="field-group">
      <div class="comparison-controls">
        <input
          class="text-input"
          id="comparison-input"
          type="text"
          value="${escapeHtml(warehouseCode)}"
          placeholder="输入单个仓库代码，例如 ONT8"
        />
        <button class="button" type="button" id="comparison-run-btn" ${state.comparison.running ? 'disabled' : ''}>
          ${state.comparison.running ? '查询中...' : '查询'}
        </button>
      </div>
      <div class="chip-row" style="margin-top: 14px;">
        ${HOT_WAREHOUSE_CODES.map(
          (code) => `
            <button
              type="button"
              class="chip"
              data-role="hotWarehouseCode"
              data-warehouse-code="${escapeHtml(code)}"
              ${warehouseCode === code ? 'aria-pressed="true"' : ''}
            >
              ${escapeHtml(code)}
            </button>
          `
        ).join('')}
      </div>
      <div class="status ${escapeHtml(state.comparison.status.tone || 'ok')}">${escapeHtml(state.comparison.status.message || '')}</div>
    </section>

    ${
      supplierGroups.length
        ? `
          <section class="comparison-results">
            ${supplierGroups
              .map(
                (group) => `
                  <section class="comparison-column">
                    <header class="comparison-head">
                      <h3>${escapeHtml(group.supplier.name)}</h3>
                      <p>共 ${escapeHtml(group.count)} 条渠道结果，继续按最终单价升序排列。</p>
                    </header>
                    <div class="comparison-list">
                      ${group.records
                        .map(
                          (record) => `
                            <article class="comparison-item">
                              <div class="comparison-item-top">
                                <h4>${escapeHtml(record.channel)}</h4>
                                <span class="rank">#${escapeHtml(record.rank)}</span>
                              </div>
                              <div class="price-line">
                                <strong>${escapeHtml(formatPrice(record.finalPrice) || '-')}</strong>
                                <span class="muted-value">${escapeHtml(record.originLabel || '')}</span>
                              </div>
                              <div class="chip-row">
                                <span class="chip">时效 ${escapeHtml(record.referenceAging || '-')}</span>
                                <span class="chip">起收 ${escapeHtml(record.taxStartStandard || '-')}</span>
                                <span class="chip">理赔 ${escapeHtml(record.compensationAging || '-')}</span>
                              </div>
                            </article>
                          `
                        )
                        .join('')}
                    </div>
                  </section>
                `
              )
              .join('')}
          </section>
        `
        : '<div class="empty-block">查询结果会在这里展示。每家物流商继续独立升序排列，便于横向比价。</div>'
    }
  `;
}

function renderAll() {
  renderSummary();
  renderSupplierPanel();
  renderBatchSection();
  renderComparisonSection();
}

document.addEventListener('click', async (event) => {
  const supplierButton = event.target.closest('[data-role="batchSupplier"]');
  if (supplierButton) {
    state.batch.supplierId = supplierButton.dataset.supplierId || '';
    state.batch.deliveryOptionKey = '';
    state.batch.result = null;
    ensureBatchState();
    renderBatchSection();
    return;
  }

  const deliveryButton = event.target.closest('[data-role="batchDelivery"]');
  if (deliveryButton) {
    state.batch.deliveryOptionKey = deliveryButton.dataset.deliveryKey || '';
    state.batch.result = null;
    renderBatchSection();
    return;
  }

  const uploadButton = event.target.closest('[data-role="uploadButton"]');
  if (uploadButton) {
    await uploadSupplierWorkbook(uploadButton.dataset.supplierId || '');
    return;
  }

  const discountSaveButton = event.target.closest('[data-role="discountSave"]');
  if (discountSaveButton) {
    await saveDiscount(discountSaveButton.dataset.supplierId || '');
    return;
  }

  if (event.target.id === 'batch-run-btn') {
    await runBatchQuery();
    return;
  }

  if (event.target.id === 'comparison-run-btn') {
    await runComparisonQuery();
    return;
  }

  const hotWarehouseButton = event.target.closest('[data-role="hotWarehouseCode"]');
  if (hotWarehouseButton) {
    state.comparison.warehouseCode = hotWarehouseButton.dataset.warehouseCode || '';
    await runComparisonQuery();
  }
});

document.addEventListener('change', async (event) => {
  const uploadInput = event.target.closest('[data-role="uploadInput"]');
  if (uploadInput) {
    const supplierId = uploadInput.dataset.supplierId || '';
    const [file] = uploadInput.files || [];
    state.supplierFiles[supplierId] = file || null;
    setSupplierStatus(
      supplierId,
      file ? `已选择 ${file.name}，点击“上传报价”后开始更新。` : `等待选择${getSupplierById(supplierId)?.name || '物流商'}报价表。`,
      file ? 'ok' : 'warn'
    );
    renderSupplierPanel();
    return;
  }

  const discountInput = event.target.closest('[data-role="discountEnabled"]');
  if (discountInput) {
    await saveDiscount(discountInput.dataset.supplierId || '');
  }
});

document.addEventListener('blur', async (event) => {
  const amountInput = event.target.closest('[data-role="discountAmount"]');
  if (amountInput) {
    await saveDiscount(amountInput.dataset.supplierId || '');
  }
}, true);

document.addEventListener('input', (event) => {
  const batchInput = event.target.closest('[data-role="batchWarehouse"]');
  if (batchInput) {
    const normalizedValue = normalizeWarehouseCode(batchInput.value);
    batchInput.value = normalizedValue;
    setBatchWarehouseValue(Number(batchInput.dataset.index || 0), normalizedValue);
    return;
  }

  if (event.target.id === 'comparison-input') {
    state.comparison.warehouseCode = event.target.value;
  }
});

document.addEventListener('keydown', async (event) => {
  if (event.target.id === 'comparison-input' && event.key === 'Enter') {
    event.preventDefault();
    await runComparisonQuery();
  }
});

document.addEventListener('paste', (event) => {
  const batchInput = event.target.closest('[data-role="batchWarehouse"]');
  if (batchInput) {
    handleBatchPaste(Number(batchInput.dataset.index || 0), event);
  }
});

async function bootstrap() {
  renderAll();

  if (window.location.protocol === 'file:') {
    setBanner('当前页面是直接从本地文件打开的。请先运行 node server.js，再访问 http://127.0.0.1:8787/freight-quote.html 。', 'warn');
    return;
  }

  await fetchMeta();
}

bootstrap();
