export function getWorkbookSheetMeta(workbook) {
  const entries = workbook.Workbook?.Sheets || [];
  return new Map(entries.map((entry) => [entry.name, entry.Hidden ?? 0]));
}

export function getVisibleSheetNames(workbook) {
  const meta = getWorkbookSheetMeta(workbook);
  return workbook.SheetNames.filter((name) => (meta.get(name) ?? 0) === 0);
}

export function getVisibleSheets(workbook) {
  return getVisibleSheetNames(workbook).map((name) => [name, workbook.Sheets[name]]);
}
