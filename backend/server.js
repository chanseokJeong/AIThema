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

        if (allNews.length === 0 && balancedHotStocks.length === 0) {
            console.log('No data found.');
            return;
        }

        // Step 3: AI 분석 (균형잡힌 급등주 + 뉴스)
        console.log('Step 3: Analyzing themes with AI...');
        let analyzedThemes = await analyzeThemes(allNews, balancedHotStocks);

        // Step 3.5: 주요 테마 강제 추가 (AI가 놓친 테마 보완) ⭐ NEW
        console.log('Step 3.5: Adding missing major themes...');
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
            // ⭐ NEW: 중복 종목 제거 (AI가 같은 종목을 여러 번 반환하는 경우 방지)
            const uniqueStockNames = [...new Set(theme.stocks)];
            console.log(`  Theme "${theme.name}": ${theme.stocks.length} stocks → ${uniqueStockNames.length} unique`);

            const enrichedStocks = await Promise.all(uniqueStockNames.map(async (stockName) => {
                // 균형잡힌 급등주 데이터에서 먼저 찾기
                const hotData = enrichStockWithHotData(stockName, balancedHotStocks);

                // ⭐ NEW: 캔들 차트를 위해 상세 데이터(시가/고가/저가)가 필요함
                // 급등주 데이터(hotData)에는 시가/고가/저가가 없으므로, 최종 테마에 선정된 종목은
                // 반드시 실시간 상세 조회를 수행하여 OHLC 데이터를 확보한다.
                // (단, 성능을 위해 병렬로 처리되므로 큰 부담은 아님)

                console.log(`  Fetching detailed OHLC for ${stockName}...`);
                const liveData = await fetchStockPrice(stockName);

                // 실시간 조회 실패 시 hotData라도 사용 (fallback)
                if (!liveData || liveData.price === 0) {
                    if (hotData) return hotData;
                }

                // ⭐ NEW: 필터링 로직 개선 (눌림목 포함)
                // 1. 기본: 0% 이상 (상승 흐름)
                // 2. 눌림목: -5% 이내이면서 거래대금 300억 이상 (주도주의 건전한 조정)
                const amount = liveData.amount || 0;
                const isDipBuyingCandidate = liveData.rate >= -10.0 && amount >= 300;

                if (liveData.rate < MIN_RATE_THRESHOLD && !isDipBuyingCandidate) {
                    return null;
                }

                return liveData;
            }));

            // null 제거 (필터링된 종목 제외)
            let validStocks = enrichedStocks.filter(s => s !== null);

            // ⭐ 등락률 기준 정렬 후 최대 5개로 제한 -> 가중치 정렬로 변경 (거래대금 고려)
            validStocks.sort((a, b) => {
                const scoreA = (a.rate || 0) + ((a.amount || 0) / 100);
                const scoreB = (b.rate || 0) + ((b.amount || 0) / 100);
                return scoreB - scoreA;
            });
            validStocks = validStocks.slice(0, 5);

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

        // ⭐ NEW: 주도 테마 선정 (가중치 점수 방식: 등락률 > 거래대금)
        // 기존: 거래대금 Top 3 -> 변경: (등락률 + 거래대금/1000) 점수 상위 3개
        // 설명: 반도체(1.5%)가 거래대금만으로 로봇(20%)보다 우위에 서는 것 방지. 등락률 비중 대폭 강화.
        // 1000억 거래대금 = 1% 등락률 가치로 환산 (거래대금 가중치 낮춤)
        const sortedByLeaderScore = [...enrichedThemes].sort((a, b) => {
            const scoreA = (a.score || 0) + ((a.totalVolume || 0) / 1000);
            const scoreB = (b.score || 0) + ((b.totalVolume || 0) / 1000);
            return scoreB - scoreA;
        });

        const top3LeaderNames = new Set(sortedByLeaderScore.slice(0, 3).map(t => t.name));

        const finalThemes = enrichedThemes.map(t => ({
            ...t,
            // Leader Score Top 3 안에 들고, 점수(등락률)가 플러스인 경우 '주도주' 아이콘 부여
            isLeader: top3LeaderNames.has(t.name) && t.score > 0
        }));

        // Sort by Score (descending) - 사용자 요청 (점수 높은 순)
        finalThemes.sort((a, b) => b.score - a.score);

        cachedThemes = finalThemes;
        lastUpdated = Date.now();
        console.log(`Theme update complete. Found ${cachedThemes.length} themes.`);
        console.log('=== Theme Update Finished ===\n');
    } catch (error) {
        console.error('Theme update failed:', error);
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
                // 균형잡힌 급등주 데이터에서 찾기
                const hotData = enrichStockWithHotData(stock.name, balancedHotStocks);
                if (hotData) {
                    return hotData;
                }
                // 원본 급등주에서 찾기
                const rawHotData = enrichStockWithHotData(stock.name, rawHotStocks);
                if (rawHotData) {
                    return rawHotData;
                }
                // 실시간 시세 조회
                const liveData = await fetchStockPrice(stock.name);

                // 필터링: 양전 OR 거래대금 300억+ 눌림목
                const amount = liveData.amount || 0;
                const isDipBuyingCandidate = liveData.rate >= -10.0 && amount >= 300;

                if (liveData.rate < MIN_RATE_THRESHOLD && !isDipBuyingCandidate) {
                    return null;
                }

                return liveData;
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

        // ⭐ NEW: 주도 테마 선정 (실시간 업데이트 - 가중치 방식 적용)
        const sortedByLeaderScore = [...enrichedThemes].sort((a, b) => {
            const scoreA = (a.score || 0) + ((a.totalVolume || 0) / 1000);
            const scoreB = (b.score || 0) + ((b.totalVolume || 0) / 1000);
            return scoreB - scoreA;
        });

        const top3LeaderNames = new Set(sortedByLeaderScore.slice(0, 3).map(t => t.name));

        const finalThemes = enrichedThemes.map(t => ({
            ...t,
            isLeader: top3LeaderNames.has(t.name) && t.score > 0
        }));

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

        if (themeStocks.length >= 1) { // 1개만 있어도 주요 테마는 표시 (대장주 1개라도 있으면 의미 있음)
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

// 테마 점수 계산 함수 (거래대금 가중 평균 등락률)
function calculateThemeScore(stocks) {
    if (stocks.length === 0) return 0;

    let totalWeightedRate = 0;
    let totalVolume = 0;

    for (const stock of stocks) {
        const rate = stock.rate || 0;
        // 거래대금이 없으면 0 처리 (가중치 없음)
        const amount = stock.amount || 0;

        totalWeightedRate += rate * amount;
        totalVolume += amount;
    }

    // 거래대금 총합이 0이면 (모두 데이터 없음 등) 단순 평균으로 계산
    if (totalVolume === 0) {
        const totalRate = stocks.reduce((sum, s) => sum + (s.rate || 0), 0);
        return totalRate / stocks.length;
    }

    return totalWeightedRate / totalVolume;
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
    res.json(cachedThemes);
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

app.listen(port, () => {
    console.log(`Local Data Engine running at http://localhost:${port}`);
});
