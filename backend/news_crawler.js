const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { fetchStockPrice, stockCodeMap } = require('./market');

// 다양한 뉴스 소스 정의
const NEWS_SOURCES = {
    etoday: {
        url: 'https://www.etoday.co.kr/news/section/newslist/16', // 증권
        encoding: 'UTF-8',
        selector: '.newslist_box .newslist_title a',
        needsFullFetch: true
    },
    hankyung: {
        url: 'https://www.hankyung.com/finance/stock',
        encoding: 'UTF-8',
        selector: '.news-list .headline a',
        needsFullFetch: true
    },
    mk: {
        url: 'https://www.mk.co.kr/news/stock/',
        encoding: 'UTF-8',
        selector: '.news_list .news_ttl a',
        needsFullFetch: true
    }
};

// 뉴스 중요도 키워드 (가중치 포함)
const IMPORTANCE_KEYWORDS = {
    // 매우 중요 (가중치 5)
    high: [
        '상한가', '하한가', '급등', '급락', '폭등', '폭락',
        '신고가', '52주', '역대', '사상최고', '최대',
        '호실적', '어닝서프라이즈', '실적발표', '흑자전환',
        '대규모계약', '수주', '수출', 'FDA승인', 'CE인증',
        '인수합병', 'M&A', '지분투자', '전략적투자',
        '외국인매수', '기관매수', '순매수'
    ],
    // 중요 (가중치 3)
    medium: [
        '상승', '강세', '주목', '관심',
        '테마', '섹터', '업종', '대장주',
        '공급계약', '납품', '수주잔고',
        'MOU', '업무협약', '파트너십',
        '신제품', '신사업', '진출',
        '배당', '자사주', '무상증자'
    ],
    // 낮음 (가중치 1)
    low: [
        '전망', '예상', '분석', '리포트',
        '추천', '목표가', 'TP',
        '하락', '약세', '조정',
        '시황', '마감', '개장'
    ],
    // 제외 (가중치 -5) - 광고성/노이즈
    exclude: [
        '광고', '후원', '이벤트', '프로모션',
        '무료', '특별가', '할인',
        '종목추천', '급등주추천', '적중',
        'VIP', '유료', '카톡', '텔레그램'
    ]
};

/**
 * 뉴스 중요도 판정 (1-5점)
 * @param {string} title - 뉴스 제목
 * @returns {{score: number, reason: string}}
 */
function calculateNewsImportance(title) {
    let score = 2; // 기본 점수
    const reasons = [];

    // 제외 키워드 체크
    for (const keyword of IMPORTANCE_KEYWORDS.exclude) {
        if (title.includes(keyword)) {
            return { score: 0, reason: `광고성/노이즈 (${keyword})` };
        }
    }

    // 높은 중요도 키워드
    for (const keyword of IMPORTANCE_KEYWORDS.high) {
        if (title.includes(keyword)) {
            score += 2;
            reasons.push(keyword);
        }
    }

    // 중간 중요도 키워드
    for (const keyword of IMPORTANCE_KEYWORDS.medium) {
        if (title.includes(keyword)) {
            score += 1;
            reasons.push(keyword);
        }
    }

    // 점수 제한 (1-5)
    score = Math.min(Math.max(score, 1), 5);

    return {
        score,
        reason: reasons.length > 0 ? reasons.slice(0, 3).join(', ') : '일반 뉴스'
    };
}

// Pre-compute stock names for fast searching
const ALL_STOCK_NAMES = Object.keys(stockCodeMap);

/**
 * 다양한 뉴스 소스에서 뉴스 수집 (개선된 버전)
 */
async function fetchDiverseNews() {
    console.log('Fetching news from diverse sources...');

    const allNews = [];
    const axiosConfig = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
    };

    // 1. 한국경제 증권 뉴스
    try {
        const response = await axios.get('https://www.hankyung.com/finance/stock', axiosConfig);
        const $ = cheerio.load(response.data);

        $('.news-tit, .article-title, .news-list a').each((i, el) => {
            if (i >= 15) return;

            const title = $(el).text().trim();
            const href = $(el).attr('href');

            if (title && title.length > 10 && href) {
                const fullUrl = href.startsWith('http') ? href : `https://www.hankyung.com${href}`;
                const importance = calculateNewsImportance(title);

                if (importance.score > 0) {
                    allNews.push({
                        source: 'hankyung',
                        title,
                        link: fullUrl,
                        importance: importance.score,
                        importanceReason: importance.reason
                    });
                }
            }
        });
        console.log(`  한국경제: ${allNews.filter(n => n.source === 'hankyung').length}개`);
    } catch (error) {
        console.warn('  한국경제 크롤링 실패 (non-critical):', error.message);
    }

    // 2. 매일경제 증권 뉴스
    try {
        const response = await axios.get('https://stock.mk.co.kr/news', axiosConfig);
        const $ = cheerio.load(response.data);

        $('a.news_item, .news_ttl a, .news-list a').each((i, el) => {
            if (i >= 15) return;

            const title = $(el).text().trim();
            const href = $(el).attr('href');

            if (title && title.length > 10 && href) {
                const fullUrl = href.startsWith('http') ? href : `https://www.mk.co.kr${href}`;
                const importance = calculateNewsImportance(title);

                if (importance.score > 0) {
                    allNews.push({
                        source: 'mk',
                        title,
                        link: fullUrl,
                        importance: importance.score,
                        importanceReason: importance.reason
                    });
                }
            }
        });
        console.log(`  매일경제: ${allNews.filter(n => n.source === 'mk').length}개`);
    } catch (error) {
        console.warn('  매일경제 크롤링 실패 (non-critical):', error.message);
    }

    // 3. 서울경제 증권 뉴스
    try {
        const response = await axios.get('https://www.sedaily.com/NewsListA/GB', axiosConfig);
        const $ = cheerio.load(response.data);

        $('.sub_news_list a, .news_list a').each((i, el) => {
            if (i >= 10) return;

            const title = $(el).text().trim();
            const href = $(el).attr('href');

            if (title && title.length > 10 && href) {
                const fullUrl = href.startsWith('http') ? href : `https://www.sedaily.com${href}`;
                const importance = calculateNewsImportance(title);

                if (importance.score > 0) {
                    allNews.push({
                        source: 'sedaily',
                        title,
                        link: fullUrl,
                        importance: importance.score,
                        importanceReason: importance.reason
                    });
                }
            }
        });
        console.log(`  서울경제: ${allNews.filter(n => n.source === 'sedaily').length}개`);
    } catch (error) {
        console.warn('  서울경제 크롤링 실패 (non-critical):', error.message);
    }

    // 중복 제거 (제목 기준)
    const seen = new Set();
    const uniqueNews = allNews.filter(news => {
        const key = news.title.replace(/\s+/g, '').substring(0, 30);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // 중요도 순 정렬
    uniqueNews.sort((a, b) => (b.importance || 2) - (a.importance || 2));

    console.log(`  Diverse news total: ${uniqueNews.length}개 (중복제거 후)`);

    return uniqueNews;
}

/**
 * 뉴스 필터링 (중요도 기준)
 * @param {Array} newsList - 뉴스 리스트
 * @param {number} minImportance - 최소 중요도 (default: 2)
 * @returns {Array} 필터링된 뉴스
 */
function filterNewsByImportance(newsList, minImportance = 2) {
    return newsList.filter(news => {
        const importance = news.importance || calculateNewsImportance(news.title).score;
        return importance >= minImportance;
    });
}

/**
 * 뉴스 본문에서 종목명 추출
 * @param {string} newsUrl - 뉴스 URL
 * @returns {Promise<Array>} 종목명 리스트
 */
async function extractStocksFromNews(newsUrl) {
    try {
        const response = await axios.get(newsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // 방법 1: 기사 본문 추출 (다양한 셀렉터 시도)
        let bodyText = '';
        const selectors = [
            '#articleBodyContents',  // Naver news
            '#articeBody',           // Naver news alternative
            '.article_body',         // Generic
            '.news_body',            // Generic
            'article',               // Generic HTML5
            '#news_body_area'        // Naver finance
        ];

        for (const selector of selectors) {
            const text = $(selector).text();
            if (text && text.length > bodyText.length) {
                bodyText = text;
            }
        }

        // 전체 페이지 텍스트 fallback
        if (bodyText.length < 100) {
            bodyText = $('body').text();
        }

        // console.log(`    Extracted ${bodyText.length} chars from ${newsUrl.substring(0, 50)}...`);

        const foundStocks = new Set();

        // 패턴 1: 종목코드가 함께 있는 경우 (가중치 높음)
        const stockNamePatterns = [
            /([가-힣A-Z]{2,10})\s*\((\d{6})\)/g, // "삼성전자(005930)" 패턴
        ];

        const matches1 = bodyText.matchAll(stockNamePatterns[0]);
        for (const match of matches1) {
            if (match[1] && match[2]) {
                foundStocks.add(match[1].trim());
            }
        }

        // 패턴 2: 전체 종목 리스트 매칭 (본문 검색)
        // 성능 최적화를 위해 본문 길이가 너무 길면 앞부분 2000자만 검색
        const searchTarget = bodyText.length > 2000 ? bodyText.substring(0, 2000) : bodyText;

        for (const stockName of ALL_STOCK_NAMES) {
            // 2글자 이상인 종목만 검색 (오탐 방지)
            if (stockName.length >= 2 && searchTarget.includes(stockName)) {
                foundStocks.add(stockName);
            }
        }

        if (foundStocks.size > 0) {
            // console.log(`    Found stocks: ${Array.from(foundStocks).join(', ')}`);
        }

        return Array.from(foundStocks);

    } catch (error) {
        console.error(`    Failed to extract from ${newsUrl.substring(0, 50)}: ${error.message}`);
        return [];
    }
}

/**
 * 뉴스 제목에서 종목명 추출 (간단하고 빠른 방법)
 * @param {string} title - 뉴스 제목
 * @returns {Array} 종목명 리스트
 */
function extractStocksFromTitle(title) {
    const foundStocks = new Set();

    // 전체 종목 리스트 매칭
    for (const stockName of ALL_STOCK_NAMES) {
        // 2글자 이상인 종목만 검색
        if (stockName.length >= 2 && title.includes(stockName)) {
            foundStocks.add(stockName);
        }
    }

    // 종목코드 패턴 매칭: "삼성전자(005930)"
    const codePattern = /([가-힣A-Z]{2,10})\s*\((\d{6})\)/g;
    const matches = title.matchAll(codePattern);
    for (const match of matches) {
        if (match[1]) {
            foundStocks.add(match[1].trim());
        }
    }

    return Array.from(foundStocks);
}

/**
 * 뉴스 기반 종목 발굴
 * @param {Array} newsList - 뉴스 리스트
 * @returns {Promise<Array>} 종목 리스트 (시세 포함)
 */
async function fetchStocksFromNews(newsList) {
    console.log('Extracting stocks from news titles...');

    const allStockNames = new Set();

    // 1단계: 제목에서 빠르게 추출 (모든 뉴스)
    for (const news of newsList) {
        const stockNames = extractStocksFromTitle(news.title);
        stockNames.forEach(name => allStockNames.add(name));
    }

    console.log(`  Found ${allStockNames.size} unique stocks from news titles`);

    // 2단계: 제목에서 못 찾았으면 상위 5개만 본문 파싱 시도
    if (allStockNames.size < 10) {
        console.log(`  Trying article body extraction for top 5 news...`);
        for (const news of newsList.slice(0, 5)) {
            const stockNames = await extractStocksFromNews(news.link);
            stockNames.forEach(name => allStockNames.add(name));
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.log(`  After body extraction: ${allStockNames.size} stocks`);
    }

    // 각 종목의 시세 조회
    const stocksWithPrice = [];

    for (const stockName of Array.from(allStockNames)) {
        const stockData = await fetchStockPrice(stockName);

        if (stockData && stockData.rate !== 0) {
            stocksWithPrice.push({
                ...stockData,
                fromNews: true
            });
            // console.log(`  ${stockName}: ${stockData.rate}%`);
        }

        // API 부하 방지
        await new Promise(resolve => setTimeout(resolve, 100)); // 300 -> 100 (faster)
    }

    return stocksWithPrice;
}

module.exports = {
    fetchDiverseNews,
    extractStocksFromNews,
    fetchStocksFromNews,
    calculateNewsImportance,
    filterNewsByImportance
};
