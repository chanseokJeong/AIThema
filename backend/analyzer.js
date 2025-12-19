const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function analyzeThemes(newsList, hotStocks = []) {
    if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is missing. Using hot stocks data for theme generation.");
        // ⭐ API 키 없어도 급등주 데이터가 있으면 테마 생성
        if (hotStocks && hotStocks.length > 0) {
            return generateThemesFromHotStocks(hotStocks);
        }
        return getMockData();
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Prepare prompt
        const newsTitles = newsList.map(n => `- ${n.title}`).join("\n");

        // 급등주 정보 추가 (상위 150개로 확대)
        const hotStockInfo = hotStocks.slice(0, 150).map(s =>
            `${s.name} (등락률: ${s.rate > 0 ? '+' : ''}${s.rate}%, 거래대금: ${s.amount}백만)`
        ).join("\n");

        const prompt = `
    You are a professional financial analyst AI specializing in Korean stock market theme analysis.

    Analyze the following data and extract the key stock market themes:

    **REAL-TIME HOT STOCKS (급등주 - 실시간 상승률 상위):**
    ${hotStockInfo || "No hot stock data available"}

    **NEWS HEADLINES:**
    ${newsTitles}

    **Instructions:**
    2. **PRIORITY 2 (Filtering & Naming Rules)**:
        - **IGNORE**: ETFs, ETNs, SPACs (스팩), Preferred Stocks (우선주). Focus ONLY on Common Stocks (보통주).
        - **THEME NAME**: Must be a **SINGLE KEYWORD** or **Short Phrase** representing an INDUSTRY or SECTOR.
          - GOOD: "로봇", "반도체", "바이오", "원자력", "2차전지"
          - BAD: "스팩(SPAC)", "우선주", "에너지 (원자력 & SMR)", "급등주", "코스닥 상위"
        - **NO "Type-based" Themes**: Do NOT create themes based on stock type like "SPAC", "Preferred Stock", "Politics". Focus on **Business Business**.

    3. **PRIORITY 3 (Stock Selection & Sorting)**:
        - **CRITERIA**: Select stocks with the **HIGHEST RATE (%)** first.
        - **NO DUPLICATES**: Each stock can appear in ONLY ONE theme. Never repeat the same stock name.
        - **Rate > 5%**: If a stock has Rate > 5%, it MUST be prioritized over any stock with Rate < 5%.
        - **Filter Noise**: If a stock name contains "스팩", "ETF", "ETN", or ends with "우", "우B", DO NOT include it.

    4. **Goal**: Identify **AT LEAST 6-8 distinct themes**.

    5. **Stock Selection Rules**:
        - **MANDATORY**: Include 5 UNIQUE stocks per theme. Never repeat the same stock.
        - **ORDER**: Sort stocks inside the theme by **Rate (%) DESCENDING**. The highest riser MUST be first.
        - **Filter Check**: Once more, DO NOT include "스팩", "제X호", "우선주" in the stock list.

    6. **Headline**: Select ONE news headline that best represents this theme.

    7. **Format**: Return ONLY the JSON array:
    [
      {
        "id": 1,
        "name": "테마명",
        "headline": "대표 뉴스 헤드라인",
        "stocks": ["종목1", "종목2", "종목3", "종목4", "종목5"]
      }
    ]
    8. **Constraint**: Return ONLY JSON. No explanations. NO DUPLICATE STOCK NAMES.

    **IMPORTANT**: The user wants to see "What is rising TODAY", not "What is famous generally". Trust the data provided.
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
function generateThemesFromHotStocks(hotStocks) {
    console.log('Generating themes from hot stocks data (AI fallback)...');

    // 테마 섹터 정의 (sector_analyzer.js와 동기화)
    const THEME_SECTORS = {
        '로봇': {
            keywords: ['로봇', '로보', '자동화'],
            stocks: ['레인보우로보틱스', '두산로보틱스', '로보티즈', '로보스타', '유진로봇', '에스피지', '휴림로봇', '디아이씨', '코츠테크놀로지']
        },
        '바이오': {
            keywords: ['바이오', '제약', '헬스케어', '의료', '셀트리온', '에이비엘'],
            stocks: ['셀트리온', '삼성바이오로직스', '에이비엘바이오', '메디톡스', '알테오젠', '레고켐바이오', '유한양행', '한미약품']
        },
        '2차전지': {
            keywords: ['2차전지', '배터리', '에코프로', '엘앤에프', '포스코퓨처엠'],
            stocks: ['에코프로', '에코프로비엠', 'LG에너지솔루션', '포스코퓨처엠', '엘앤에프', '금양', '피엔티']
        },
        '반도체': {
            keywords: ['반도체', 'HBM', '칩', '하이닉스', '테크윙', '원익'],
            stocks: ['삼성전자', 'SK하이닉스', '태성', '켐트로스', '한미반도체', '원익IPS', '칩스앤미디어', '원익홀딩스', '이오테크닉스', '테크윙', '넥스트칩']
        },
        '조선': {
            keywords: ['조선', '선박', '중공업', 'HD현대', '한화오션'],
            stocks: ['HD현대중공업', '삼성중공업', '한화오션', '현대미포조선', 'STX중공업']
        },
        '원자력': {
            keywords: ['원전', '원자력', 'SMR', '두산에너빌리티', '한전'],
            stocks: ['두산에너빌리티', '한전KPS', '우진', '비에이치아이', '현대건설', '일진파워', '보성파워텍']
        },
        '자동차': {
            keywords: ['자동차', '현대차', '기아', '모빌리티', '만도', '완성차'],
            stocks: ['현대차', '기아', '현대모비스', 'HL만도', '한라캐스트', '현대위아', '만도', '세종공업']
        },
        '건설': {
            keywords: ['건설', '주택', '토건', '인프라', 'GS건설', '대우건설'],
            stocks: ['삼성물산', 'GS건설', '현대건설', '대우건설', 'DL이앤씨', '코오롱글로벌']
        },
        '방산': {
            keywords: ['방산', '방위', '국방', '한화에어로', 'LIG넥스원'],
            stocks: ['한화에어로스페이스', 'LIG넥스원', '한국항공우주', '현대로템', '풍산', '한화시스템']
        }
    };

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

        if (matchedStocks.length >= 2) {
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

    if (remainingStocks.length >= 2) {
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
