const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

// 네이버 금융 업종별 시세 URL
const SECTOR_BASE_URL = 'https://finance.naver.com/sise/sise_group.naver?type=upjong';

// 핵심 테마 후보군 (동적 선정 대상 - 11개)
const CORE_THEME_CANDIDATES = [
    '로봇', '바이오', '2차전지', '반도체', '조선',
    '원자력', '자동차', '건설', '방산', '항공', 'AI/소프트웨어'
];

// 기타섹터로 통합될 테마 (4개)
const OTHER_SECTOR_THEMES = ['화장품', '게임', '엔터/미디어', '금융/증권'];

// 주요 테마 섹터 정의 (⭐ 확장된 종목 리스트)
const THEME_SECTORS = {
    '로봇': {
        keywords: ['로봇', '자동화', 'AI', '인공지능'],
        stocks: ['레인보우로보틱스', '두산로보틱스', '로보티즈', '로보스타', '유진로봇', '에스피지', '휴림로봇', '디아이씨', '코츠테크놀로지']
    },
    '바이오': {
        keywords: ['바이오', '제약', '헬스케어', '의료'],
        stocks: ['셀트리온', '삼성바이오로직스', '에이비엘바이오', '메디톡스', '알테오젠', '레고켐바이오', '유한양행', '한미약품', '셀트리온헬스케어']
    },
    '2차전지': {
        keywords: ['2차전지', '배터리', '전기차'],
        stocks: ['에코프로', '에코프로비엠', 'LG에너지솔루션', '포스코퓨처엠', '엘앤에프', '금양', '피엔티', '엠플러스']
    },
    '반도체': {
        keywords: ['반도체', 'HBM', '칩', '웨이퍼', 'NPU', 'AP'],
        stocks: ['삼성전자', 'SK하이닉스', '태성', '켐트로스', '한미반도체', '원익IPS', '칩스앤미디어', '원익홀딩스', '이오테크닉스', '테크윙', '넥스트칩', '주성엔지니어링', '피에스케이', '리노공업']
    },
    '조선': {
        keywords: ['조선', '선박', '해운'],
        stocks: ['HD현대중공업', '삼성중공업', '한화오션', '현대미포조선', 'STX중공업', 'HD현대미포']
    },
    '원자력': {
        keywords: ['원전', '원자력', 'SMR'],
        stocks: ['두산에너빌리티', '한전KPS', '우진', '비에이치아이', '현대건설', '일진파워', '보성파워텍']
    },
    '자동차': {
        keywords: ['자동차', '전기차', 'EV', '완성차', '모빌리티'],
        stocks: ['현대차', '기아', '현대모비스', 'HL만도', '한라캐스트', '현대위아', '만도', 'S&T모티브', '세종공업', '화신']
    },
    '건설': {
        keywords: ['건설', '주택', '토건', '인프라'],
        stocks: ['삼성물산', 'GS건설', '현대건설', '대우건설', 'DL이앤씨', '코오롱글로벌', 'HDC현대산업개발']
    },
    '방산': {
        keywords: ['방산', '방위', '국방', '무기'],
        stocks: ['한화에어로스페이스', 'LIG넥스원', '한국항공우주', '현대로템', '풍산', '한화시스템']
    },
    // ⭐ NEW: 추가 테마 (티마 앱과 유사하게 확장)
    '항공': {
        keywords: ['항공', '여행', 'LCC', '저비용항공', '항공사'],
        stocks: ['대한항공', '아시아나항공', '제주항공', '진에어', '티웨이항공', '에어부산', '이스타항공']
    },
    'AI/소프트웨어': {
        keywords: ['AI', 'LLM', 'GPT', 'SW', '클라우드', '소프트웨어', '플랫폼'],
        stocks: ['솔트룩스', '셀바스AI', '마인즈랩', '코난테크놀로지', '플리토', '알체라', '라온피플', '오픈엣지테크놀로지']
    },
    '화장품': {
        keywords: ['화장품', '뷰티', 'K-뷰티', '코스메틱', '미용'],
        stocks: ['아모레퍼시픽', 'LG생활건강', '코스맥스', '클리오', '에이블씨엔씨', '토니모리', '한국콜마', '코스메카코리아']
    },
    '게임': {
        keywords: ['게임', 'IP', '모바일게임', 'PC게임'],
        stocks: ['크래프톤', '엔씨소프트', '넷마블', '펄어비스', '위메이드', '컴투스', '카카오게임즈', '네오위즈']
    },
    '엔터/미디어': {
        keywords: ['엔터', 'K-POP', '방송', '미디어', 'OTT', '콘텐츠', '기획사'],
        stocks: ['하이브', 'JYP Ent.', 'SM', 'YG엔터테인먼트', 'CJ ENM', '스튜디오드래곤', 'SBS', '제이콘텐트리']
    },
    '금융/증권': {
        keywords: ['금융', '증권', '은행', '보험', '자산운용'],
        stocks: ['삼성증권', '키움증권', '미래에셋증권', 'KB금융', '신한지주', '하나금융지주', 'NH투자증권', '메리츠금융지주']
    }
};

// 네이버 금융 업종별 시세 크롤링
async function fetchSectorStocks() {
    try {
        const response = await axios.get(SECTOR_BASE_URL, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const html = iconv.decode(response.data, 'EUC-KR');
        const $ = cheerio.load(html);

        const sectors = [];

        // 업종별 테이블 파싱
        $('.type_1 tbody tr').each((i, row) => {
            const $row = $(row);

            // 업종명
            const sectorName = $row.find('td').eq(0).find('a').text().trim();
            if (!sectorName) return;

            // 등락률
            const rateText = $row.find('td').eq(2).text().trim();
            const rateMatch = rateText.match(/([+-]?[\d.]+)%/);
            const rate = rateMatch ? parseFloat(rateMatch[1]) : 0;

            // 거래대금 (억원)
            const amountText = $row.find('td').eq(5).text().trim().replace(/,/g, '');
            const amount = parseInt(amountText, 10) || 0;

            sectors.push({
                name: sectorName,
                rate: rate,
                amount: amount
            });
        });

        return sectors;
    } catch (error) {
        console.error('Failed to fetch sector stocks:', error.message);
        return [];
    }
}

// 특정 업종의 상승 종목 크롤링
async function fetchSectorTopStocks(sectorCode) {
    try {
        const url = `https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=${sectorCode}`;

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

            if ($row.hasClass('blank_tr')) return;

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

            if (rate >= 2) {
                stocks.push({
                    name,
                    code,
                    price,
                    rate,
                    volume,
                    amount: Math.floor(price * volume / 100000000) // 거래대금 추정 (억원)
                });
            }
        });

        // 등락률 기준 정렬
        stocks.sort((a, b) => b.rate - a.rate);

        return stocks.slice(0, 10); // 상위 10개만
    } catch (error) {
        console.error(`Failed to fetch sector ${sectorCode} stocks:`, error.message);
        return [];
    }
}

// 주요 테마별 대표 종목 수집
async function fetchThemeStocks(hotStocks) {
    console.log('Analyzing major themes from hot stocks...');

    const themeResults = {};

    // 각 테마별로 급등주에서 매칭
    for (const [themeName, themeInfo] of Object.entries(THEME_SECTORS)) {
        const matchedStocks = hotStocks.filter(stock => {
            // 종목명 직접 매칭
            if (themeInfo.stocks.includes(stock.name)) {
                return true;
            }

            // 키워드 매칭
            return themeInfo.keywords.some(keyword =>
                stock.name.includes(keyword)
            );
        });

        if (matchedStocks.length > 0) {
            // 등락률 기준 상위 5개
            matchedStocks.sort((a, b) => b.rate - a.rate);
            themeResults[themeName] = matchedStocks.slice(0, 5);
        }
    }

    return themeResults;
}

// 업종별 균형 급등주 수집
async function fetchBalancedHotStocks(hotStocks) {
    console.log('Creating balanced hot stocks list...');

    // 1. 테마별 대표 종목 추출
    const themeStocks = await fetchThemeStocks(hotStocks);

    // 2. 테마별 종목 플랫화
    const balancedStocks = [];
    const addedCodes = new Set();
    const addedNames = new Set();

    // 각 테마에서 상위 N개씩 균등하게
    const maxPerTheme = 5;

    for (const [themeName, stocks] of Object.entries(themeStocks)) {
        console.log(`Theme ${themeName}: ${stocks.length} stocks found`);

        for (let i = 0; i < Math.min(maxPerTheme, stocks.length); i++) {
            const stock = stocks[i];
            if (!addedCodes.has(stock.code)) {
                balancedStocks.push({
                    ...stock,
                    theme: themeName
                });
                addedCodes.add(stock.code);
                addedNames.add(stock.name);
            }
        }
    }

    // ⭐ NEW: 주요 테마의 대표 종목 강제 포함 (등락률 무관)
    // 급등주에 없어도 반드시 포함시켜야 할 종목들
    console.log('Adding must-include theme stocks...');

    // stockCodeMap 가져오기
    const { getStockCode, fetchStockPrice } = require('./market');

    for (const [themeName, themeInfo] of Object.entries(THEME_SECTORS)) {
        // 이미 포함된 종목 수 확인
        const existingCount = balancedStocks.filter(s => s.theme === themeName).length;

        if (existingCount < 3) {
            // 대표 종목 중 아직 안 들어간 것들을 추가
            const missingStocks = themeInfo.stocks.filter(name => !addedNames.has(name));

            for (const stockName of missingStocks.slice(0, 3 - existingCount)) {
                // 종목 코드 조회
                const stockCode = await getStockCode(stockName);

                // 실시간 시세 조회
                const stockData = await fetchStockPrice(stockName, stockCode);

                balancedStocks.push({
                    name: stockName,
                    code: stockCode,
                    rate: stockData.rate || 0,
                    volume: 0,
                    amount: stockData.amount || 0,
                    price: stockData.price || 0,
                    theme: themeName,
                    forced: true // 강제 포함 표시
                });
                addedNames.add(stockName);
                console.log(`  Force added: ${stockName} to ${themeName} (${stockData.rate}%)`);
            }
        }
    }

    // 3. 나머지 급등주 추가 (테마에 속하지 않는 종목들)
    for (const stock of hotStocks) {
        if (!addedCodes.has(stock.code) && balancedStocks.length < 100) {
            balancedStocks.push({
                ...stock,
                theme: '기타'
            });
            addedCodes.add(stock.code);
        }
    }

    console.log(`Balanced hot stocks: ${balancedStocks.length} (from ${Object.keys(themeStocks).length} themes + forced)`);

    return balancedStocks;
}

module.exports = {
    fetchSectorStocks,
    fetchSectorTopStocks,
    fetchThemeStocks,
    fetchBalancedHotStocks,
    THEME_SECTORS,
    CORE_THEME_CANDIDATES,
    OTHER_SECTOR_THEMES
};
