/**
 * 네이버 금융 테마 페이지 크롤러
 * 티마 앱과 유사한 정확한 테마-종목 매핑을 위해 사용
 */

const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

// 네이버 금융 테마 페이지 URL
const NAVER_THEME_LIST_URL = 'https://finance.naver.com/sise/theme.naver';
const NAVER_THEME_DETAIL_URL = 'https://finance.naver.com/sise/sise_group_detail.naver';

// 캐시 (1시간 TTL)
let themeCache = {
    data: null,
    lastUpdated: 0,
    TTL: 60 * 60 * 1000 // 1시간
};

/**
 * 네이버 금융 테마 목록 크롤링
 * @returns {Promise<Array>} 테마 목록 [{name, code, rate, riseCount, fallCount}]
 */
async function fetchThemeList() {
    try {
        console.log('Fetching theme list from Naver Finance...');

        const response = await axios.get(NAVER_THEME_LIST_URL, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const html = iconv.decode(response.data, 'EUC-KR');
        const $ = cheerio.load(html);

        const themes = [];

        // 테마 테이블 파싱 (col_type1 테이블)
        $('table.type_1 tbody tr').each((i, row) => {
            const $row = $(row);

            // 헤더 행 건너뛰기
            if ($row.find('th').length > 0) return;

            const nameCell = $row.find('td').eq(0).find('a');
            const themeName = nameCell.text().trim();
            const href = nameCell.attr('href');

            if (!themeName || !href) return;

            // 테마 코드 추출: ?type=theme&no=XXX
            const codeMatch = href.match(/no=(\d+)/);
            if (!codeMatch) return;
            const themeCode = codeMatch[1];

            // 등락률
            const rateText = $row.find('td').eq(2).text().trim();
            const rateMatch = rateText.match(/([+-]?[\d.]+)/);
            const rate = rateMatch ? parseFloat(rateMatch[1]) : 0;

            // 상승여부 체크 (빨간색이면 상승)
            const isPositive = $row.find('td').eq(2).find('.tah').hasClass('red') ||
                              $row.find('td').eq(2).find('img[src*="ico_up"]').length > 0;

            // 상승/하락 종목 수
            const riseCountText = $row.find('td').eq(4).text().trim();
            const fallCountText = $row.find('td').eq(5).text().trim();
            const riseCount = parseInt(riseCountText, 10) || 0;
            const fallCount = parseInt(fallCountText, 10) || 0;

            themes.push({
                name: themeName,
                code: themeCode,
                rate: isPositive ? Math.abs(rate) : -Math.abs(rate),
                riseCount,
                fallCount
            });
        });

        console.log(`Fetched ${themes.length} themes from Naver Finance`);
        return themes;

    } catch (error) {
        console.error('Failed to fetch theme list:', error.message);
        return [];
    }
}

/**
 * 특정 테마의 종목 목록 크롤링
 * @param {string} themeCode - 테마 코드
 * @returns {Promise<Array>} 종목 목록 [{name, code, price, rate, amount}]
 */
async function fetchThemeStocks(themeCode) {
    try {
        const url = `${NAVER_THEME_DETAIL_URL}?type=theme&no=${themeCode}`;

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const html = iconv.decode(response.data, 'EUC-KR');
        const $ = cheerio.load(html);

        const stocks = [];

        // 종목 테이블 파싱 (type_5 테이블)
        $('table.type_5 tbody tr').each((i, row) => {
            const $row = $(row);

            // 빈 행 건너뛰기
            if ($row.hasClass('blank_tr') || $row.find('td').length < 5) return;

            const nameCell = $row.find('td').eq(0).find('a');
            const name = nameCell.text().trim();
            const href = nameCell.attr('href');

            if (!name || !href) return;

            // 종목 코드 추출
            const codeMatch = href.match(/code=(\d+)/);
            if (!codeMatch) return;
            const code = codeMatch[1];

            // 현재가
            const priceText = $row.find('td').eq(1).text().trim().replace(/,/g, '');
            const price = parseInt(priceText, 10) || 0;

            // 등락률
            const rateCell = $row.find('td').eq(3);
            const rateText = rateCell.text().trim();
            const rateMatch = rateText.match(/([+-]?[\d.]+)/);
            let rate = rateMatch ? parseFloat(rateMatch[1]) : 0;

            // 음수 체크 (파란색 또는 마이너스 아이콘)
            const isNegative = rateCell.find('.tah').hasClass('blue') ||
                              rateCell.find('img[src*="ico_down"]').length > 0 ||
                              rateText.includes('-');
            if (isNegative && rate > 0) rate = -rate;

            // 거래량
            const volumeText = $row.find('td').eq(5).text().trim().replace(/,/g, '');
            const volume = parseInt(volumeText, 10) || 0;

            // 거래대금 (억원 단위로 변환)
            const amount = Math.round((price * volume) / 100000000);

            stocks.push({
                name,
                code,
                price,
                rate,
                volume,
                amount
            });
        });

        return stocks;

    } catch (error) {
        console.error(`Failed to fetch stocks for theme ${themeCode}:`, error.message);
        return [];
    }
}

/**
 * 상위 N개 테마의 종목 데이터 수집
 * @param {number} topN - 상위 몇 개 테마를 수집할지 (기본: 20)
 * @returns {Promise<Object>} { 테마명: { code, rate, stocks: [...] } }
 */
async function fetchTopThemesWithStocks(topN = 20) {
    // 캐시 확인
    if (themeCache.data && Date.now() - themeCache.lastUpdated < themeCache.TTL) {
        console.log('Using cached theme data');
        return themeCache.data;
    }

    console.log(`Fetching top ${topN} themes with stocks from Naver...`);

    const themeList = await fetchThemeList();

    if (themeList.length === 0) {
        console.warn('No themes fetched from Naver');
        return {};
    }

    // 등락률 기준 정렬 후 상위 N개
    const sortedThemes = themeList
        .sort((a, b) => b.rate - a.rate)
        .slice(0, topN);

    const result = {};

    for (const theme of sortedThemes) {
        const stocks = await fetchThemeStocks(theme.code);

        if (stocks.length > 0) {
            result[theme.name] = {
                code: theme.code,
                rate: theme.rate,
                riseCount: theme.riseCount,
                fallCount: theme.fallCount,
                stocks: stocks
            };
        }

        // API 부하 방지 (500ms 지연)
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 캐시 저장
    themeCache.data = result;
    themeCache.lastUpdated = Date.now();

    console.log(`Collected ${Object.keys(result).length} themes with stocks`);
    return result;
}

/**
 * 캐시된 테마 데이터 반환 (캐시 없으면 새로 수집)
 */
async function getCachedThemes() {
    if (themeCache.data && Date.now() - themeCache.lastUpdated < themeCache.TTL) {
        return themeCache.data;
    }
    return await fetchTopThemesWithStocks();
}

/**
 * 캐시 강제 갱신
 */
async function refreshThemeCache() {
    themeCache.data = null;
    themeCache.lastUpdated = 0;
    return await fetchTopThemesWithStocks();
}

module.exports = {
    fetchThemeList,
    fetchThemeStocks,
    fetchTopThemesWithStocks,
    getCachedThemes,
    refreshThemeCache
};
