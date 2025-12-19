const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const csvPath = path.join(__dirname, '../../data_5050_20251204_2.CSV');
const outputPath = path.join(__dirname, '../stock_master.js');

console.log(`Reading CSV from: ${csvPath}`);

try {
    const buffer = fs.readFileSync(csvPath);
    const content = iconv.decode(buffer, 'EUC-KR');
    const lines = content.split('\n');

    const stockMap = {};
    let count = 0;

    lines.forEach((line, index) => {
        if (index === 0) return; // Skip header
        const parts = line.split(',');
        if (parts.length >= 2) {
            const code = parts[0].trim();
            const name = parts[1].trim();

            // Remove quotes if present
            const cleanCode = code.replace(/["']/g, '');
            const cleanName = name.replace(/["']/g, '');

            if (cleanCode && cleanName) {
                stockMap[cleanName] = cleanCode;
                count++;
            }
        }
    });

    const fileContent = `// Auto-generated from data_5050_20251204_2.CSV
// Total stocks: ${count}

const stockCodeMap = ${JSON.stringify(stockMap, null, 4)};

module.exports = stockCodeMap;
`;

    fs.writeFileSync(outputPath, fileContent, 'utf8');
    console.log(`Successfully generated stock_master.js with ${count} stocks.`);

} catch (error) {
    console.error('Error generating master list:', error);
}
