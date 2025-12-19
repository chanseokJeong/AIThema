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

// Pre-compute stock names for fast searching
const ALL_STOCK_NAMES = Object.keys(stockCodeMap);

/**
 * 다양한 뉴스 소스에서 뉴스 수집
 */
async function fetchDiverseNews() {
    console.log('Fetching news from diverse sources...');

    const allNews = [];

    // 이투데이 (현재 URL 404 - 추후 수정 필요)
    // try {
    //     const response = await axios.get(NEWS_SOURCES.etoday.url, {
    //         headers: {
    //             'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    //         },
    //         timeout: 10000
    //     });
    //
    //     const $ = cheerio.load(response.data);
    //     $(NEWS_SOURCES.etoday.selector).each((i, el) => {
    //         if (i >= 20) return; // 상위 20개만
    //
    //         const title = $(el).text().trim();
    //         const href = $(el).attr('href');
    //
    //         if (title && href) {
    //             const fullUrl = href.startsWith('http') ? href : `https://www.etoday.co.kr${href}`;
    //             allNews.push({
    //                 source: 'etoday',
    //                 title,
    //                 link: fullUrl
    //             });
    //         }
    //     });
    //     console.log(`  이투데이: ${allNews.filter(n => n.source === 'etoday').length}개`);
    // } catch (error) {
    //     console.error('  이투데이 크롤링 실패:', error.message);
    // }

    console.log(`  Diverse news sources: ${allNews.length}개 (이투데이 temporarily disabled)`);

    // 한국경제 (시간 관계상 스킵 가능)
    // ... 추가 구현

    return allNews;
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
    fetchStocksFromNews
};
