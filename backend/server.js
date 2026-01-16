const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { fetchNews } = require('./crawler');
const { analyzeThemes } = require('./analyzer');
const { fetchMarketData, enrichStockWithHotData, isNoiseStock } = require('./market');
const { fetchHotStocks } = require('./rising_stocks');
const { fetchBalancedHotStocks, THEME_SECTORS } = require('./sector_analyzer');
const { enrichHotStocksWithSector } = require('./sector_crawler');
const { fetchDiverseNews, fetchStocksFromNews } = require('./news_crawler');
const { fetchTopThemesWithStocks } = require('./theme_crawler');
const { fetchIPOStocks, isIPOStock } = require('./ipo_crawler');
const { selectFinalThemes } = require('./theme_selector');
const { convertNaverToThemes, mergeThemes } = require('./theme_merger');
const { groupThemes, generateThemeSummary } = require('./theme_grouper');
const { getMarketStatus: getNxtMarketStatus } = require('./naver_api');
const { getBulkInvestorData, calculateSupplyScore, calculateShortRisk } = require('./investor');

// ===== 로그 파일 설정 =====
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFileName() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(LOG_DIR, `server-${dateStr}.log`);
}

function writeLog(level, message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}\n`;

    // 콘솔 출력
    if (level === 'ERROR') {
        process.stderr.write(logLine);
    } else {
        process.stdout.write(logLine);
    }

    // 파일에 저장
    try {
        fs.appendFileSync(getLogFileName(), logLine);
    } catch (err) {
        process.stderr.write(`Failed to write log: ${err.message}\n`);
    }
}

// 기존 console.log/error를 래핑
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    writeLog('INFO', message);
};

console.error = (...args) => {
    const message = args.map(a => {
        if (a instanceof Error) return `${a.message}\n${a.stack}`;
        if (typeof a === 'object') return JSON.stringify(a);
        return String(a);
    }).join(' ');
    writeLog('ERROR', message);
};

// ===== 전역 에러 핸들러 (서버 비정상 종료 방지) =====
process.on('uncaughtException', (err) => {
    console.error('=== Uncaught Exception ===');
    console.error('Time:', new Date().toISOString());
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    console.error('==========================');
    // 프로세스를 종료하지 않고 계속 실행
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('=== Unhandled Rejection ===');
    console.error('Time:', new Date().toISOString());
    console.error('Reason:', reason);
    console.error('===========================');
    // 프로세스를 종료하지 않고 계속 실행
});

// SIGTERM/SIGINT 시그널 처리 (graceful shutdown)
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Cache to store the latest analyzed data
let cachedThemes = [];
let cachedHotStocks = [];
let cachedBalancedHotStocks = [];
let cachedIPOStocks = [];
let lastUpdated = 0;

// 1. Theme Update Loop (Hot Stocks + News + AI)
async function updateThemes() {
    try {
        console.log('=== Theme Update Started ===');

        // Step 1: 급등주 수집 (최우선)
        console.log('Step 1: Fetching hot stocks...');
        const rawHotStocks = await fetchHotStocks();
        // ⭐ NEW: 필터링 적용 (초기 단계에서 스팩/우선주 제거)
        const filteredHotStocks = rawHotStocks.filter(s => !isNoiseStock(s.name));
        console.log(`Raw hot stocks: ${rawHotStocks.length} -> Filtered: ${filteredHotStocks.length}`);

        // Step 1.2: 업종 코드 기반 급등주 추가 수집
        console.log('Step 1.2: Enriching with sector-based stocks...');
        const enrichedHotStocks = await enrichHotStocksWithSector(filteredHotStocks, 0); // 0% 이상으로 확대 (보합 포함)
        console.log(`Sector-enriched: ${enrichedHotStocks.length}`);

        // Step 1.5: 섹터 균형 급등주 생성
        console.log('Step 1.5: Creating balanced hot stocks...');
        const balancedHotStocks = await fetchBalancedHotStocks(enrichedHotStocks);
        cachedBalancedHotStocks = balancedHotStocks;
        console.log(`Balanced hot stocks: ${balancedHotStocks.length}`);

        // 테마별 분포 출력
        const themeDistribution = {};
        balancedHotStocks.forEach(stock => {
            const theme = stock.theme || '기타';
            themeDistribution[theme] = (themeDistribution[theme] || 0) + 1;
        });
        console.log('Theme distribution:', themeDistribution);

        // Step 2: 뉴스 수집 (다양한 소스)
        console.log('Step 2: Fetching news from diverse sources...');
        const naverNews = await fetchNews();
        const diverseNews = await fetchDiverseNews();
        const allNews = [...naverNews, ...diverseNews];
        console.log(`News collected: ${naverNews.length} (Naver) + ${diverseNews.length} (Others) = ${allNews.length} total`);

        // Step 2.5: 뉴스에서 종목 추출 및 시세 조회 ⭐ NEW (티마 방식)
        console.log('Step 2.5: Extracting stocks from news articles...');
        const newsBasedStocks = await fetchStocksFromNews(allNews);
        console.log(`Stocks from news: ${newsBasedStocks.length}`);

        // Step 2.7: 뉴스 기반 종목을 enrichedHotStocks에 병합
        const newsStockCodes = new Set(newsBasedStocks.map(s => s.code).filter(c => c));
        const existingCodes = new Set(enrichedHotStocks.map(s => s.code).filter(c => c));

        for (const stock of newsBasedStocks) {
            // ⭐ NEW: 필터링 적용
            if (isNoiseStock(stock.name)) continue;

            if (stock.code && !existingCodes.has(stock.code)) {
                enrichedHotStocks.push(stock);
                existingCodes.add(stock.code);
            }
        }

        cachedHotStocks = enrichedHotStocks;
        console.log(`Total enriched stocks (with news): ${enrichedHotStocks.length}`);

        // Step 2.8: ⭐ HYBRID - 네이버 테마 페이지에서 테마-종목 매핑 수집 (주요 소스)
        console.log('Step 2.8: Fetching Naver theme data (PRIMARY SOURCE)...');
        let naverThemesRaw = {};
        try {
            naverThemesRaw = await fetchTopThemesWithStocks(30); // 상위 30개 테마 (하이브리드 방식)
            const naverThemeCount = Object.keys(naverThemesRaw).length;
            console.log(`Naver themes collected: ${naverThemeCount}`);

            // 네이버 테마 종목을 enrichedHotStocks에 병합
            let naverStockAdded = 0;
            for (const [themeName, themeData] of Object.entries(naverThemesRaw)) {
                for (const stock of themeData.stocks) {
                    if (isNoiseStock(stock.name)) continue;
                    if (!existingCodes.has(stock.code)) {
                        enrichedHotStocks.push({
                            ...stock,
                            theme: themeName,
                            source: 'naver_theme'
                        });
                        existingCodes.add(stock.code);
                        naverStockAdded++;
                    }
                }
            }
            console.log(`Added ${naverStockAdded} stocks from Naver themes`);
        } catch (naverError) {
            console.warn('Naver theme fetch failed:', naverError.message);
        }

        // Step 2.9: IPO 종목 수집
        console.log('Step 2.9: Fetching IPO stocks...');
        try {
            const ipoData = await fetchIPOStocks(30); // 30일 이내 신규상장
            cachedIPOStocks = ipoData.stocks || [];
            console.log(`IPO stocks collected: ${cachedIPOStocks.length}`);
        } catch (ipoError) {
            console.warn('IPO fetch failed (non-critical):', ipoError.message);
        }

        // Step 3: ⭐ HYBRID - 네이버 테마 기반 기본 테마 생성 (주요 소스)
        console.log('Step 3: Converting Naver themes to base themes (PRIMARY)...');
        let baseThemes = convertNaverToThemes(naverThemesRaw, enrichedHotStocks);
        console.log(`Base themes from Naver: ${baseThemes.length}`);

        // Step 3.5: AI 분석 (보조 - 선택적, 실패해도 계속 진행)
        console.log('Step 3.5: AI analysis for hot theme detection (SECONDARY)...');
        let aiThemes = [];
        try {
            if (allNews.length > 0 || balancedHotStocks.length > 0) {
                aiThemes = await analyzeThemes(allNews, balancedHotStocks);
                console.log(`AI themes detected: ${aiThemes.length}`);
            }
        } catch (aiError) {
            console.warn('AI analysis failed (non-critical, using Naver themes only):', aiError.message);
        }

        // Step 3.6: ⭐ HYBRID - 네이버 테마 + AI 분석 결과 병합
        console.log('Step 3.6: Merging Naver themes with AI analysis...');
        let analyzedThemes = mergeThemes(baseThemes, aiThemes, balancedHotStocks);
        console.log(`Merged themes: ${analyzedThemes.length} (hot: ${analyzedThemes.filter(t => t.isHot).length})`);

        // Step 3.7: 주요 테마 강제 추가 (병합 후에도 누락된 테마 보완)
        console.log('Step 3.7: Adding missing major themes...');
        analyzedThemes = await addMissingMajorThemes(analyzedThemes, balancedHotStocks);

        // Step 4: 테마별 종목 데이터 enrichment + 필터링 ⭐ IMPROVED
        console.log('Step 4: Enriching stock data...');
        const { fetchStockPrice } = require('./market');
        const MIN_RATE_THRESHOLD = 0.0; // 최소 0.0% 이상 (보합 포함)으로 완화하여 종목 수 확보

        // ⭐ NEW: AI가 누락한 우량 눌림목 종목(거래대금 300억 이상) 강제 주입
        // AI는 등락률이 낮으면 제외하는 경향이 있으므로, 섹터 크롤러가 찾은 중요 종목을 다시 넣어줍니다.
        const dipStocks = balancedHotStocks.filter(s => s.theme && (s.amount || 0) >= 30000);

        analyzedThemes.forEach(theme => {
            // 테마 이름이 일치하거나 포함되는 경우 (예: '로봇' == '로봇')
            const relevantDips = dipStocks.filter(d => theme.name.includes(d.theme) || d.theme.includes(theme.name));
            relevantDips.forEach(d => {
                if (!theme.stocks.includes(d.name)) {
                    console.log(`  Force injecting dip stock: ${d.name} -> ${theme.name} (${d.rate}%, ${d.amount}억)`);
                    theme.stocks.push(d.name);
                }
            });
        });

        const enrichedThemes = await Promise.all(analyzedThemes.map(async (theme) => {
            // ⭐ FIX: 중복 종목 제거 시 상한가/하한가/VI 정보 보존
            // theme.stocks가 객체 배열일 수도 있고 string 배열일 수도 있음
            const stockMap = new Map(); // name → stock object (상한가/VI 정보 포함된 것 우선)
            for (const stock of theme.stocks) {
                const name = typeof stock === 'string' ? stock : stock.name;
                if (!name) continue;

                const existing = stockMap.get(name);
                if (!existing) {
                    // 최초 발견: 그대로 저장
                    stockMap.set(name, typeof stock === 'string' ? { name: stock } : stock);
                } else {
                    // 중복 발견: 상한가/하한가/VI 정보가 있는 쪽으로 업데이트
                    const stockObj = typeof stock === 'string' ? { name: stock } : stock;
                    if ((stockObj.isLimit && !existing.isLimit) ||
                        (stockObj.isVI && !existing.isVI) ||
                        (stockObj.limitType && !existing.limitType)) {
                        // 새 종목에 상한가/VI 정보가 있으면 기존 정보와 병합
                        stockMap.set(name, { ...existing, ...stockObj });
                    }
                }
            }
            const uniqueStocks = Array.from(stockMap.values());
            console.log(`  Theme "${theme.name}": ${theme.stocks.length} stocks → ${uniqueStocks.length} unique`);

            const enrichedStocks = await Promise.all(uniqueStocks.map(async (stockInfo) => {
                const stockName = stockInfo.name;
                // 원본 종목 정보에서 상한가/하한가/VI 정보 추출 (보존용)
                const originalLimitInfo = {
                    isLimit: stockInfo.isLimit || false,
                    limitType: stockInfo.limitType || null,
                    limitText: stockInfo.limitText || null,
                    isVI: stockInfo.isVI || false,
                    viType: stockInfo.viType || null,
                    viText: stockInfo.viText || null
                };

                // 균형잡힌 급등주 데이터에서 먼저 찾기
                const hotData = enrichStockWithHotData(stockName, balancedHotStocks);

                // ⭐ NEW: 캔들 차트를 위해 상세 데이터(시가/고가/저가)가 필요함
                console.log(`  Fetching detailed OHLC for ${stockName}...`);
                const liveData = await fetchStockPrice(stockName);

                // 실시간 조회 실패 시 hotData라도 사용 (fallback)
                if (!liveData || liveData.price === 0) {
                    if (hotData) {
                        // ⭐ FIX: hotData에 원본 상한가/VI 정보 병합
                        return { ...hotData, ...originalLimitInfo, isLimit: hotData.isLimit || originalLimitInfo.isLimit, isVI: hotData.isVI || originalLimitInfo.isVI };
                    }
                }

                // ⭐ NEW: 필터링 로직 개선 (눌림목 포함)
                const amount = liveData.amount || 0;
                const isDipBuyingCandidate = liveData.rate >= -10.0 && amount >= 300;

                if (liveData.rate < MIN_RATE_THRESHOLD && !isDipBuyingCandidate) {
                    return null;
                }

                // ⭐ FIX: liveData와 원본 상한가/VI 정보 병합 (liveData 우선, 없으면 원본 사용)
                return {
                    ...liveData,
                    isLimit: liveData.isLimit || originalLimitInfo.isLimit,
                    limitType: liveData.limitType || originalLimitInfo.limitType,
                    limitText: liveData.limitText || originalLimitInfo.limitText,
                    isVI: liveData.isVI || originalLimitInfo.isVI,
                    viType: liveData.viType || originalLimitInfo.viType,
                    viText: liveData.viText || originalLimitInfo.viText
                };
            }));

            // null 제거 (필터링된 종목 제외)
            let validStocks = enrichedStocks.filter(s => s !== null);

            // ⭐ 등락률 기준 정렬 (가중치: 거래대금 고려)
            // NOTE: 여기서는 15개까지 유지 (강세 테마 분할을 위해)
            // 최종 5개 제한은 theme_selector의 splitLargeThemes에서 처리
            validStocks.sort((a, b) => {
                const scoreA = (a.rate || 0) + ((a.amount || 0) / 100);
                const scoreB = (b.rate || 0) + ((b.amount || 0) / 100);
                return scoreB - scoreA;
            });
            validStocks = validStocks.slice(0, 15); // 분할 고려하여 15개 유지

            // Step 5: 점수 계산 (평균 등락률) 및 총 거래대금 계산
            const score = calculateThemeScore(validStocks);
            const totalVolume = validStocks.reduce((sum, s) => sum + (s.amount || 0), 0);

            return {
                ...theme,
                stocks: validStocks,
                score: score,
                totalVolume: totalVolume,
                id: theme.name // ID가 없으면 이름 사용
            };
        }));

        // Step 4.5: ⭐ 수급 데이터는 백그라운드에서 수집 (테마 표시 먼저)
        // 수급 데이터 수집을 백그라운드로 분리하여 테마 데이터를 먼저 표시
        console.log('Step 4.5: Investor data will be fetched in background...');

        // Step 5.5: ⭐ 테마 그룹핑 (유사 테마 통합 + 재벌 그룹 감지)
        console.log('Step 5.5: Grouping similar themes...');
        const groupedThemes = groupThemes(enrichedThemes, 15); // 최대 15개로 압축
        console.log(`Grouped themes: ${groupedThemes.length} (from ${enrichedThemes.length})`);
        console.log(`Theme summary: ${groupedThemes.map(t => t.name).join(', ')}`);

        // Step 6: 최종 테마 선정 (핵심 7개 + 특수 분류 3개 = 최대 10개)
        console.log('Step 6: Selecting final themes (max 10)...');
        const selectedThemes = await selectFinalThemes(
            groupedThemes, // enrichedThemes 대신 groupedThemes 사용
            cachedIPOStocks,
            balancedHotStocks,
            { maxCoreThemes: 7, maxTotalThemes: 10, themeSectors: THEME_SECTORS }
        );

        // ⭐ 별 등급 시스템 적용 (시간대 + 조건 기반)
        // - 장 초반(9:00-9:30): 별 부여 안함 (관망)
        // - 오전장(9:30-11:00): 최대 1성
        // - 점심~오후(11:00-14:00): 최대 2성
        // - 장 후반(14:00-15:30): 최대 3성
        const phase = getMarketPhase();
        console.log(`Market phase: ${phase}, Max stars: ${MAX_STARS_BY_PHASE[phase]}`);

        const finalThemes = selectedThemes.map(t => {
            const rating = calculateStarRating(t);
            return {
                ...t,
                stars: rating.stars,
                starReason: rating.reason,
                // 하위 호환성: isLeader는 1성 이상이면 true
                isLeader: rating.stars >= 1
            };
        });

        // 핵심 테마는 rankScore 순, 특수 분류는 뒤에 유지
        finalThemes.sort((a, b) => {
            // 특수 분류는 항상 뒤로
            if (a.isSpecial && !b.isSpecial) return 1;
            if (!a.isSpecial && b.isSpecial) return -1;
            // 같은 타입이면 rankScore 또는 score 순
            return (b.rankScore || b.score || 0) - (a.rankScore || a.score || 0);
        });

        cachedThemes = finalThemes;
        lastUpdated = Date.now();
        console.log(`Theme update complete. Found ${cachedThemes.length} themes.`);
        console.log('=== Theme Update Finished ===\n');

        // ⭐ 백그라운드에서 수급 데이터 수집 시작 (테마 표시 후)
        updateInvestorDataInBackground();
    } catch (error) {
        console.error('Theme update failed:', error);
    }
}

// ⭐ 백그라운드 수급 데이터 수집 함수
async function updateInvestorDataInBackground() {
    if (cachedThemes.length === 0) return;

    console.log('=== Background Investor Data Update Started ===');

    try {
        // 모든 테마의 종목 코드 수집
        const allStockCodes = [];
        const codeToStockMap = new Map();

        cachedThemes.forEach(theme => {
            theme.stocks.forEach(stock => {
                if (stock.code && !codeToStockMap.has(stock.code)) {
                    allStockCodes.push(stock.code);
                    codeToStockMap.set(stock.code, stock);
                }
            });
        });

        console.log(`[Background] Fetching investor data for ${allStockCodes.length} stocks...`);

        // 일괄 수급 데이터 조회
        const investorDataList = await getBulkInvestorData(allStockCodes);

        // 종목에 수급 데이터 병합
        let enrichedCount = 0;
        investorDataList.forEach(data => {
            if (data && data.code) {
                const stock = codeToStockMap.get(data.code);
                if (stock) {
                    stock.investorData = data;
                    enrichedCount++;
                }
            }
        });

        console.log(`[Background] Investor data enriched: ${enrichedCount}/${allStockCodes.length} stocks`);

        // 테마별 점수 재계산 (수급 보너스 포함)
        cachedThemes.forEach(theme => {
            const scoreResult = calculateThemeScore(theme.stocks, true);
            if (typeof scoreResult === 'object') {
                theme.score = scoreResult.score;
                theme.baseScore = scoreResult.baseScore;
                theme.supplyBonus = scoreResult.supplyBonus;
                theme.shortPenalty = scoreResult.shortPenalty;
            }

            // 테마 수준의 수급 요약 계산
            const investorSummary = calculateThemeInvestorSummary(theme.stocks);
            theme.investorSummary = investorSummary;
        });

        lastUpdated = Date.now();
        console.log('=== Background Investor Data Update Finished ===\n');
    } catch (error) {
        console.warn('[Background] Investor data update failed (non-critical):', error.message);
    }
}

// 2. Price Update Loop (Real-time Market Data)
async function updatePrices() {
    if (cachedThemes.length === 0) return;

    try {
        console.log('Updating stock prices (real-time)...');

        // 급등주 데이터 새로고침
        const rawHotStocks = await fetchHotStocks();
        // ⭐ NEW: 필터링 적용 (가격 업데이트 시에도 노이즈 제거)
        const filteredHotStocks = rawHotStocks.filter(s => !isNoiseStock(s.name));

        // 업종 기반 급등주 보강
        const enrichedHotStocks = await enrichHotStocksWithSector(filteredHotStocks, 0); // 2 -> 0 (기준 완화)
        cachedHotStocks = enrichedHotStocks;

        // 균형잡힌 급등주 새로고침
        const balancedHotStocks = await fetchBalancedHotStocks(enrichedHotStocks);
        cachedBalancedHotStocks = balancedHotStocks;

        // 각 테마별 종목 데이터 업데이트 + 필터링 ⭐ IMPROVED
        const { fetchStockPrice } = require('./market');
        const MIN_RATE_THRESHOLD = 0.0; // 최소 0.0% 이상 (보합 포함)

        const enrichedThemes = await Promise.all(cachedThemes.map(async (theme) => {
            const enrichedStocks = await Promise.all(theme.stocks.map(async (stock) => {
                // ⭐ FIX: 원본 상한가/하한가/VI 정보 보존
                const originalLimitInfo = {
                    isLimit: stock.isLimit || false,
                    limitType: stock.limitType || null,
                    limitText: stock.limitText || null,
                    isVI: stock.isVI || false,
                    viType: stock.viType || null,
                    viText: stock.viText || null
                };

                // 균형잡힌 급등주 데이터에서 찾기
                const hotData = enrichStockWithHotData(stock.name, balancedHotStocks);
                if (hotData) {
                    // ⭐ FIX: hotData와 원본 상한가/VI 정보 병합
                    return {
                        ...hotData,
                        isLimit: hotData.isLimit || originalLimitInfo.isLimit,
                        limitType: hotData.limitType || originalLimitInfo.limitType,
                        limitText: hotData.limitText || originalLimitInfo.limitText,
                        isVI: hotData.isVI || originalLimitInfo.isVI,
                        viType: hotData.viType || originalLimitInfo.viType,
                        viText: hotData.viText || originalLimitInfo.viText
                    };
                }
                // 원본 급등주에서 찾기
                const rawHotData = enrichStockWithHotData(stock.name, rawHotStocks);
                if (rawHotData) {
                    return {
                        ...rawHotData,
                        isLimit: rawHotData.isLimit || originalLimitInfo.isLimit,
                        limitType: rawHotData.limitType || originalLimitInfo.limitType,
                        limitText: rawHotData.limitText || originalLimitInfo.limitText,
                        isVI: rawHotData.isVI || originalLimitInfo.isVI,
                        viType: rawHotData.viType || originalLimitInfo.viType,
                        viText: rawHotData.viText || originalLimitInfo.viText
                    };
                }
                // 실시간 시세 조회
                const liveData = await fetchStockPrice(stock.name);

                // 필터링: 양전 OR 거래대금 300억+ 눌림목
                const amount = liveData.amount || 0;
                const isDipBuyingCandidate = liveData.rate >= -10.0 && amount >= 300;

                if (liveData.rate < MIN_RATE_THRESHOLD && !isDipBuyingCandidate) {
                    return null;
                }

                // ⭐ FIX: liveData와 원본 상한가/VI 정보 병합
                return {
                    ...liveData,
                    isLimit: liveData.isLimit || originalLimitInfo.isLimit,
                    limitType: liveData.limitType || originalLimitInfo.limitType,
                    limitText: liveData.limitText || originalLimitInfo.limitText,
                    isVI: liveData.isVI || originalLimitInfo.isVI,
                    viType: liveData.viType || originalLimitInfo.viType,
                    viText: liveData.viText || originalLimitInfo.viText
                };
            }));

            // null 제거
            let validStocks = enrichedStocks.filter(s => s !== null);

            // ⭐ 등락률 기준 정렬 후 최대 5개로 제한 -> 가중치 정렬로 변경
            validStocks.sort((a, b) => {
                const scoreA = (a.rate || 0) + ((a.amount || 0) / 100);
                const scoreB = (b.rate || 0) + ((b.amount || 0) / 100);
                return scoreB - scoreA;
            });
            validStocks = validStocks.slice(0, 5);

            // 점수 재계산
            const score = calculateThemeScore(validStocks);
            const totalVolume = validStocks.reduce((sum, s) => sum + (s.amount || 0), 0);

            return {
                ...theme,
                stocks: validStocks,
                score: score,
                totalVolume: totalVolume
            };
        }));

        // ⭐ NEW: 별 등급 시스템 적용 (실시간 업데이트)
        const finalThemes = enrichedThemes.map(t => {
            const rating = calculateStarRating(t);
            return {
                ...t,
                stars: rating.stars,
                starReason: rating.reason,
                isLeader: rating.stars >= 1
            };
        });

        // Sort by Score (descending) - 사용자 요청
        finalThemes.sort((a, b) => b.score - a.score);

        cachedThemes = finalThemes;
        console.log('Price update complete.');
    } catch (error) {
        console.error('Price update failed:', error);
    }
}

// 주요 테마 강제 추가 함수 ⭐ NEW
async function addMissingMajorThemes(analyzedThemes, balancedHotStocks) {
    // 이미 존재하는 테마명 추출
    const existingThemeNames = analyzedThemes.map(t => t.name.toLowerCase());

    // 주요 테마 키워드 정의 (⭐ 확장)
    const majorThemes = {
        '로봇': { keywords: ['로봇', '로보'], stocks: ['레인보우로보틱스', '두산로보틱스', '로보티즈', '유진로봇', '휴림로봇', '디아이씨'] },
        '바이오': { keywords: ['바이오', '제약', '셀트리온'], stocks: ['셀트리온', '삼성바이오로직스', '에이비엘바이오'] },
        '2차전지': { keywords: ['2차전지', '배터리'], stocks: ['에코프로', '에코프로비엠', 'LG에너지솔루션'] },
        '반도체': { keywords: ['반도체', 'HBM', '칩'], stocks: ['삼성전자', 'SK하이닉스', '칩스앤미디어', '원익홀딩스', '한미반도체', '넥스트칩'] },
        '자동차': { keywords: ['자동차', '현대차', '완성차'], stocks: ['현대차', '기아', '현대모비스', 'HL만도', '한라캐스트'] },
        '원자력': { keywords: ['원전', '원자력', 'SMR'], stocks: ['두산에너빌리티', '우진', '현대건설', '한전KPS', '비에이치아이'] },
        '건설': { keywords: ['건설', '주택', '토건'], stocks: ['삼성물산', 'GS건설', '현대건설', '대우건설'] },
        '방산': { keywords: ['방산', '방위', '국방'], stocks: ['한화에어로스페이스', 'LIG넥스원', '한국항공우주', '현대로템'] }
    };

    const missingThemes = [];
    let nextId = Math.max(...analyzedThemes.map(t => t.id), 0) + 1;

    // ⭐ NEW: balancedHotStocks에 이미 테마가 지정된 종목(섹터 크롤러 유래)을 강제 주입
    // 예: '에스피시스템스'(로봇)가 '개별이슈'로 빠지는 것 방지
    balancedHotStocks.forEach(stock => {
        if (stock.theme) {
            // 해당 테마가 이미 존재하는지 확인
            let theme = analyzedThemes.find(t => t.name.includes(stock.theme) || stock.theme.includes(t.name));
            if (!theme) {
                // missingThemes에서도 확인
                theme = missingThemes.find(t => t.name === stock.theme);
            }

            if (theme) {
                // 이미 존재하면 종목 추가
                if (!theme.stocks.includes(stock.name)) {
                    console.log(`  [Sector Injection] Injecting ${stock.name} into ${theme.name}`);
                    theme.stocks.push(stock.name);
                }
            } else {
                // 아예 없는 테마면 새로 생성
                console.log(`  [Sector Injection] Creating new theme: ${stock.theme} (from ${stock.name})`);
                const newTheme = {
                    id: nextId++,
                    name: stock.theme,
                    headline: `${stock.theme} 섹터 강세`,
                    stocks: [stock.name]
                };
                missingThemes.push(newTheme);
            }
        }
    });

    for (const [themeName, themeInfo] of Object.entries(majorThemes)) {
        // 이미 존재하는지 확인
        const exists = existingThemeNames.some(name =>
            themeInfo.keywords.some(keyword => name.includes(keyword))
        );

        // 해당 테마의 종목이 balancedHotStocks에 있는지 확인
        // ⭐ NEW: 없으면 실시간 조회하여 강제 추가 (대장주 누락 방지)
        const { fetchStockPrice } = require('./market');
        const themeStocks = [];

        for (const stockName of themeInfo.stocks) {
            let stockData = balancedHotStocks.find(s => s.name === stockName);

            if (!stockData) {
                // 급등주 리스트에 없으면 실시간 조회 시도
                const liveData = await fetchStockPrice(stockName);
                if (liveData && liveData.price > 0) {
                    console.log(`  [Major Theme] Force fetching ${stockName} for ${themeName}...`);
                    stockData = liveData;
                }
            }

            if (stockData) {
                themeStocks.push(stockData);
            }
        }

        if (themeStocks.length >= 3) { // 최소 3개 종목
            // 이미 존재하는지 재확인 (이름 매칭)
            if (!exists) {
                console.log(`  Adding missing theme: ${themeName} (${themeStocks.length} stocks)`);
                missingThemes.push({
                    id: nextId++,
                    name: themeName,
                    headline: `${themeName} 테마 주도주`,
                    stocks: themeStocks.map(s => s.name) // 종목명만 저장
                });
            } else {
                // 이미 존재하는 테마라면, 해당 테마 객체를 찾아서 종목을 추가해줘야 함
                // (analyzedThemes는 여기서 수정하기 어려우므로, 다음 단계인 enrichThemes에서 처리되도록 유도하거나
                //  여기서 analyzedThemes를 직접 수정해야 함. 하지만 analyzedThemes는 const가 아니므로 수정 가능)
                const existingTheme = analyzedThemes.find(t =>
                    themeInfo.keywords.some(keyword => t.name.includes(keyword))
                );
                if (existingTheme) {
                    themeStocks.forEach(s => {
                        if (!existingTheme.stocks.includes(s.name)) {
                            console.log(`  [Major Theme] Injecting ${s.name} into existing ${existingTheme.name}`);
                            existingTheme.stocks.push(s.name);
                        }
                    });
                }
            }
        }
    }

    return [...analyzedThemes, ...missingThemes];
}

// 테마 점수 계산 함수 (거래대금 가중 평균 등락률 + 수급 보너스)
function calculateThemeScore(stocks, includeSupplyBonus = false) {
    if (stocks.length === 0) return { score: 0, supplyBonus: 0, shortPenalty: 0 };

    let totalWeightedRate = 0;
    let totalVolume = 0;
    let totalSupplyScore = 0;
    let totalShortRisk = 0;
    let stocksWithInvestorData = 0;

    for (const stock of stocks) {
        const rate = stock.rate || 0;
        // 거래대금이 없으면 0 처리 (가중치 없음)
        const amount = stock.amount || 0;

        totalWeightedRate += rate * amount;
        totalVolume += amount;

        // 수급 데이터가 있으면 집계
        if (stock.investorData) {
            totalSupplyScore += calculateSupplyScore(stock.investorData);
            totalShortRisk += calculateShortRisk(stock.investorData);
            stocksWithInvestorData++;
        }
    }

    // 거래대금 총합이 0이면 (모두 데이터 없음 등) 단순 평균으로 계산
    let baseScore;
    if (totalVolume === 0) {
        const totalRate = stocks.reduce((sum, s) => sum + (s.rate || 0), 0);
        baseScore = totalRate / stocks.length;
    } else {
        baseScore = totalWeightedRate / totalVolume;
    }

    // 수급 보너스/패널티 계산 (평균)
    let supplyBonus = 0;
    let shortPenalty = 0;

    if (includeSupplyBonus && stocksWithInvestorData > 0) {
        const avgSupplyScore = totalSupplyScore / stocksWithInvestorData;
        const avgShortRisk = totalShortRisk / stocksWithInvestorData;

        // 수급 보너스: -2 ~ +2 범위의 점수를 -1 ~ +1 스케일로 변환
        supplyBonus = avgSupplyScore * 0.5;  // 최대 ±1점

        // 공매도 패널티: 0 ~ 3 범위를 0 ~ 0.5 스케일로 변환
        shortPenalty = avgShortRisk * 0.15;  // 최대 0.45점 감점
    }

    // 최종 점수 = 기본 점수 + 수급 보너스 - 공매도 패널티
    const finalScore = baseScore + supplyBonus - shortPenalty;

    // 하위 호환성: 단순 숫자 반환이 필요한 경우
    if (!includeSupplyBonus) {
        return baseScore;
    }

    return {
        score: finalScore,
        baseScore,
        supplyBonus,
        shortPenalty
    };
}

// 테마 수준의 수급 요약 계산
function calculateThemeInvestorSummary(stocks) {
    let foreignNetTotal = 0;
    let institutionNetTotal = 0;
    let retailNetTotal = 0;
    let shortRatioSum = 0;
    let stocksWithData = 0;

    for (const stock of stocks) {
        const investorData = stock.investorData;
        if (!investorData) continue;

        const investor = investorData.investor;
        const short = investorData.short;

        if (investor) {
            foreignNetTotal += investor.foreignNet || 0;
            institutionNetTotal += investor.institutionNet || 0;
            retailNetTotal += investor.retailNet || 0;
            stocksWithData++;
        }

        if (short) {
            shortRatioSum += short.shortRatio || 0;
        }
    }

    const avgShortRatio = stocksWithData > 0 ? shortRatioSum / stocksWithData : 0;

    // 외국인+기관 순매수 합계
    const bigPlayerNet = foreignNetTotal + institutionNetTotal;

    // 수급 신호 판정 (외국인+기관 기준)
    let supplySignal = 'NEUTRAL';
    if (bigPlayerNet >= 50) supplySignal = 'BUY';       // 50억 이상 순매수
    else if (bigPlayerNet >= 20) supplySignal = 'MILD_BUY';
    else if (bigPlayerNet <= -50) supplySignal = 'SELL';   // 50억 이상 순매도
    else if (bigPlayerNet <= -20) supplySignal = 'MILD_SELL';

    // 공매도 위험 신호
    let shortSignal = 'NORMAL';
    if (avgShortRatio >= 15) shortSignal = 'HIGH_RISK';
    else if (avgShortRatio >= 10) shortSignal = 'CAUTION';

    return {
        foreignNet: foreignNetTotal,        // 외국인 순매수 합계 (억원)
        institutionNet: institutionNetTotal, // 기관 순매수 합계 (억원)
        retailNet: retailNetTotal,          // 개인 순매수 합계 (억원)
        bigPlayerNet,                       // 외국인+기관 (억원)
        avgShortRatio: Math.round(avgShortRatio * 100) / 100, // 평균 공매도비중 (%)
        supplySignal,                       // BUY, MILD_BUY, NEUTRAL, MILD_SELL, SELL
        shortSignal,                        // NORMAL, CAUTION, HIGH_RISK
        dataCount: stocksWithData           // 데이터 수집 종목 수
    };
}

// ===== 별 등급 시스템 (주도주 판정) =====

/**
 * 현재 장 시간대 판정
 * @returns {string} 'PRE_MARKET' | 'OPENING' | 'MORNING' | 'MIDDAY' | 'CLOSING' | 'AFTER_MARKET'
 */
function getMarketPhase() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const totalMinutes = hour * 60 + minute;

    // 장 시간: 9:00 ~ 15:30 (한국 주식시장)
    if (totalMinutes < 9 * 60) return 'PRE_MARKET';           // 장전
    if (totalMinutes < 9 * 60 + 30) return 'OPENING';         // 장 초반 (9:00-9:30) - 관망
    if (totalMinutes < 11 * 60) return 'MORNING';             // 오전장 (9:30-11:00) - 최대 1성
    if (totalMinutes < 14 * 60) return 'MIDDAY';              // 점심~오후초반 (11:00-14:00) - 최대 2성
    if (totalMinutes < 15 * 60 + 30) return 'CLOSING';        // 장 후반 (14:00-15:30) - 최대 3성
    return 'AFTER_MARKET';                                    // 장 마감 후 - 결과 유지
}

// 시간대별 최대 부여 가능 별 개수
const MAX_STARS_BY_PHASE = {
    'PRE_MARKET': 0,
    'OPENING': 0,      // 장 초반은 별 부여 안함 (변동성 큼)
    'MORNING': 1,      // 오전장: 최대 1개
    'MIDDAY': 2,       // 점심~오후: 최대 2개
    'CLOSING': 3,      // 장 후반: 최대 3개
    'AFTER_MARKET': 3  // 장 마감 후: 결과 유지
};

/**
 * 1성 조건: "이거 뭔가 움직이네?"
 * - 상한가 1개 이상 OR
 * - 10% 이상 급등주 2개 이상 + 평균 등락률 5% 이상 OR
 * - 3개 이상 종목 모두 7% 이상 상승
 */
function isOneStar(theme) {
    const stocks = theme.stocks || [];
    const score = theme.score || 0;
    if (stocks.length === 0) return false;

    const rates = stocks.map(s => s.rate || 0);

    // A. 상한가가 1개라도 있다
    if (rates.some(r => r >= 29.9)) return true;

    // B. 10% 이상 급등주가 2개 이상 + 평균 등락률 5% 이상
    if (rates.filter(r => r >= 10).length >= 2 && score >= 5) return true;

    // C. 3개 이상 종목이 모두 7% 이상 상승
    if (stocks.length >= 3 && rates.every(r => r >= 7)) return true;

    return false;
}

/**
 * 2성 조건: "이건 진짜 가는 테마 같은데?"
 * - 1성 조건 충족 필수
 * - 추가로 다음 중 2개 이상 충족:
 *   A. 상한가 종목 존재
 *   B. 10% 이상 급등주가 절반 이상
 *   C. 평균 등락률 8% 이상
 *   D. 총 거래대금 500억 이상
 *   E. 4개 이상 종목이 동반 상승 (5% 이상)
 */
function isTwoStar(theme) {
    const stocks = theme.stocks || [];
    const score = theme.score || 0;
    const totalVolume = theme.totalVolume || 0;
    if (stocks.length === 0) return false;

    // 1성 조건 충족 필수
    if (!isOneStar(theme)) return false;

    const rates = stocks.map(s => s.rate || 0);
    let conditionsMet = 0;

    // A. 상한가 종목 존재
    if (rates.some(r => r >= 29.9)) conditionsMet++;

    // B. 10% 이상 급등주가 절반 이상
    if (rates.filter(r => r >= 10).length >= stocks.length / 2) conditionsMet++;

    // C. 평균 등락률 8% 이상
    if (score >= 8) conditionsMet++;

    // D. 총 거래대금 500억 이상
    if (totalVolume >= 500) conditionsMet++;

    // E. 4개 이상 종목이 동반 상승 (5% 이상)
    if (rates.filter(r => r >= 5).length >= 4) conditionsMet++;

    return conditionsMet >= 2;
}

/**
 * 3성 조건: "오늘의 확실한 주도주!"
 * - 2성 조건 충족 필수
 * - 추가로 다음 중 3개 이상 충족 (매우 엄격):
 *   A. 상한가 2개 이상
 *   B. 평균 등락률 12% 이상
 *   C. 총 거래대금 1000억 이상
 *   D. 급등주(10% 이상) 비율 70% 이상
 *   E. 모든 종목 상승 (음수 없음)
 *   F. 거래대금 분산 양호 (대장주 쏠림 아님)
 */
function isThreeStar(theme) {
    const stocks = theme.stocks || [];
    const score = theme.score || 0;
    const totalVolume = theme.totalVolume || 0;
    if (stocks.length === 0) return false;

    // 2성 조건 충족 필수
    if (!isTwoStar(theme)) return false;

    const rates = stocks.map(s => s.rate || 0);
    const amounts = stocks.map(s => s.amount || 0);
    let conditionsMet = 0;

    // A. 상한가 2개 이상
    if (rates.filter(r => r >= 29.9).length >= 2) conditionsMet++;

    // B. 평균 등락률 12% 이상
    if (score >= 12) conditionsMet++;

    // C. 총 거래대금 1000억 이상
    if (totalVolume >= 1000) conditionsMet++;

    // D. 급등주(10% 이상) 비율 70% 이상
    if (stocks.length > 0 && rates.filter(r => r >= 10).length / stocks.length >= 0.7) conditionsMet++;

    // E. 모든 종목 상승 (음수 없음)
    if (rates.every(r => r > 0)) conditionsMet++;

    // F. 거래대금 분산 양호 (대장주 쏠림 아님)
    const maxAmount = Math.max(...amounts, 1);
    const avgAmount = stocks.length > 0 ? totalVolume / stocks.length : 0;
    if (avgAmount > 0 && maxAmount < avgAmount * 3) conditionsMet++;

    return conditionsMet >= 3;
}

/**
 * 테마의 별 등급 판정 (시간대 + 조건 기반)
 * @param {Object} theme - 테마 객체 (stocks, score, totalVolume 포함)
 * @returns {Object} { stars: number, reason: string }
 */
// 별점 비대상 테마 목록 (특수 분류 - 주도 테마가 아닌 분류)
const STAR_EXCLUDED_THEMES = ['개별이슈', '기타', '기타섹터', '신규상장'];

function calculateStarRating(theme) {
    const phase = getMarketPhase();
    const maxStars = MAX_STARS_BY_PHASE[phase];
    const stocks = theme.stocks || [];
    const score = theme.score || 0;
    const themeName = theme.name || '';

    // ⭐ NEW: 별점 비대상 테마 필터링 (개별이슈, 기타는 주도주가 될 수 없음)
    if (STAR_EXCLUDED_THEMES.some(excluded => themeName.includes(excluded))) {
        return { stars: 0, reason: '별점 비대상 테마' };
    }

    // 장 초반이면 별 부여 안함
    if (maxStars === 0) {
        return { stars: 0, reason: '장 초반 - 관망 중' };
    }

    // 기본 조건: 평균 등락률 양수
    if (score <= 0) {
        return { stars: 0, reason: '등락률 마이너스' };
    }

    // 기본 조건: 유효 종목 2개 이상 (완화)
    if (stocks.length < 2) {
        return { stars: 0, reason: '종목 수 부족' };
    }

    // 등급 판정 (높은 등급부터 체크)
    if (maxStars >= 3 && isThreeStar(theme)) {
        return { stars: 3, reason: '오늘의 확실한 주도주' };
    }
    if (maxStars >= 2 && isTwoStar(theme)) {
        return { stars: 2, reason: '강한 테마 흐름' };
    }
    if (maxStars >= 1 && isOneStar(theme)) {
        return { stars: 1, reason: '주목할 만한 움직임' };
    }

    return { stars: 0, reason: '기준 미달' };
}

// Initial Start
updateThemes().then(() => {
    // 초기 로드 후 10초마다 가격 업데이트 시작
    setInterval(updatePrices, 10 * 1000);
});

// Schedule Theme Updates (5분마다)
setInterval(updateThemes, 5 * 60 * 1000);

// API Endpoints
app.get('/api/themes', (req, res) => {
    // 갱신 버전 정보와 함께 테마 데이터 반환
    // 프론트엔드에서 데이터 버전을 추적하여 완전 갱신 여부 판단
    const nxtStatus = getNxtMarketStatus();
    res.json({
        themes: cachedThemes,
        lastUpdated: lastUpdated,
        version: lastUpdated, // 버전 식별자 (타임스탬프 기반)
        marketStatus: nxtStatus // 현재 시장 상태: PRE_MARKET, REGULAR, AFTER_MARKET, CLOSED
    });
});

app.get('/api/hot-stocks', (req, res) => {
    res.json(cachedHotStocks);
});

app.get('/api/balanced-hot-stocks', (req, res) => {
    res.json(cachedBalancedHotStocks);
});

app.get('/api/theme-sectors', (req, res) => {
    res.json(THEME_SECTORS);
});

app.get('/api/ipo-stocks', (req, res) => {
    res.json(cachedIPOStocks);
});

app.listen(port, () => {
    console.log(`Local Data Engine running at http://localhost:${port}`);
});
