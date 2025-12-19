const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const TARGET_STOCKS = ['쓰리빌리언', '팸텍', '에스티아이', '삼영엠텍', '이수스페셜티케미컬'];

async function getStockSector(stockName) {
    try {
        // 1. Get Code via Autocomplete API
        // Naver Autocomplete usually accepts UTF-8 URL encoded query
        const searchUrl = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(stockName)}&target=stock`;
        const searchRes = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://finance.naver.com/'
            }
        });

        // Response format usually: { items: [ [ [name, code, market], ... ] ] }
        // Sometimes it returns JSONP logic if callback is provided, but plain GET often returns JSON.
        // Let's inspect response structure safely.

        const data = searchRes.data;
        if (!data.items || !data.items[0] || data.items[0].length === 0) {
            console.log(`[${stockName}] Code not found via API.`);
            return;
        }

        const firstResult = data.items[0][0]; // [name, code, market, ...]
        const code = firstResult[1];
        console.log(`[${stockName}] Code: ${code}`);

        // 2. Get Sector Info from Main Page
        const detailUrl = `https://finance.naver.com/item/main.naver?code=${code}`;
        const detailRes = await axios.get(detailUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
        const detailHtml = iconv.decode(detailRes.data, 'EUC-KR');
        const $detail = cheerio.load(detailHtml);

        let foundSector = false;
        // Search for sector link
        // Common pattern: <a href="/sise/sise_group_detail.naver?type=upjong&no=261">IT서비스</a>
        $detail('a').each((i, el) => {
            const href = $detail(el).attr('href');
            if (href && href.includes('sise_group_detail.naver?type=upjong')) {
                const sectorName = $detail(el).text().trim();
                const sectorNoMatch = href.match(/no=(\d+)/);
                if (sectorNoMatch) {
                    const sectorNo = sectorNoMatch[1];
                    console.log(`[${stockName}] Found Sector: ${sectorName} (Code: ${sectorNo})`);
                    foundSector = true;
                }
            }
        });

        if (!foundSector) {
            console.log(`[${stockName}] Sector not found on page.`);
        }

    } catch (e) {
        console.error(`[${stockName}] Error: ${e.message}`);
    }
}

async function run() {
    for (const stock of TARGET_STOCKS) {
        await getStockSector(stock);
    }
}

run();
