const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const DATA_DIR = 'C:/Users/user/ארומה מידע';
for (const f of ['בתי העסק-כל הלקוחות (2).csv', 'עיסקאות_ שם המשלם-ראשי.csv']) {
  const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true, bom: true });
  console.log(`\n=== ${f} ===`);
  console.log(`rows: ${rows.length}`);
  console.log(`headers (with byte length):`);
  Object.keys(rows[0] || {}).forEach((k, i) => {
    console.log(`  [${i}] len=${Buffer.byteLength(k, 'utf8')} "${k}"`);
  });
  console.log(`first row sample:`, Object.entries(rows[0] || {}).slice(0, 3));
}
