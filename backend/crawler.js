const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const NAVER_NEWS_URL = 'https://finance.naver.com/news/mainnews.naver';
const DAUM_NEWS_URL = 'https://finance.daum.net/news'; // Note: Daum often uses API, might need different approach if HTML is empty.

// Helper to fetch with encoding support
async function fetchUrl(url, encoding = 'UTF-8') {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        return iconv.decode(response.data, encoding);
    } catch (error) {
        console.error(`Failed to fetch ${url}:`, error.message);
        return null;
    }
}

async function fetchNaverNews() {
    const html = await fetchUrl(NAVER_NEWS_URL, 'EUC-KR');
    if (!html) return [];

    const $ = cheerio.load(html);
    const newsList = [];

    // Selectors for Naver Finance Main News
    $('.block1 .articleSubject a, .mainNewsList li a').each((i, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr('href');
        if (title && href) {
            newsList.push({
                source: 'Naver',
                title,
                link: 'https://finance.naver.com' + href
            });
        }
    });

    return newsList;
}

// Daum Finance often renders via JS or API. 
// For this standalone crawler, we'll try a direct scraping of their news section if possible, 
// or fallback to another Naver section to simulate "multi-source" if Daum is blocked.
// Let's try fetching Daum's breaking news RSS or similar if available, but for now, 
// let's add Naver's "Breaking News" section as a second source to ensure volume.
const NAVER_BREAKING_URL = 'https://finance.naver.com/news/news_list.naver?mode=LSS2D&section_id=101&section_id2=258';

// Search for "특징주" (Feature Stock) to get highly relevant theme news
// Query: 특징주 (EUC-KR encoded: %C6%AF%C2%A1%C1%D6)
const NAVER_SEARCH_URL = 'https://finance.naver.com/news/news_search.naver?q=%C6%AF%C2%A1%C1%D6&x=0&y=0&sm=all.basic';

async function fetchFeatureStocks() {
    const newsList = [];

    // Fetch pages 1 and 2 to get more coverage
    for (let page = 1; page <= 2; page++) {
        const pageUrl = `${NAVER_SEARCH_URL}&page=${page}`;
        const html = await fetchUrl(pageUrl, 'EUC-KR');
        if (!html) continue;

        const $ = cheerio.load(html);

        // Search results structure
        $('.newsSchResult .newsList .articleSubject a').each((i, el) => {
            const title = $(el).text().trim();
            const href = $(el).attr('href');
            if (title && href) {
                newsList.push({
                    source: 'NaverFeature',
                    title,
                    link: 'https://finance.naver.com' + href
                });
            }
        });
    }

    return newsList;
}

async function fetchNaverBreaking() {
    const html = await fetchUrl(NAVER_BREAKING_URL, 'EUC-KR');
    if (!html) return [];

    const $ = cheerio.load(html);
    const newsList = [];

    $('.articleSubject a').each((i, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr('href');
        if (title && href) {
            newsList.push({
                source: 'NaverBreaking',
                title,
                link: 'https://finance.naver.com' + href
            });
        }
    });

    return newsList;
}

async function fetchNews() {
    console.log('Crawling news (Targeting Feature Stocks)...');

    // Prioritize Feature Stocks, then Breaking News
    const [featureNews, breakingNews] = await Promise.all([
        fetchFeatureStocks(),
        fetchNaverBreaking()
    ]);

    // Combine: Feature News first as they are more likely to contain themes
    const allNews = [...featureNews, ...breakingNews];

    // Deduplication
    const uniqueNews = [];
    const seenTitles = new Set();

    for (const news of allNews) {
        // Simple normalization
        const normalizedTitle = news.title.replace(/[\s\W]/g, '');
        if (!seenTitles.has(normalizedTitle)) {
            seenTitles.add(normalizedTitle);
            uniqueNews.push(news);
        }
    }

    console.log(`Crawled ${allNews.length} items. After deduplication: ${uniqueNews.length}`);
    return uniqueNews;
}

module.exports = { fetchNews };
