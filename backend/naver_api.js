const axios = require('axios');

/**
 * 네이버 금융 실시간 API 래퍼
 * - 안정적인 JSON API로 거래대금, 등락률 등 실시간 데이터 제공
 * - HTML 스크래핑보다 빠르고 안정적
 */

/**
 * 종목 코드로 실시간 시세 조회
 * @param {string} code - 종목 코드 (예: "005930")
 * @returns {Object} { name, code, rate, amount, price }
 */
async function fetchStockByCode(code) {
    try {
        const url = `https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:${code}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://finance.naver.com/'
            }
        });

        if (response.data.resultCode === 'success' && response.data.result.areas.length > 0) {
            const data = response.data.result.areas[0].datas[0];
            if (['042940', '017000', '277810', '454910'].includes(code)) {
                console.log(`[DEBUG RAW] ${code} (${data.nm}): aa=${data.aa}, cr=${data.cr}, rf=${data.rf}`);
                if (data.nxtOverMarketPriceInfo) {
                    console.log(`  [DEBUG OVER] accumulatedTradingValue=${data.nxtOverMarketPriceInfo.accumulatedTradingValue}`);
                }
            }

            // 거래대금 계산: aa는 원 단위 → 억 단위로 변환
            let amount = data.aa ? Math.round(data.aa / 100000000) : 0;

            // 시간외 거래대금 합산 (티마 등 타 서비스와 맞추기 위함)
            if (data.nxtOverMarketPriceInfo && data.nxtOverMarketPriceInfo.accumulatedTradingValue) {
                // "848,109백만" 형식 파싱
                const overMarketValueStr = data.nxtOverMarketPriceInfo.accumulatedTradingValue;
                const overMarketValue = parseInt(overMarketValueStr.replace(/[,백만]/g, ''), 10);
                if (!isNaN(overMarketValue)) {
                    // 백만 단위 -> 억 단위 (나누기 100)
                    amount += Math.round(overMarketValue / 100);
                }
            }

            // 등락률
            let rate = parseFloat(data.cr) || 0;
            // rf: 4(하락), 5(하한가)인 경우 음수로 변환
            if (data.rf === '4' || data.rf === '5') {
                rate = -Math.abs(rate);
            }

            // 현재가, 시가, 고가, 저가
            const price = data.nv || 0;
            const open = data.ov || 0;
            const high = data.hv || 0;
            const low = data.lv || 0;

            // 종목명 디코딩 (UTF-8)
            let name = data.nm;
            try {
                // 네이버 API가 깨진 인코딩으로 반환하는 경우 처리
                name = decodeURIComponent(escape(data.nm));
            } catch (e) {
                // 디코딩 실패 시 원본 사용
            }

            return {
                name: name,
                code: code,
                rate: rate,
                amount: amount,
                price: price,
                open: open,
                high: high,
                low: low
            };
        }

        console.warn(`No data found for code: ${code}`);
        return null;
    } catch (error) {
        console.error(`Failed to fetch stock ${code}:`, error.message);
        return null;
    }
}

/**
 * 여러 종목 코드를 한번에 조회
 * @param {string[]} codes - 종목 코드 배열
 * @returns {Object[]} 종목 데이터 배열
 */
async function fetchMultipleStocks(codes) {
    const results = await Promise.all(codes.map(code => fetchStockByCode(code)));
    return results.filter(result => result !== null);
}

/**
 * 종목명으로 코드 조회 (네이버 검색 페이지 스크래핑)
 * @param {string} name - 종목명
 * @returns {string|null} 종목 코드
 */
async function searchStockCode(name) {
    try {
        const searchUrl = `https://finance.naver.com/search/searchList.naver?query=${encodeURIComponent(name)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const html = response.data;

        // 정확한 종목명 매칭
        const regex = new RegExp(`<a[^>]*href="/item/main\\.naver\\?code=(\\d{6})"[^>]*>\\s*${name}\\s*</a>`, 'i');
        const match = html.match(regex);

        if (match && match[1]) {
            console.log(`Found code for ${name}: ${match[1]}`);
            return match[1];
        }

        // 정확한 매칭 실패 시, 부분 매칭
        const partialRegex = /<a[^>]*href="\/item\/main\.naver\?code=(\d{6})"[^>]*>([^<]+)<\/a>/gi;
        const matches = [...html.matchAll(partialRegex)];

        for (const m of matches) {
            const stockName = m[2].trim();
            if (stockName.includes(name) || name.includes(stockName)) {
                console.log(`Partial match for ${name}: ${m[1]} (${stockName})`);
                return m[1];
            }
        }

        console.warn(`No code found for: ${name}`);
        return null;
    } catch (error) {
        console.error(`Failed to search code for ${name}:`, error.message);
        return null;
    }
}

module.exports = {
    fetchStockByCode,
    fetchMultipleStocks,
    searchStockCode
};
