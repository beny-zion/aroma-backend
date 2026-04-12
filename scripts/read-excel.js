const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', 'ארומה פלוס.xlsx');

try {
  const workbook = XLSX.readFile(filePath);

  console.log('=== שמות הגיליונות ===');
  console.log(workbook.SheetNames);
  console.log('');

  // עבור על כל גיליון
  workbook.SheetNames.forEach(sheetName => {
    console.log(`\n=== גיליון: ${sheetName} ===\n`);

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // הדפס את 20 השורות הראשונות
    data.slice(0, 20).forEach((row, index) => {
      console.log(`שורה ${index + 1}:`, row);
    });

    console.log(`\n... סה"כ ${data.length} שורות בגיליון`);
  });

} catch (error) {
  console.error('שגיאה בקריאת הקובץ:', error.message);
}
