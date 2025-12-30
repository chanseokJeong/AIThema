const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

// 네이버 금융 업종 코드 정의
const SECTOR_CODES = {
    '로봇': {
        codes: ['020', '021', '026', '229', '274', '299', '270', '267', '273', '289'], // 기계, 전기전자, 의료정밀, IT부품, 자동차부품, 기계...
        keywords: ['로봇', '자동화', 'AI', '로보']
    },
    '바이오': {
        codes: ['032', '033', '034', '261', '288'], // 의약품, 바이오, 제약 + [NEW] 제약(261), 건강관리기술(288: 쓰리빌리언 등)
        keywords: ['바이오', '제약', '의약', '헬스케어', '신약', '치료']
    },
    '2차전지': {
        codes: ['220', '021', '283', '272'], // 2차전지, 전기전자, 전기제품 + [NEW] 화학(272: 이수스페셜티케미컬 등)
        keywords: ['2차전지', '배터리', '전기차', 'EV', '소재']
    },
    '반도체': {
        codes: ['227', '228', '229', '278', '282', '292'], // 반도체... + [NEW] 핸드셋(292: 팸텍 등)
        keywords: ['반도체', 'HBM', '칩', '웨이퍼', '장비']
    },
    '조선': {
        codes: ['043', '291'], // 조선 + [NEW] 조선(291: 삼영엠텍, HD현대마린엔진)
        keywords: ['조선', '선박', '해운', '엔진']
    },
    '원자력': {
        codes: ['029', '020', '013'], // 전기가스업, 기계, 건설업
        keywords: ['원전', '원자력', 'SMR', '핵']
    },
    '자동차': {
        codes: ['273', '274', '270'], // 자동차, 자동차부품...
        keywords: ['자동차', '전기차', '부품', '모빌리티']
    },
    '방산': {
        codes: ['284'], // 우주항공과국방
        keywords: ['방산', '국방', '무기', '우주']
    },
    // ⭐ NEW: 추가 테마 업종 코드
    '항공': {
        codes: ['045', '292'], // 운수장비, 핸드셋(기타운송)
        keywords: ['항공', '여행', 'LCC', '항공사']
    },
    'AI/소프트웨어': {
        codes: ['229', '280', '281'], // IT부품, SW, 게임엔터테인먼트
        keywords: ['AI', 'SW', '소프트웨어', '플랫폼', '클라우드']
    },
    '화장품': {
        codes: ['263', '037'], // 화장품, 유통업
        keywords: ['화장품', '뷰티', '코스메틱']
    },
    '게임': {
        codes: ['281'], // 게임엔터테인먼트
        keywords: ['게임', 'IP', '모바일']
    },
    '엔터/미디어': {
        codes: ['281', '264', '036'], // 게임엔터, 방송서비스, 통신업
        keywords: ['엔터', 'K-POP', '방송', '미디어', '기획사']
    },
    '금융/증권': {
        codes: ['093', '094', '095', '096'], // 증권, 보험, 은행, 기타금융
        keywords: ['금융', '증권', '은행', '보험']
    }
};

// 네이버 금융 업종별 시세 URL
const SECTOR_DETAIL_URL = 'https://finance.naver.com/sise/sise_group_detail.naver';

/**
 * 특정 업종의 전체 종목 조회
 * @param {string} sectorCode - 업종 코드 (예: '020')
 * @param {number} minRate - 최소 등락률 (기본: 2%)
 * @returns {Promise<Array>} 종목 리스트
 */
async function fetchSectorStocks(sectorCode, minRate = 2) {
    try {
        const url = `${SECTOR_DETAIL_URL}?type=upjong&no=${sectorCode}`;

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const html = iconv.decode(response.data, 'EUC-KR');
        const $ = cheerio.load(html);

        const stocks = [];

        $('.type_5 tbody tr').each((i, row) => {
            const $row = $(row);

            // 빈 행 스킵
            if ($row.hasClass('blank_tr')) return;

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
            const rateText = $row.find('td').eq(3).text().trim();
            const rateMatch = rateText.match(/([+-]?[\d.]+)%/);
            const rate = rateMatch ? parseFloat(rateMatch[1]) : 0;

            // 거래량
            const volumeText = $row.find('td').eq(6).text().trim().replace(/,/g, '');
            const volume = parseInt(volumeText, 10) || 0;

            // 거래대금 (백만원 -> 억 단위 변환)
            const amountText = $row.find('td').eq(7).text().trim().replace(/,/g, '');
            const amount = Math.round((parseInt(amountText, 10) || 0) / 100);

            // 필터: 설정된 등락률 이상 OR (거래대금 300억 이상 && -10% 이상) - 눌림목 포함 (기준 완화)
            const isDipBuying = rate >= -10.0 && amount >= 300;

            if (rate >= minRate || isDipBuying) {
                stocks.push({
                    name,
                    code,
                    price,
                    rate,
                    volume,
                    amount,
                    sector: sectorCode
                });
            }
        });

        return stocks;

    } catch (error) {
        console.error(`Failed to fetch sector ${sectorCode}:`, error.message);
        return [];
    }
}

/**
 * 테마별 업종 코드 기반 급등주 수집
 * @param {number} minRate - 최소 등락률 (기본: 3%)
 * @returns {Promise<Object>} 테마별 급등주
 */
async function fetchThemeStocksBySector(minRate = 3) {
    console.log('Fetching theme stocks by sector codes...');

    const themeStocks = {};

    for (const [themeName, themeInfo] of Object.entries(SECTOR_CODES)) {
        console.log(`  Fetching ${themeName} stocks from sectors: ${themeInfo.codes.join(', ')}`);

        const allStocks = [];

        // 각 업종 코드별로 종목 조회
        for (const code of themeInfo.codes) {
            const sectorStocks = await fetchSectorStocks(code, minRate);
            allStocks.push(...sectorStocks);

            // API 부하 방지
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 중복 제거 (종목 코드 기준)
        const uniqueStocks = [];
        const seenCodes = new Set();

        for (const stock of allStocks) {
            if (!seenCodes.has(stock.code)) {
                // ETF/ETN 필터링 (순수 종목만 보기 위해)
                const isETF = /KODEX|TIGER|KBSTAR|SOL|ACE|KOSEF|ARIRANG|WOORI|HANARO|TIMEFOLIO|KoAct|ETF|ETN|TOP|KRX|TREX|SMART|FOCUS/i.test(stock.name);
                if (isETF) continue;

                // 업종에 속하면 모두 포함 (키워드 필터링 제거) ⭐
                // 이미 minRate로 필터링되었으므로 추가 조건 불필요
                uniqueStocks.push({
                    ...stock,
                    theme: themeName
                });
                seenCodes.add(stock.code);
            }
        }

        // 통합 정렬: 등락률 + 거래대금 가중치
        // 공식: 점수 = 등락률 + (거래대금(억) / 100)
        // High Volume Dip과 일반 상승주를 통합하여 '점수' 순으로 정렬

        // 필터링: Display logic에서 제외할 너무 작은 종목은? (일단 유지)

        const combined = uniqueStocks;

        combined.sort((a, b) => {
            const scoreA = a.rate + (a.amount / 100);
            const scoreB = b.rate + (b.amount / 100);
            return scoreB - scoreA;
        });

        if (combined.length > 0) {
            themeStocks[themeName] = combined.slice(0, 40);
            console.log(`  ${themeName}: Found ${uniqueStocks.length} stocks`);
        }
    }

    return themeStocks;
}

/**
 * 업종 기반 급등주를 hotStocks 형식으로 통합
 * @param {Array} rawHotStocks - 기존 급등주
 * @param {number} minRate - 최소 등락률
 * @returns {Promise<Array>} 통합된 급등주 리스트
 */
async function enrichHotStocksWithSector(rawHotStocks, minRate = 3) {
    console.log('Enriching hot stocks with sector-based stocks...');

    // 업종 기반 급등주 수집
    const themeStocks = await fetchThemeStocksBySector(minRate);

    // 기존 급등주 목록에 추가
    const enrichedStocks = [...rawHotStocks];
    const existingCodes = new Set(rawHotStocks.map(s => s.code));

    for (const [themeName, stocks] of Object.entries(themeStocks)) {
        for (const stock of stocks) {
            if (!existingCodes.has(stock.code)) {
                enrichedStocks.push(stock);
                existingCodes.add(stock.code);
            }
        }
    }

    console.log(`Enriched: ${rawHotStocks.length} → ${enrichedStocks.length} stocks (+${enrichedStocks.length - rawHotStocks.length})`);

    return enrichedStocks;
}

module.exports = {
    fetchSectorStocks,
    fetchThemeStocksBySector,
    enrichHotStocksWithSector,
    SECTOR_CODES
};
