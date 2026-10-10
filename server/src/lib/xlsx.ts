import { strToU8, zipSync } from 'fflate';

/*
 * A small Excel (.xlsx) writer: one sheet, a bold frozen header row with a filter, column widths,
 * text and number cells. Enough for admin exports, without a spreadsheet library.
 * Text cells stay text in Excel (a 13-digit barcode is not turned into 5,70202E+12).
 */

export interface XlsxColumn {
  header: string;
  /** width in characters */
  width: number;
  /** 'number' cells are written as numbers with a thousands separator; everything else as text */
  kind?: 'text' | 'number';
}

export type XlsxCell = string | number | null | undefined;

const esc = (s: string) =>
  s
    // characters XML 1.0 does not allow
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A, B, …, Z, AA, AB, … */
export function columnName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const NS = 'http://schemas.openxmlformats.org';
const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function textCell(ref: string, value: string, style = 0) {
  const space = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t${space}>${esc(value)}</t></is></c>`;
}

export function xlsx(sheetName: string, columns: XlsxColumn[], rows: XlsxCell[][]): Uint8Array {
  const last = columnName(columns.length - 1);
  const header = `<row r="1">${columns.map((c, i) => textCell(`${columnName(i)}1`, c.header, 1)).join('')}</row>`;
  const body = rows
    .map((row, r) => {
      const n = r + 2;
      const cells = columns
        .map((col, i) => {
          const v = row[i];
          const ref = `${columnName(i)}${n}`;
          if (v === null || v === undefined || v === '') return '';
          if (col.kind === 'number' && typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="2"><v>${v}</v></c>`;
          return textCell(ref, String(v));
        })
        .join('');
      return `<row r="${n}">${cells}</row>`;
    })
    .join('');
  const sheet =
    `${head}<worksheet xmlns="${NS}/spreadsheetml/2006/main">` +
    // printed: landscape, all columns on one page width
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="A1:${last}${rows.length + 1}"/>` +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    `</worksheet>`;

  const files: Record<string, string> = {
    '[Content_Types].xml':
      `${head}<Types xmlns="${NS}/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`,
    '_rels/.rels':
      `${head}<Relationships xmlns="${NS}/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
    'xl/workbook.xml':
      `${head}<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${esc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
      `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${esc(sheetName.slice(0, 31)).replace(/'/g, "''")}'!$A$1:$${last}$${rows.length + 1}</definedName></definedNames>` +
      `</workbook>`,
    'xl/_rels/workbook.xml.rels':
      `${head}<Relationships xmlns="${NS}/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
    'xl/styles.xml':
      `${head}<styleSheet xmlns="${NS}/spreadsheetml/2006/main">` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="3">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
      `</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`,
    'xl/worksheets/sheet1.xml': sheet,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
}
