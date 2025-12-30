const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

// 네이버 금융 신규상장 종목 페이지
const IPO_URL = 'https://finance.naver.com/sise/sise_new_stock.naver';

// 캐시 (1시간 TTL - 신규상장 정보는 자주 변하지 않음)
const ipoCache = {
    data: null,
    lastUpdated: 0,
    TTL: 60 * 60 * 1000 // 1시간
};

// 코드 기반 IPO 종목 빠른 조회용 맵
let ipoCodeMap = new Map();

/**
 * 날짜 문자열 파싱 (YYYY.MM.DD 또는 YY.MM.DD 형식)
 */
function parseListingDate(dateStr) {
    if (!dateStr) return null;

    // 공백 제거
    dateStr = dateStr.trim();

    // YYYY.MM.DD 형식
    const fullMatch = dateStr.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (fullMatch) {
        return new Date(parseInt(fullMatch[1]), parseInt(fullMatch[2]) - 1, parseInt(fullMatch[3]));
    }

    // YY.MM.DD 형식
    const shortMatch = dateStr.match(/(\d{2})\.(\d{2})\.(\d{2})/);
    if (shortMatch) {
        const year = 2000 + parseInt(shortMatch[1]);
        return new Date(year, parseInt(shortMatch[2]) - 1, parseInt(shortMatch[3]));
    }

    return null;
}

/**
 * 신규상장 종목 크롤링
 * @param {number} daysLimit - 상장일 기준 일수 (기본 30일)
 * @returns {Promise<{stocks: Array, lastUpdated: number}>}
 */
async function fetchIPOStocks(daysLimit = 30) {
    // 캐시 확인
    const now = Date.now();
    if (ipoCache.data && (now - ipoCache.lastUpdated) < ipoCache.TTL) {
        console.log('Using cached IPO data');
        return { stocks: ipoCache.data, lastUpdated: ipoCache.lastUpdated };
    }

    console.log('Fetching IPO stocks from Naver Finance...');

    try {
        const response = await axios.get(IPO_URL, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const html = iconv.decode(response.data, 'EUC-KR');
        const $ = cheerio.load(html);

        const stocks = [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysLimit);

        // 신규상장 테이블 파싱
        // 네이버 금융 신규상장 페이지 구조:
        // table.type_1 > tbody > tr
        // td: 종목명(링크), 현재가, 전일비, 등락률, 거래량, 시가총액, 상장일
        $('table.type_1 tbody tr').each((i, row) => {
            const $row = $(row);
            const cells = $row.find('td');

            if (cells.length < 7) return;

            // 종목명 및 코드
            const nameCell = cells.eq(0).find('a');
            const name = nameCell.text().trim();
            const href = nameCell.attr('href');

            if (!name || !href) return;

            const codeMatch = href.match(/code=(\d+)/);
            if (!codeMatch) return;
            const code = codeMatch[1];

            // 현재가
            const priceText = cells.eq(1).text().trim().replace(/,/g, '');
            const price = parseInt(priceText, 10) || 0;

            // 등락률
            const rateText = cells.eq(3).text().trim();
            const rateMatch = rateText.match(/([+-]?\d+\.?\d*)%?/);
            const rate = rateMatch ? parseFloat(rateMatch[1]) : 0;

            // 거래량
            const volumeText = cells.eq(4).text().trim().replace(/,/g, '');
            const volume = parseInt(volumeText, 10) || 0;

            // 시가총액 (억원)
            const marketCapText = cells.eq(5).text().trim().replace(/,/g, '');
            const marketCap = parseInt(marketCapText, 10) || 0;

            // 상장일
            const listingDateText = cells.eq(6).text().trim();
            const listingDate = parseListingDate(listingDateText);

            if (!listingDate) return;

            // 상장일 필터 (daysLimit일 이내)
            if (listingDate >= cutoffDate) {
                // 거래대금 추정 (억원)
                const amount = Math.floor(price * volume / 100000000);

                stocks.push({
                    name,
                    code,
                    price,
                    rate,
                    volume,
                    amount,
                    marketCap,
                    listingDate: listingDate.toISOString().split('T')[0],
                    daysFromListing: Math.floor((now - listingDate.getTime()) / (1000 * 60 * 60 * 24)),
                    isIPO: true
                });
            }
        });

        // 등락률 기준 정렬
        stocks.sort((a, b) => b.rate - a.rate);

        // 캐시 업데이트
        ipoCache.data = stocks;
        ipoCache.lastUpdated = now;

        // 코드 맵 업데이트
        ipoCodeMap = new Map(stocks.map(s => [s.code, s]));

        console.log(`IPO stocks collected: ${stocks.length} (within ${daysLimit} days)`);

        return { stocks, lastUpdated: now };
    } catch (error) {
        console.error('Failed to fetch IPO stocks:', error.message);

        // 캐시가 있으면 만료되어도 반환
        if (ipoCache.data) {
            console.log('Returning stale IPO cache due to error');
            return { stocks: ipoCache.data, lastUpdated: ipoCache.lastUpdated };
        }

        return { stocks: [], lastUpdated: now };
    }
}

/**
 * 특정 종목이 IPO 종목인지 확인
 * @param {string} code - 종목 코드
 * @returns {boolean}
 */
function isIPOStock(code) {
    return ipoCodeMap.has(code);
}

/**
 * IPO 종목 정보 조회
 * @param {string} code - 종목 코드
 * @returns {Object|null}
 */
function getIPOStockInfo(code) {
    return ipoCodeMap.get(code) || null;
}

/**
 * 캐시 강제 갱신
 */
async function refreshIPOCache() {
    ipoCache.lastUpdated = 0; // 캐시 만료
    return fetchIPOStocks();
}

module.exports = {
    fetchIPOStocks,
    isIPOStock,
    getIPOStockInfo,
    refreshIPOCache
};
