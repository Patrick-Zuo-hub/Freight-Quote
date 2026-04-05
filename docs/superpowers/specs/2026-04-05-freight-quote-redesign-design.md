# Freight Quote Redesign Design

Date: 2026-04-05

## Goal

Upgrade the current local freight quote tool into a more stable and easier-to-use single-machine app that:

- keeps the existing `node server.js` local workflow
- preserves the current single-warehouse comparison behavior
- ignores hidden Excel sheets during template detection and calculation
- clears a supplier's active dataset if a new upload fails
- adds layered upload errors that clearly explain where parsing failed
- adds per-supplier discount settings that can be enabled or disabled
- adds a new `批量查询` workspace for pasting warehouse-code columns from Excel
- refreshes the UI into a cleaner Apple-like visual language
- prepares the project for local git version control and future GitHub publishing

## Scope

In scope:

- complete the missing `server.js`
- refactor parsing and query logic into clearer modules
- support hidden-sheet filtering
- support layered upload errors
- support per-supplier discount settings
- support `批量查询`
- preserve and refresh `多渠道比价`
- add repository-ready files for version control and sharing

Out of scope:

- cloud deployment
- authentication and multi-user permissions
- address or zip-code based pricing
- rewriting parser logic into a generic DSL for all future suppliers
- automatic creation of a remote GitHub repository without user-provided destination

## Product Behavior

### 1. Local runtime

The app remains a local Node.js application.

Expected startup:

```bash
cd "/Users/patrick/Documents/Freight Quote"
node server.js
```

The app serves the page and APIs from the same local process.

### 2. Supplier uploads

Each supplier keeps a dedicated upload entry:

- 赤道国际
- 纽酷国际
- 美琦国际

Upload behavior:

- the app identifies which supplier template the workbook belongs to
- hidden sheets are fully ignored during identification and parsing
- if the upload succeeds, that supplier's active dataset is replaced
- if the upload fails, that supplier's previous active dataset is cleared
- the UI clearly shows that the supplier currently has no active pricing data until a valid file is uploaded again

### 3. Discount settings

Each supplier gets a discount control on the page:

- `discountAmount`
- `enabled`

Meaning:

- final price = original price - discount amount
- if `discountAmount` is positive, the final price is lower
- if `discountAmount` is negative, the final price is higher
- if `enabled` is off, original parsed prices are used

Discount settings are stored separately from imported pricing records so that weekly workbook replacements do not erase them.

### 4. 批量查询

The new `批量查询` accordion is a workspace for one supplier at a time.

Flow:

1. user selects one supplier
2. user selects one delivery-origin option for that supplier
3. user pastes a warehouse-code column directly into the first column of the results table
4. user clicks the `计算` button in the header row of the results section
5. results are filled for each pasted warehouse code

Rules:

- only the selected supplier is queried
- only the selected delivery-origin mapping is used
- results for each warehouse code are sorted by final price ascending
- the output table uses a fixed-column layout:
  - `仓库代码`
  - `单价 1`
  - `渠道 1`
  - `单价 2`
  - `渠道 2`
  - ...
- rows with fewer matched channels leave trailing cells empty
- the first column stays frozen while the rest of the table scrolls horizontally
- copy/paste back to Excel should naturally split price and channel into separate columns
- blank pasted rows are removed
- pasted order is preserved
- duplicate warehouse codes are preserved as entered

### 5. 多渠道比价

The existing single-warehouse comparison remains, with a visual refresh only.

Flow:

1. user enters one warehouse code
2. results are grouped by supplier
3. each supplier column remains sorted by ascending final price

Displayed fields stay conceptually the same:

- channel
- final price
- aging
- tax start requirement
- origin labels

The comparison view also respects each supplier's current discount configuration.

## UI Design

### Layout

The page uses a cleaner Apple-inspired language:

- brighter background
- softer borders and shadows
- more whitespace
- restrained palette
- simple typography hierarchy

High-level page structure:

- left panel: supplier upload cards and discount controls
- right panel: two accordions stacked vertically
  - `批量查询`
  - `多渠道比价`

### 批量查询 layout

Within `批量查询`, sections are ordered top-to-bottom:

1. `选择物流商`
2. `选择交货仓库`
3. `仓库代码、单价和渠道名称`

Within the third section:

- the section title sits on the left
- the `计算` button sits on the right
- below that is the results grid
- the first column acts as the paste target for warehouse codes

### Delivery-origin options

The UI does not hardcode all delivery-origin choices globally.

Instead:

- each supplier exposes dynamic UI options based on parsed data
- the backend maps user-facing delivery options to supplier-specific raw origin labels

Examples:

- 赤道 may expose `深圳`, `义乌`
- 纽酷 may expose values derived from `华南`, `华东`, `中山`
- 美琦 may expose mapped values from merged origin labels

## Architecture

The implementation keeps the current tech stack but separates responsibilities into clearer modules.

### 1. `server.js`

Responsibilities:

- serve static files
- define API routes
- normalize success and error responses
- wire together parser/store/query modules

Primary APIs:

- `GET /api/freight/meta`
- `POST /api/freight/upload`
- `GET /api/freight/query?warehouse=...`
- `POST /api/freight/batch-query`
- `GET /api/freight/discounts`
- `POST /api/freight/discounts`

### 2. `lib/freight-quote-store.js`

Responsibilities:

- manage `current.json`
- manage uploaded workbook files
- manage clearing/replacing supplier datasets
- manage `discounts.json`

### 3. `lib/freight-parsers/`

Planned modules:

- `index.js`
- `shared.js`
- `zhedao.js`
- `nuoku.js`
- `meiqi.js`

Responsibilities:

- hidden-sheet filtering
- template detection
- supplier-specific parsing
- structure validation
- normalized record output

### 4. `lib/freight-query-engine.js`

Responsibilities:

- single-warehouse comparison
- batch-query shaping
- delivery-origin option generation
- discount application
- ascending sorting and fixed-column output

### 5. Frontend files

- `freight-quote.html`
- `freight-quote-app.js`

Responsibilities:

- uploads
- discount controls
- batch-query interactions
- single-warehouse comparison interactions
- error presentation

### 6. Repository metadata

Additional project files should make the app easy to clone and run:

- `.gitignore`
- `README.md`

Responsibilities:

- ignore runtime data, uploads, and local-only brainstorming artifacts
- document install, startup, test, and local usage steps
- explain required files and expected local data paths
- make the project ready for local git history and future GitHub publishing

## Data Model

### Active pricing storage

Primary dataset file:

- `data/freight/current.json`

Structure remains supplier-centered, with normalized records for querying.

Each record should continue to preserve:

- supplier identity
- channel
- warehouse code
- parsed price fields
- origin labels
- aging
- tax start standard

### Discount storage

New config file:

- `data/freight/discounts.json`

Suggested shape:

```json
{
  "version": 1,
  "suppliers": {
    "zhedao-w14": {
      "discountAmount": 0.3,
      "enabled": true,
      "updatedAt": "2026-04-05T10:00:00.000Z"
    }
  }
}
```

### Delivery-origin metadata

The query layer derives delivery options from parsed records.

Each supplier option should preserve:

- a stable UI option key
- a user-facing label
- the internal matching logic used to filter records

This avoids hardcoding every origin rule in the frontend.

## Hidden-Sheet Handling

Rule: hidden sheets are treated as nonexistent.

Implementation behavior:

- ignore hidden sheets during template detection
- ignore hidden sheets during required-sheet checks
- ignore hidden sheets during parsing

If all otherwise-parseable sheets are hidden, return a sheet-level error such as:

`已识别为“某某物流”报价单，但当前可用于计算的工作表均为隐藏状态，已忽略，请检查报价表。`

The parser code for those sheets still exists; only runtime selection excludes them.

## Error Model

Uploads return structured, layered errors.

### Error levels

1. `template`
   - unsupported workbook
   - wrong upload entry for identified supplier

2. `sheet`
   - required visible sheet missing
   - all relevant sheets hidden

3. `structure`
   - required header/column/region not found
   - visible sheet exists but expected positions do not match current rules

4. `import`
   - workbook recognized but no usable pricing records parsed
   - supplier dataset cleared after failed replacement

### Response shape

Suggested error payload:

```json
{
  "ok": false,
  "code": "MISSING_REQUIRED_SHEET",
  "level": "sheet",
  "message": "模板已识别，但缺少关键工作表：TK直送",
  "details": {
    "supplierId": "meiqi-us",
    "sheetName": "TK直送"
  }
}
```

Suggested success payload:

```json
{
  "ok": true,
  "message": "美琦国际报价已更新。",
  "supplier": {
    "id": "meiqi-us",
    "name": "美琦国际"
  },
  "meta": {}
}
```

## File and Module Changes

Planned file set:

- `/Users/patrick/Documents/Freight Quote/.gitignore`
- `/Users/patrick/Documents/Freight Quote/README.md`
- `/Users/patrick/Documents/Freight Quote/server.js`
- `/Users/patrick/Documents/Freight Quote/lib/freight-quote-store.js`
- `/Users/patrick/Documents/Freight Quote/lib/freight-query-engine.js`
- `/Users/patrick/Documents/Freight Quote/lib/freight-parsers/index.js`
- `/Users/patrick/Documents/Freight Quote/lib/freight-parsers/shared.js`
- `/Users/patrick/Documents/Freight Quote/lib/freight-parsers/zhedao.js`
- `/Users/patrick/Documents/Freight Quote/lib/freight-parsers/nuoku.js`
- `/Users/patrick/Documents/Freight Quote/lib/freight-parsers/meiqi.js`
- `/Users/patrick/Documents/Freight Quote/freight-quote.html`
- `/Users/patrick/Documents/Freight Quote/freight-quote-app.js`
- `/Users/patrick/Documents/Freight Quote/data/freight/current.json`
- `/Users/patrick/Documents/Freight Quote/data/freight/discounts.json`

## Testing Strategy

### Parser tests

Verify:

- hidden sheets are ignored
- valid workbooks still parse
- missing required visible sheets return sheet-level errors
- missing headers or columns return structure-level errors

### Query tests

Verify:

- single-warehouse comparison remains ascending
- batch-query output uses fixed columns
- delivery-origin filtering is correct
- discount enable/disable works
- negative discount amounts increase final price

### API tests

Verify:

- successful uploads replace supplier data
- failed uploads clear supplier data
- discounts read/write correctly
- response formats stay consistent

### Frontend verification

Verify:

- warehouse-code column pastes correctly
- first column stays frozen
- copied batch results split into Excel columns naturally
- `多渠道比价` remains readable and familiar

### Repository verification

Verify:

- the project can be initialized as a git repository cleanly
- `.gitignore` excludes generated files and uploads
- `README.md` lets another user install dependencies and start the app locally

## Risks and Mitigations

### 1. Supplier-origin mapping ambiguity

Risk:

- raw origin labels vary by supplier and workbook version

Mitigation:

- keep backend-owned mapping logic
- preserve raw labels in normalized records

### 2. Upload failure now clears old data

Risk:

- a bad weekly upload temporarily removes that supplier from comparison

Mitigation:

- surface this clearly in upload status and meta cards
- make the error specific enough to fix quickly

### 3. Batch-query copy behavior

Risk:

- if table shape changes per row, Excel paste becomes messy

Mitigation:

- fixed output columns only
- empty trailing cells for shorter result sets

## Recommendation

Proceed with a modular refactor while keeping the current local stack.

This is the best balance between:

- reusing current work
- supporting the new UI and query features
- improving parser resilience
- keeping future logistics-supplier additions manageable
- making the finished project ready to version and publish
