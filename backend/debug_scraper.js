const { fetchStockPrice } = require('./market');
const axios = require('axios');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

async function debugStock(name) {
    console.log(`\n=== Debugging ${name} ===`);
    const data = await fetchStockPrice(name);
    console.log('Parsed Data:', data);

    // Manual inspect of the HTML to see where "거래대금" is
    const url = `https://finance.naver.com/item/main.naver?code=${data.code}`;
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const decoded = iconv.decode(response.data, 'EUC-KR');
    const $ = cheerio.load(decoded);

    // Find all '거래대금' occurrences
    console.log('--- Raw HTML Inspection ---');
    $('table tr').each((i, row) => {
        const thText = $(row).find('th').text().trim();
        if (thText.includes('거래대금')) {
            const tdText = $(row).find('td').text().trim();
            console.log(`Found '거래대금' row: TH='${thText}', TD='${tdText}'`);
        }
    });
}

(async () => {
    await debugStock('두산에너빌리티');
    await debugStock('로보티즈');
})();
