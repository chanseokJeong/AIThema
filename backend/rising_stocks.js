const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

// 네이버 금융 급등주/거래상위 페이지
const NAVER_RISING_URL = 'https://finance.naver.com/sise/sise_rise.naver'; // 상승률 상위
const NAVER_QUANT_URL = 'https://finance.naver.com/sise/sise_quant.naver'; // 거래량 상위
// 참고: 네이버 금융에는 별도 거래대금 상위 페이지가 없음
// 거래량 상위 + 가격으로 거래대금 추정, 400개로 확대 수집하여 커버

async function fetchUrl(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        return iconv.decode(response.data, 'EUC-KR');
    } catch (error) {
        console.error(`Failed to fetch ${url}:`, error.message);
        return null;
    }
}

// 네이버 금융 상승률 상위 종목 크롤링 (여러 페이지, 코스피/코스닥 모두)
async function fetchRisingStocks() {
    const stocks = [];
    const MAX_PAGES = 3; // 각 시장별 상위 3페이지
    const MARKETS = [0, 1]; // 0: 코스피, 1: 코스닥

    for (const market of MARKETS) {
        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = `${NAVER_RISING_URL}?sosok=${market}&page=${page}`;
            const html = await fetchUrl(url);
            if (!html) continue;

            const $ = cheerio.load(html);

            $('.type_2 tbody tr').each((i, row) => {
                const $row = $(row);

                if ($row.hasClass('blank_tr') || $row.find('.blank_tr').length > 0) return;

                const nameCell = $row.find('td').eq(1).find('a');
                const name = nameCell.text().trim();
                const href = nameCell.attr('href');

                if (!name || !href) return;

                const codeMatch = href.match(/code=(\d+)/);
                if (!codeMatch) return;
                const code = codeMatch[1];

                const priceText = $row.find('td').eq(2).text().trim().replace(/,/g, '');
                const price = parseInt(priceText, 10) || 0;

                const rateText = $row.find('td').eq(4).text().trim();
                const rateMatch = rateText.match(/([+-]?[\d.]+)%/);
                const rate = rateMatch ? parseFloat(rateMatch[1]) : 0;

                const volumeText = $row.find('td').eq(5).text().trim().replace(/,/g, '');
                const volume = parseInt(volumeText, 10) || 0;

                // 거래대금 (백만원 -> 억 단위 변환)
                // 정확한 거래대금은 아니지만 근사치로 사용
                const calculatedAmount = Math.floor((price * volume) / 100000000);
                const amount = calculatedAmount;

                // 등락률 0% 이상만 필터링
                if (rate >= 0) {
                    stocks.push({
                        name,
                        code,
                        price,
                        rate,
                        volume,
                        amount
                    });
                }
            });
        }
    }

    return stocks;
}

// 네이버 금융 거래량 상위 종목 크롤링 (여러 페이지, 코스피/코스닥 모두)
async function fetchQuantityStocks() {
    const stocks = [];
    const MAX_PAGES = 3; // 각 시장별 상위 3페이지
    const MARKETS = [0, 1]; // 0: 코스피, 1: 코스닥

    for (const market of MARKETS) {
        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = `${NAVER_QUANT_URL}?sosok=${market}&page=${page}`;
            const html = await fetchUrl(url);
            if (!html) continue;

            const $ = cheerio.load(html);

            $('.type_2 tbody tr').each((i, row) => {
                const $row = $(row);

                if ($row.hasClass('blank_tr') || $row.find('.blank_tr').length > 0) return;

                const nameCell = $row.find('td').eq(1).find('a');
                const name = nameCell.text().trim();
                const href = nameCell.attr('href');

                if (!name || !href) return;

                const codeMatch = href.match(/code=(\d+)/);
                if (!codeMatch) return;
                const code = codeMatch[1];

                const priceText = $row.find('td').eq(2).text().trim().replace(/,/g, '');
                const price = parseInt(priceText, 10) || 0;

                const rateText = $row.find('td').eq(4).text().trim();
                const rateMatch = rateText.match(/([+-]?[\d.]+)%/);
                const rate = rateMatch ? parseFloat(rateMatch[1]) : 0;

                const volumeText = $row.find('td').eq(5).text().trim().replace(/,/g, '');
                const volume = parseInt(volumeText, 10) || 0;

                // 거래대금 (백만원 -> 억 단위 변환) - 6번째 컬럼 (인덱스 6)
                const amountText = $row.find('td').eq(6).text().trim().replace(/,/g, '');
                const amount = Math.round((parseInt(amountText, 10) || 0) / 100);

                // 거래량 상위이면서 상승 중인 종목 (0% 이상)
                if (rate >= 0) {
                    stocks.push({
                        name,
                        code,
                        price,
                        rate,
                        volume,
                        amount
                    });
                }
            });
        }
    }

    return stocks;
}

// 통합 급등주 데이터 수집
async function fetchHotStocks() {
    console.log('Fetching hot stocks (rising + high volume)...');

    const [risingStocks, quantityStocks] = await Promise.all([
        fetchRisingStocks(),
        fetchQuantityStocks()
    ]);

    // 중복 제거 (종목코드 기준)
    const stockMap = new Map();

    // 상승률 상위 우선
    for (const stock of risingStocks) {
        stockMap.set(stock.code, stock);
    }

    // 거래량 상위 추가 (이미 있으면 거래대금만 업데이트)
    for (const stock of quantityStocks) {
        if (stockMap.has(stock.code)) {
            // 거래대금이 더 크면 업데이트
            const existing = stockMap.get(stock.code);
            if (stock.amount > existing.amount) {
                existing.amount = stock.amount;
            }
        } else {
            stockMap.set(stock.code, stock);
        }
    }

    const allStocks = Array.from(stockMap.values());

    // ⭐ IMPROVED: 복합 정렬 - 거래대금 상위 종목 우선 + 등락률 기준
    // 1. 거래대금 500억 이상 종목은 상위로 (시장 주도주)
    // 2. 그 외는 등락률 기준
    allStocks.sort((a, b) => {
        const aHighAmount = (a.amount || 0) >= 500;
        const bHighAmount = (b.amount || 0) >= 500;

        // 둘 다 고거래대금이면 등락률 순
        if (aHighAmount && bHighAmount) {
            return b.rate - a.rate;
        }
        // 고거래대금 우선
        if (aHighAmount && !bHighAmount) return -1;
        if (!aHighAmount && bHighAmount) return 1;
        // 나머지는 등락률 순
        return b.rate - a.rate;
    });

    console.log(`Hot stocks collected: ${allStocks.length} stocks (combined sources)`);

    // ⭐ 상위 400개로 확대 (기존 200 → 400)
    return allStocks.slice(0, 400);

}

module.exports = { fetchHotStocks };
