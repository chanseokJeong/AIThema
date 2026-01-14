const axios = require('axios');

/**
 * 네이버 금융 실시간 API 래퍼
 * - 안정적인 JSON API로 거래대금, 등락률 등 실시간 데이터 제공
 * - HTML 스크래핑보다 빠르고 안정적
 * - NXT 프리마켓/애프터마켓 시세 지원 (08:00~20:00)
 * - VI(변동성완화장치) 발동 상태 지원
 */

/**
 * VI(변동성완화장치) 상태 코드 정의
 * - 네이버 금융 API의 tradeStopType.name 필드 기준
 */
const VI_STATUS = {
    TRADING: 'TRADING',           // 정상 거래
    VI_STATIC: 'VI_STATIC',       // 정적 VI 발동 (전일 종가 대비 10% 이상 변동)
    VI_DYNAMIC: 'VI_DYNAMIC',     // 동적 VI 발동 (직전가 대비 급변동)
    HALT: 'HALT',                 // 거래 정지
    SUSPENDED: 'SUSPENDED'        // 거래 중단
};

/**
 * tradeStopType 필드에서 VI 상태 파싱
 * @param {Object} tradeStopType - { code, text, name }
 * @returns {Object} { isVI: boolean, viType: string, viText: string }
 */
function parseViStatus(tradeStopType) {
    if (!tradeStopType) {
        return { isVI: false, viType: null, viText: null };
    }

    const name = tradeStopType.name || '';
    const text = tradeStopType.text || '';
    const code = tradeStopType.code || '';

    // VI 발동 여부 확인
    // code 값: 1=정상거래, 2=정적VI, 3=동적VI, 4=거래정지 등 (추정)
    // name 값: TRADING, VI_STATIC, VI_DYNAMIC, HALT 등
    const isVI = name.includes('VI') ||
                 code === '2' || code === '3' ||
                 name === 'HALT' || name === 'SUSPENDED';

    let viType = null;
    let viText = null;

    if (name.includes('STATIC') || code === '2') {
        viType = 'STATIC';
        viText = '정적VI';
    } else if (name.includes('DYNAMIC') || code === '3') {
        viType = 'DYNAMIC';
        viText = '동적VI';
    } else if (name === 'HALT' || name === 'SUSPENDED') {
        viType = 'HALT';
        viText = '거래정지';
    }

    return { isVI, viType, viText };
}

/**
 * compareToPreviousPrice 필드에서 상한가/하한가 상태 파싱
 * @param {Object} compareToPreviousPrice - { code, text, name }
 * @returns {Object} { isLimit: boolean, limitType: string, limitText: string }
 */
function parseLimitStatus(compareToPreviousPrice) {
    if (!compareToPreviousPrice) {
        return { isLimit: false, limitType: null, limitText: null };
    }

    const name = compareToPreviousPrice.name || '';
    const code = compareToPreviousPrice.code || '';

    // 상한가: code='1', name='UPPER_LIMIT'
    // 하한가: code='5' (하락) 또는 name='LOWER_LIMIT'
    let isLimit = false;
    let limitType = null;
    let limitText = null;

    if (name === 'UPPER_LIMIT' || code === '1') {
        isLimit = true;
        limitType = 'UPPER';
        limitText = '상한가';
    } else if (name === 'LOWER_LIMIT') {
        isLimit = true;
        limitType = 'LOWER';
        limitText = '하한가';
    }

    return { isLimit, limitType, limitText };
}

/**
 * 네이버 모바일 API에서 VI/상한가 정보 조회 (fallback용)
 * @param {string} code - 종목 코드
 * @returns {Object|null} { isVI, viType, viText, isLimit, limitType, limitText }
 */
async function fetchBasicInfo(code) {
    try {
        const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 3000
        });

        const data = response.data;
        const viStatus = parseViStatus(data.tradeStopType);
        const limitStatus = parseLimitStatus(data.compareToPreviousPrice);

        return {
            ...viStatus,
            ...limitStatus
        };
    } catch (error) {
        // 실패해도 무시 (fallback이므로)
        return null;
    }
}

/**
 * 현재 시장 상태 판정 (한국 시간 기준)
 * @returns {string} 'PRE_MARKET' | 'REGULAR' | 'AFTER_MARKET' | 'CLOSED'
 */
function getMarketStatus() {
    // 한국 시간(KST, UTC+9)으로 변환
    const now = new Date();
    const kstOffset = 9 * 60; // KST = UTC+9
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const kstMinutes = (utcMinutes + kstOffset) % (24 * 60);
    const kstHour = Math.floor(kstMinutes / 60);

    // 요일 계산 (UTC 기준으로 날짜가 바뀔 수 있음)
    const kstDate = new Date(now.getTime() + kstOffset * 60 * 1000);
    const dayOfWeek = kstDate.getUTCDay(); // 0=일, 6=토

    // 주말은 CLOSED
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'CLOSED';

    // NXT 프리마켓: 08:00 ~ 09:00 (08:30 이후도 프리마켓 거래 가능)
    if (kstMinutes >= 8 * 60 && kstMinutes < 9 * 60) return 'PRE_MARKET';

    // 정규장: 09:00 ~ 15:30
    if (kstMinutes >= 9 * 60 && kstMinutes < 15 * 60 + 30) return 'REGULAR';

    // NXT 애프터마켓: 15:40 ~ 20:00
    if (kstMinutes >= 15 * 60 + 40 && kstMinutes < 20 * 60) return 'AFTER_MARKET';

    return 'CLOSED';
}

/**
 * NXT 시세 정보 파싱
 * @param {Object} nxtInfo - nxtOverMarketPriceInfo 객체
 * @returns {Object|null} { price, rate, open, high, low, volume, status }
 */
function parseNxtPriceInfo(nxtInfo) {
    if (!nxtInfo) return null;

    // 가격 파싱 (콤마 제거)
    const parsePrice = (str) => {
        if (!str || str === '-') return 0;
        return parseInt(String(str).replace(/,/g, ''), 10) || 0;
    };

    // 등락률 파싱
    let rate = parseFloat(nxtInfo.fluctuationsRatio) || 0;
    // compareToPreviousPrice.code: '4'=하락, '5'=하한가
    if (nxtInfo.compareToPreviousPrice) {
        const code = nxtInfo.compareToPreviousPrice.code;
        if (code === '4' || code === '5') {
            rate = -Math.abs(rate);
        }
    }

    // 거래대금 파싱 ("848,109백만" 형식)
    let volume = 0;
    if (nxtInfo.accumulatedTradingValue && nxtInfo.accumulatedTradingValue !== '-') {
        const valueStr = nxtInfo.accumulatedTradingValue;
        const value = parseInt(valueStr.replace(/[,백만]/g, ''), 10);
        if (!isNaN(value)) {
            volume = Math.round(value / 100); // 백만 → 억
        }
    }

    return {
        price: parsePrice(nxtInfo.overPrice),
        rate: rate,
        open: parsePrice(nxtInfo.openPrice),
        high: parsePrice(nxtInfo.highPrice),
        low: parsePrice(nxtInfo.lowPrice),
        volume: volume,
        status: nxtInfo.overMarketStatus || 'UNKNOWN'
    };
}

/**
 * 종목 코드로 실시간 시세 조회
 * - 시간대에 따라 NXT 프리마켓/애프터마켓 또는 정규장 시세 반환
 * @param {string} code - 종목 코드 (예: "005930")
 * @param {Object} options - { forceNxt: boolean } NXT 시세 강제 사용
 * @returns {Object} { name, code, rate, amount, price, marketStatus, nxtInfo }
 */
async function fetchStockByCode(code, options = {}) {
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
            const marketStatus = getMarketStatus();

            // NXT 시세 정보 파싱
            const nxtInfo = parseNxtPriceInfo(data.nxtOverMarketPriceInfo);

            // VI 상태 파싱 (NXT 정보에서 먼저 시도)
            let viStatus = parseViStatus(data.nxtOverMarketPriceInfo?.tradeStopType);

            // 상한가/하한가 상태 파싱 (rf 필드: 1=상한가, 4=하락, 5=하한가)
            let limitStatus = { isLimit: false, limitType: null, limitText: null };
            if (data.rf === '1' && data.nv === data.ul) {
                // 현재가가 상한가와 같으면 상한가
                limitStatus = { isLimit: true, limitType: 'UPPER', limitText: '상한가' };
            } else if (data.rf === '5' || (data.nv === data.ll && data.ll > 0)) {
                // 하한가
                limitStatus = { isLimit: true, limitType: 'LOWER', limitText: '하한가' };
            }

            // NXT 정보가 없으면 basic API로 VI/상한가 정보 보완
            if (!data.nxtOverMarketPriceInfo && !viStatus.isVI) {
                const basicInfo = await fetchBasicInfo(code);
                if (basicInfo) {
                    if (basicInfo.isVI) {
                        viStatus = { isVI: basicInfo.isVI, viType: basicInfo.viType, viText: basicInfo.viText };
                    }
                    if (basicInfo.isLimit && !limitStatus.isLimit) {
                        limitStatus = { isLimit: basicInfo.isLimit, limitType: basicInfo.limitType, limitText: basicInfo.limitText };
                    }
                }
            }

            // DEBUG 로그 (특정 종목만)
            if (['042940', '017000', '277810', '454910'].includes(code)) {
                console.log(`[DEBUG RAW] ${code} (${data.nm}): aa=${data.aa}, cr=${data.cr}, rf=${data.rf}`);
                if (nxtInfo) {
                    console.log(`  [DEBUG NXT] status=${nxtInfo.status}, price=${nxtInfo.price}, rate=${nxtInfo.rate}`);
                }
            }

            // 종목명 디코딩 (UTF-8)
            let name = data.nm;
            try {
                name = decodeURIComponent(escape(data.nm));
            } catch (e) {
                // 디코딩 실패 시 원본 사용
            }

            // === 시간대별 데이터 선택 ===
            let price, rate, open, high, low, amount;

            // 정규장 데이터 (기본값)
            const regularPrice = data.nv || 0;
            let regularRate = parseFloat(data.cr) || 0;
            if (data.rf === '4' || data.rf === '5') {
                regularRate = -Math.abs(regularRate);
            }
            const regularOpen = data.ov || 0;
            const regularHigh = data.hv || 0;
            const regularLow = data.lv || 0;
            let regularAmount = data.aa ? Math.round(data.aa / 100000000) : 0;

            // 프리마켓 (08:00~08:30): NXT 시세만 사용
            if (marketStatus === 'PRE_MARKET' || options.forceNxt) {
                if (nxtInfo && nxtInfo.price > 0) {
                    price = nxtInfo.price;
                    rate = nxtInfo.rate;
                    open = nxtInfo.open || price;
                    high = nxtInfo.high || price;
                    low = nxtInfo.low || price;
                    amount = nxtInfo.volume;
                } else {
                    // NXT 데이터 없으면 전일 종가 기준
                    price = regularPrice;
                    rate = 0;
                    open = regularPrice;
                    high = regularPrice;
                    low = regularPrice;
                    amount = 0;
                }
            }
            // 정규장 (09:00~15:30): 정규장 시세 + NXT 거래대금 합산
            else if (marketStatus === 'REGULAR') {
                price = regularPrice;
                rate = regularRate;
                open = regularOpen;
                high = regularHigh;
                low = regularLow;
                amount = regularAmount;

                // NXT 거래대금 합산 (동시 거래 중이므로)
                if (nxtInfo && nxtInfo.volume > 0) {
                    amount += nxtInfo.volume;
                }
            }
            // 애프터마켓 (15:40~20:00): NXT 시세 우선, 없으면 종가
            else if (marketStatus === 'AFTER_MARKET') {
                if (nxtInfo && nxtInfo.price > 0) {
                    price = nxtInfo.price;
                    rate = nxtInfo.rate;
                    open = nxtInfo.open || regularOpen;
                    high = Math.max(nxtInfo.high || 0, regularHigh);
                    low = Math.min(nxtInfo.low || regularLow, regularLow) || regularLow;
                    amount = regularAmount + (nxtInfo.volume || 0);
                } else {
                    price = regularPrice;
                    rate = regularRate;
                    open = regularOpen;
                    high = regularHigh;
                    low = regularLow;
                    amount = regularAmount;
                }
            }
            // 장 마감 (CLOSED): 정규장 최종 시세
            else {
                price = regularPrice;
                rate = regularRate;
                open = regularOpen;
                high = regularHigh;
                low = regularLow;
                amount = regularAmount;

                // 애프터마켓 거래대금 합산
                if (nxtInfo && nxtInfo.volume > 0) {
                    amount += nxtInfo.volume;
                }
            }

            return {
                name: name,
                code: code,
                rate: rate,
                amount: amount,
                price: price,
                open: open,
                high: high,
                low: low,
                marketStatus: marketStatus,
                nxtInfo: nxtInfo, // 원본 NXT 정보 (디버깅/표시용)
                // VI(변동성완화장치) 정보
                isVI: viStatus.isVI,
                viType: viStatus.viType,   // 'STATIC' | 'DYNAMIC' | 'HALT' | null
                viText: viStatus.viText,   // '정적VI' | '동적VI' | '거래정지' | null
                // 상한가/하한가 정보
                isLimit: limitStatus.isLimit,
                limitType: limitStatus.limitType,   // 'UPPER' | 'LOWER' | null
                limitText: limitStatus.limitText    // '상한가' | '하한가' | null
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
    searchStockCode,
    getMarketStatus,
    parseNxtPriceInfo,
    parseViStatus,
    parseLimitStatus,
    fetchBasicInfo,
    VI_STATUS
};
