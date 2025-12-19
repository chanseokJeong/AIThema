const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const TARGET_STOCKS = ['쓰리빌리언', '팸텍', '에스티아이', '삼영엠텍', '이수스페셜티케미컬', '삼성제약', 'HD현대마린엔진'];

async function crawlAllSectors() {
    console.log("Crawling all sectors...");
    const url = 'https://finance.naver.com/sise/sise_group.naver?type=upjong';
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const html = iconv.decode(response.data, 'EUC-KR');
    const $ = cheerio.load(html);

    const sectors = [];
    $('#contentarea_left table.type_1 tr').each((i, el) => {
        const atag = $(el).find('td a');
        if (atag.length > 0) {
            const name = atag.text().trim();
            const href = atag.attr('href');
            const code = href.split('no=')[1];
            sectors.push({ name, code });
        }
    });

    console.log(`Found ${sectors.length} sectors. checking stocks...`);

    const stockMap = {}; // stockName -> sectorName

    // We can't crawl 79 sectors quickly without getting blocked probably.
    // But we can try the top sectors or just limit concurrency.
    // Actually, Tima missing stocks are likely in Specific sectors.
    // Let's crawl ALL sectors sequentially to be safe. It takes time but it's reliable.

    for (const sector of sectors) {
        // console.log(`Checking sector: ${sector.name} (${sector.code})`);
        try {
            const sectorUrl = `https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=${sector.code}`;
            const res = await axios.get(sectorUrl, { responseType: 'arraybuffer' });
            const sHtml = iconv.decode(res.data, 'EUC-KR');
            const s$ = cheerio.load(sHtml);

            s$('table.type_5 tr').each((j, sel) => {
                const satag = s$(sel).find('td.name a');
                if (satag.length > 0) {
                    const stockName = satag.text().trim();
                    if (TARGET_STOCKS.includes(stockName)) {
                        console.log(`[FOUND] ${stockName} -> ${sector.name} (${sector.code})`);
                        stockMap[stockName] = { sector: sector.name, code: sector.code };
                    }
                }
            });

            // Nice delay to be polite
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (err) {
            console.error(`Error in sector ${sector.name}:`, err.message);
        }
    }

    console.log("--------------------------------Result--------------------------------");
    TARGET_STOCKS.forEach(stock => {
        if (stockMap[stock]) {
            console.log(`${stock}: ${stockMap[stock].sector} (${stockMap[stock].code})`);
        } else {
            console.log(`${stock}: Not found in any sector.`);
        }
    });
}

crawlAllSectors();
