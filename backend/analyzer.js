const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// ⭐ 테마 정의를 sector_analyzer.js에서 단일 소스로 관리
const { THEME_SECTORS, CORE_THEME_CANDIDATES, OTHER_SECTOR_THEMES } = require('./sector_analyzer');

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * AI 테마 분석 (하이브리드 시스템에서 보조 역할)
 * - 네이버 테마가 주요 소스, AI는 핫 테마 선정 및 헤드라인 생성 담당
 * - AI 실패 시에도 네이버 테마로 서비스 정상 동작
 * @param {Array} newsList - 뉴스 목록
 * @param {Array} hotStocks - 급등주 데이터
 * @returns {Array} 분석된 테마 배열
 */
async function analyzeThemes(newsList, hotStocks = []) {
    if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is missing. Using hot stocks data for theme generation.");
        // ⭐ HYBRID: API 키 없어도 급등주 데이터가 있으면 테마 생성 (네이버 테마와 병합됨)
        if (hotStocks && hotStocks.length > 0) {
            return generateThemesFromHotStocks(hotStocks);
        }
        // 하이브리드 모드에서는 빈 배열 반환해도 네이버 테마가 있으므로 서비스 정상 동작
        return [];
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Prepare prompt
        const newsTitles = newsList.map(n => `- ${n.title}`).join("\n");

        // 급등주 정보 추가 (상위 150개로 확대)
        const hotStockInfo = hotStocks.slice(0, 150).map(s =>
            `${s.name} (등락률: ${s.rate > 0 ? '+' : ''}${s.rate}%, 거래대금: ${s.amount}백만)`
        ).join("\n");

        // 테마 분류 계층을 AI에 전달
        const coreThemes = CORE_THEME_CANDIDATES.join(', ');
        const otherThemes = OTHER_SECTOR_THEMES.join(', ');

        const prompt = `
    You are a professional financial analyst AI specializing in Korean stock market theme analysis.

    Analyze the following data and extract the key stock market themes:

    **REAL-TIME HOT STOCKS (급등주 - 실시간 상승률 상위):**
    ${hotStockInfo || "No hot stock data available"}

    **NEWS HEADLINES:**
    ${newsTitles}

    **THEME HIERARCHY (테마 분류 계층):**

    1. **CORE THEMES (핵심 테마 - 우선 분류, 최대 7개 선정됨):**
       ${coreThemes}

    2. **OTHER SECTORS (기타섹터 - 통합 대상):**
       ${otherThemes}

    3. **SPECIAL CATEGORIES (특수 분류):**
       - "개별이슈": Only for stocks with company-specific news (합병, 지분매각, 실적공시)
       - Do NOT create themes for IPO/신규상장 stocks (handled separately by system)

    **CRITICAL INSTRUCTIONS:**

    1. **CLASSIFICATION PRIORITY**:
        - **CORE THEMES FIRST**: Always try to classify into CORE THEMES above.
        - **OTHER SECTORS**: If not core, classify into OTHER SECTORS (will be merged into "기타섹터").
        - **SUB-THEME ALLOWED**: Create sub-themes like "반도체-HBM", "반도체-장비" if needed.
        - **"개별이슈" AS LAST RESORT**: Only for truly company-specific events.

    2. **FILTERING RULES**:
        - **IGNORE**: ETFs, ETNs, SPACs (스팩), Preferred Stocks (우선주)
        - **FILTER**: Names containing "스팩", "제N호", ending with "우"/"우B" -> EXCLUDE

    3. **STOCK SELECTION**:
        - **CRITERIA**: Select stocks with the **HIGHEST RATE (%)** first.
        - **NO DUPLICATES**: Each stock can appear in ONLY ONE theme.
        - **ORDER**: Sort by Rate (%) DESCENDING within each theme.

    4. **TARGET OUTPUT**: Aim for **10-15 distinct themes**
        - Each theme should have **3-5 stocks**
        - Focus on CORE THEMES - they will be ranked by volume/rate

    5. **Headline**: Select ONE news headline that best represents this theme.

    6. **OUTPUT FORMAT**: Return ONLY JSON array, no explanations:
    [
      {
        "id": 1,
        "name": "테마명",
        "headline": "대표 뉴스 헤드라인",
        "stocks": ["종목1", "종목2", "종목3"]
      }
    ]

    **IMPORTANT**:
    - Trust the real-time data. Today's movers matter most.
    - NO DUPLICATE STOCK NAMES across themes.
    - Prefer CORE THEMES over OTHER SECTORS.
    - Minimize "개별이슈" usage - classify into proper sectors whenever possible.
    `;

        const maxRetries = 5;
        let retryCount = 0;
        let delay = 2000; // Start with 2 seconds

        while (retryCount < maxRetries) {
            try {
                console.log(`Sending request to Gemini AI (Attempt ${retryCount + 1}/${maxRetries})...`);
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                // Clean up markdown code blocks if present
                const jsonString = text.replace(/```json/g, "").replace(/```/g, "").trim();

                const themes = JSON.parse(jsonString);
                console.log(`AI Analysis Complete. Extracted ${themes.length} themes.`);
                return themes;

            } catch (error) {
                console.error(`AI Analysis Failed (Attempt ${retryCount + 1}):`, error.message);

                if (error.message.includes("429") || error.message.includes("Quota")) {
                    console.log(`Rate limit hit. Retrying in ${delay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                    retryCount++;
                } else {
                    // Non-retriable error (e.g., API key invalid)
                    break;
                }
            }
        }

        console.error("Max retries reached. Using hot stocks data for theme generation.");
        // ⭐ AI 실패 시 급등주 데이터 기반 테마 생성
        if (hotStocks && hotStocks.length > 0) {
            return generateThemesFromHotStocks(hotStocks);
        }
        return getMockData();

    } catch (error) {
        console.error("Unexpected error in analyzeThemes:", error);
        // ⭐ AI 실패 시 급등주 데이터 기반 테마 생성
        if (hotStocks && hotStocks.length > 0) {
            return generateThemesFromHotStocks(hotStocks);
        }
        return getMockData();
    }
}

// ⭐ NEW: AI 없이 급등주 데이터 기반 테마 자동 생성
// THEME_SECTORS는 상단에서 sector_analyzer.js로부터 import됨
function generateThemesFromHotStocks(hotStocks) {
    console.log('Generating themes from hot stocks data (AI fallback)...');
    console.log(`Using ${Object.keys(THEME_SECTORS).length} theme definitions from sector_analyzer.js`);

    const themes = [];
    let themeId = 1;
    const usedStocks = new Set(); // 중복 방지

    for (const [themeName, themeInfo] of Object.entries(THEME_SECTORS)) {
        // 해당 테마에 속하는 급등주 찾기
        const matchedStocks = hotStocks.filter(stock => {
            if (usedStocks.has(stock.name)) return false;

            // 1. 종목명 직접 매칭
            if (themeInfo.stocks.includes(stock.name)) return true;

            // 2. 키워드 매칭
            return themeInfo.keywords.some(keyword =>
                stock.name.includes(keyword)
            );
        });

        if (matchedStocks.length >= 3) { // 최소 3개 종목
            // 등락률 기준 정렬
            matchedStocks.sort((a, b) => b.rate - a.rate);

            // 상위 5개 선택
            const selectedStocks = matchedStocks.slice(0, 5);
            selectedStocks.forEach(s => usedStocks.add(s.name));

            // 대표 헤드라인 생성
            const topStock = selectedStocks[0];
            const headline = `${themeName} 테마 강세 - ${topStock.name} ${topStock.rate > 0 ? '+' : ''}${topStock.rate.toFixed(1)}%`;

            themes.push({
                id: themeId++,
                name: themeName,
                headline: headline,
                stocks: selectedStocks.map(s => s.name)
            });
        }
    }

    // 나머지 고등락률 종목들을 '개별이슈'로 묶기
    const remainingStocks = hotStocks
        .filter(s => !usedStocks.has(s.name) && s.rate >= 10)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 5);

    if (remainingStocks.length >= 3) { // 최소 3개 종목
        const topStock = remainingStocks[0];
        themes.push({
            id: themeId++,
            name: '개별이슈',
            headline: `급등주 - ${topStock.name} ${topStock.rate > 0 ? '+' : ''}${topStock.rate.toFixed(1)}%`,
            stocks: remainingStocks.map(s => s.name)
        });
    }

    console.log(`Generated ${themes.length} themes from hot stocks data`);
    return themes;
}

function getMockData() {
    // 기본 폴백 데이터 (급등주 데이터도 없을 때)
    return [
        {
            id: 1,
            name: "반도체",
            headline: "삼성전자, HBM 공급 확대 기대감",
            stocks: ["태성", "켐트로스", "SK하이닉스", "삼성전자", "한미반도체"]
        },
        {
            id: 2,
            name: "조선/기자재",
            headline: "K-조선, 수주 릴레이 지속",
            stocks: ["삼성중공업", "HD현대중공업", "한화오션", "현대미포조선", "STX중공업"]
        },
        {
            id: 3,
            name: "2차전지",
            headline: "전기차 수요 회복 신호탄",
            stocks: ["에코프로", "에코프로비엠", "LG에너지솔루션", "포스코퓨처엠", "금양"]
        },
        {
            id: 4,
            name: "로봇",
            headline: "대기업 로봇 투자 가속화",
            stocks: ["레인보우로보틱스", "두산로보틱스", "SPG", "로보티즈", "유진로봇"]
        },
        {
            id: 5,
            name: "개별이슈",
            headline: "개별 호재성 공시 종목 강세",
            stocks: ["CJ대한통운", "삼성물산", "씨엔알리서치", "NHN", "카카오"]
        }
    ];
}

module.exports = { analyzeThemes };
