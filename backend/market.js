const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const stockCodeMap = require('./stock_master');

// Cache for dynamically found codes (still useful for fallbacks)
const dynamicCodeCache = {};

async function getStockCode(name) {
    // 1. Check master list (O(1) lookup)
    if (stockCodeMap[name]) return stockCodeMap[name];

    // 2. Check dynamic cache
    if (dynamicCodeCache[name]) return dynamicCodeCache[name];

    // 3. Search Naver Finance (Fallback)
    try {
        const searchUrl = `https://finance.naver.com/search/searchList.naver?query=${encodeURIComponent(name, 'EUC-KR')}`;
        const response = await axios.get(searchUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const decodedData = iconv.decode(response.data, 'EUC-KR');
        const $ = cheerio.load(decodedData);

        let code = null;
        $('.tbl_search .tit a').each((i, el) => {
            if (code) return;
            const href = $(el).attr('href');
            const match = href.match(/code=(\d+)/);
            if (match) {
                code = match[1];
            }
        });

        if (code) {
            console.log(`Found code for ${name}: ${code}`);
            dynamicCodeCache[name] = code;
            return code;
        }
    } catch (error) {
        console.error(`Failed to search code for ${name}:`, error.message);
    }

    console.warn(`Stock code not found for: ${name}`);
    return null;
}

async function fetchStockPrice(name, code = null) {
    if (!code) {
        code = await getStockCode(name);
    }

    if (!code) {
        return { name, rate: 0, amount: 0, price: 0, time: '' };
    }

    // ⭐ 네이버 실시간 API 우선 사용 (빠르고 정확한 거래대금, NXT 시세 지원)
    try {
        const { fetchStockByCode } = require('./naver_api');
        const apiData = await fetchStockByCode(code);
        if (apiData) {
            // console.log(`  [API] ${name}: ${apiData.rate}% (${apiData.amount}억)`);
            if (name.includes('두산에너빌리티')) {
                console.log(`  [API SUCCESS] ${name}: Rate ${apiData.rate}, Amount ${apiData.amount}, Market ${apiData.marketStatus}`);
            }
            return {
                name: name,
                code: code,
                rate: apiData.rate,
                amount: apiData.amount, // 억 단위
                price: apiData.price,
                open: apiData.open,
                high: apiData.high,
                low: apiData.low,
                time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                marketStatus: apiData.marketStatus, // PRE_MARKET, REGULAR, AFTER_MARKET, CLOSED
                nxtInfo: apiData.nxtInfo // NXT 상세 정보 (선택적 사용)
            };
        }
    } catch (apiError) {
        console.warn(`API failed for ${name}, falling back to scraping:`, apiError.message);
    }

    if (name.includes('두산에너빌리티')) {
        console.log(`  [FALLBACK SCRAPING] ${name}`);
    }

    // Fallback: HTML 스크래핑
    const url = `https://finance.naver.com/item/main.naver?code=${code}`;

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const decodedData = iconv.decode(response.data, 'EUC-KR');
        const $ = cheerio.load(decodedData);

        // 1. Scrape Rate (등락률) & Price
        let rate = 0;
        const rateElement = $('.no_exday').first();
        // Check both icon classes and text color classes (Naver uses nv01/nv02 for negative)
        const isUp = rateElement.find('.ico.up, .red01, .red02').length > 0;
        const isDown = rateElement.find('.ico.down, .nv01, .nv02').length > 0;
        const blindElements = rateElement.find('.blind');

        let price = 0;

        if (blindElements.length >= 2) {
            const priceString = blindElements.eq(0).text().replace(/,/g, '');
            price = parseInt(priceString, 10);

            const rateString = blindElements.eq(1).text();
            rate = parseFloat(rateString);
            if (isDown) rate = -rate;
        }

        // 2. Scrape Transaction Amount (거래대금)
        let amount = 0;
        let open = 0;
        let high = 0;
        let low = 0;

        $('table tr').each((i, row) => {
            const $row = $(row);
            const thText = $row.find('th').text();

            // 거래대금
            if (thText.includes('거래대금')) {
                const em = $row.find('td em');
                if (em.length > 0) {
                    const amountText = em.text().trim().replace(/[,억]/g, '');
                    // 거래대금은 보통 백만 단위이므로 억 단위로 변환 (나누기 100)
                    // 단, '억' 글자가 포함된 경우 이미 억 단위일 수 있으나, 표에서는 보통 숫자만 있음.
                    // 네이버 금융 PC버전 표: 거래대금 (백만)
                    amount = Math.round(parseInt(amountText, 10) / 100);
                }
            }

            // 시가 (Open)
            if (thText.includes('시가')) {
                const em = $row.find('td em');
                if (em.length > 0) {
                    open = parseInt(em.text().trim().replace(/,/g, ''), 10);
                }
            }

            // 고가 (High)
            if (thText.includes('고가')) {
                const em = $row.find('td em');
                if (em.length > 0) {
                    high = parseInt(em.text().trim().replace(/,/g, ''), 10);
                }
            }

            // 저가 (Low)
            if (thText.includes('저가')) {
                const em = $row.find('td em');
                if (em.length > 0) {
                    low = parseInt(em.text().trim().replace(/,/g, ''), 10);
                }
            }
        });

        // Fallback if table parsing fails (try specific classes if needed, but table loop is robust)
        // If open/high/low are 0, try to find them via specific structure if needed.
        // For now, assume table structure is standard.

        if (isNaN(rate)) rate = 0;
        if (isNaN(price)) price = 0;

        return {
            name,
            code,
            rate,
            amount,
            price,
            open,
            high,
            low,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        };

    } catch (error) {
        console.error(`Failed to scrape ${name} (${code}):`, error.message);
        return { name, rate: 0, amount: 0, price: 0, open: 0, high: 0, low: 0, time: '' };
    }
}

async function fetchMarketData(stockNames) {
    // console.log(`Fetching real-time prices for ${stockNames.length} stocks...`);
    const results = await Promise.all(stockNames.map(async (name) => {
        return await fetchStockPrice(name);
    }));
    return results;
}

// 급등주 데이터에서 특정 종목 찾기 (캐시 활용)
function enrichStockWithHotData(stockName, hotStocks) {
    // Basic filtering first
    if (isNoiseStock(stockName)) return null;

    const hotStock = hotStocks.find(s => s.name === stockName);
    if (hotStock) {
        return {
            name: stockName,
            code: hotStock.code,
            rate: hotStock.rate,
            amount: hotStock.amount,
            price: hotStock.price || 0, // 급등주 데이터에 price가 없을 수도 있음
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        };
    }
    return null;
}

function isNoiseStock(name) {
    if (!name) return true;

    const noiseKeywords = [
        '스팩', '제\\d+호', // SPAC
        '우', '우B', // Preferred stocks (simplistic, might catch real names ending in 우 but rare if strict)
        // Better regex for preferred: /우$|우B$/
        'ETF', 'ETN', 'TIGER', 'KODEX', 'SOL', 'KBSTAR', 'ACE', 'HANARO', 'KOSEF', 'ARIRANG', 'TIMEFOLIO', 'KoAct' // ETFs
    ];

    // Regex check for strict ending patterns or keyword inclusion
    // 1. Check strict suffixes for Preferred stocks
    if (name.endsWith('우') || name.endsWith('우B') || name.endsWith('우(전환)')) {
        // Be careful with names like '대우', '배우'. Usually preferred stocks are "Samsung Electronics Profrred" -> "삼성전자우"
        // Most 2-char words ending in 우 are fine? "한우"? No stock named that.
        // Let's rely on standard naming conventions.
        // Actually, "대우부품" ends in nothing. "미래에셋대우" (old name).
        // "삼성전자우", "현대차2우B".
        // Safe heuristic: if it contains "스팩", or starts with ETF brands.
        return true;
    }

    // 2. Check keywords
    for (const keyword of noiseKeywords) {
        if (keyword.includes('\\d')) {
            if (new RegExp(keyword).test(name)) return true;
        } else {
            if (name.includes(keyword)) return true;
        }
    }

    return false;
}

module.exports = {
    fetchMarketData,
    fetchStockPrice,
    getStockCode,
    enrichStockWithHotData,
    isNoiseStock, // Exported
    stockCodeMap
};

