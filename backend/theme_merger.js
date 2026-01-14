/**
 * 테마 병합 모듈 (Hybrid Theme System)
 *
 * 네이버 금융 테마 데이터(주요)와 AI 분석 결과(보조)를 병합하여
 * 안정적이면서도 시의성 있는 테마 리스트를 생성
 */

const { isNoiseStock } = require('./market');

/**
 * 네이버 테마 데이터를 표준 테마 형식으로 변환
 * @param {Object} naverThemes - { 테마명: { code, rate, stocks: [...] } }
 * @param {Array} hotStocks - 급등주 데이터 배열
 * @returns {Array} 표준 테마 배열 [{id, name, headline, stocks, isFromNaver}]
 */
function convertNaverToThemes(naverThemes, hotStocks = []) {
    const themes = [];

    for (const [themeName, themeData] of Object.entries(naverThemes)) {
        // 종목 필터링 (노이즈 종목 제외)
        const validStocks = themeData.stocks
            .filter(stock => !isNoiseStock(stock.name))
            .map(stock => stock.name);

        if (validStocks.length === 0) continue;

        // 상위 등락률 종목으로 헤드라인 생성
        const topStock = themeData.stocks
            .filter(s => !isNoiseStock(s.name))
            .sort((a, b) => b.rate - a.rate)[0];

        const headline = topStock
            ? `${topStock.name} ${topStock.rate >= 0 ? '+' : ''}${topStock.rate.toFixed(1)}% 등 ${themeName} 테마 강세`
            : `${themeName} 테마 관련주 동향`;

        themes.push({
            id: themeName,
            name: themeName,
            headline: headline,
            stocks: validStocks,
            naverRate: themeData.rate,
            naverCode: themeData.code,
            riseCount: themeData.riseCount || 0,
            fallCount: themeData.fallCount || 0,
            isFromNaver: true,
            isHot: false // AI가 핫으로 지정하면 true로 변경
        });
    }

    // 네이버 테마 등락률 기준 정렬
    themes.sort((a, b) => b.naverRate - a.naverRate);

    console.log(`[ThemeMerger] Converted ${themes.length} Naver themes`);
    return themes;
}

/**
 * AI 분석 결과와 네이버 테마를 병합
 * @param {Array} naverThemes - 네이버 기반 테마 배열
 * @param {Array} aiThemes - AI 분석 테마 배열 [{id, name, headline, stocks}]
 * @param {Array} hotStocks - 급등주 데이터
 * @returns {Array} 병합된 테마 배열
 */
function mergeThemes(naverThemes, aiThemes, hotStocks = []) {
    console.log(`[ThemeMerger] Merging ${naverThemes.length} Naver themes with ${aiThemes.length} AI themes`);

    const mergedThemes = [...naverThemes];
    const naverThemeNames = new Set(naverThemes.map(t => t.name.toLowerCase()));

    // AI 테마와 네이버 테마 매칭
    for (const aiTheme of aiThemes) {
        const aiNameLower = aiTheme.name.toLowerCase();

        // 네이버 테마에서 매칭되는 테마 찾기 (부분 일치 포함)
        const matchedNaverTheme = mergedThemes.find(nt => {
            const ntNameLower = nt.name.toLowerCase();
            return ntNameLower === aiNameLower ||
                   ntNameLower.includes(aiNameLower) ||
                   aiNameLower.includes(ntNameLower) ||
                   isThemeNameSimilar(nt.name, aiTheme.name);
        });

        if (matchedNaverTheme) {
            // 매칭된 경우: 헤드라인 업데이트, 핫 테마 표시, 종목 보강
            matchedNaverTheme.headline = aiTheme.headline || matchedNaverTheme.headline;
            matchedNaverTheme.isHot = true;
            matchedNaverTheme.aiMatched = true;

            // AI가 추천한 종목 중 네이버에 없는 것 추가
            for (const stockName of aiTheme.stocks) {
                if (!matchedNaverTheme.stocks.includes(stockName) && !isNoiseStock(stockName)) {
                    matchedNaverTheme.stocks.push(stockName);
                }
            }

            console.log(`  [Match] "${aiTheme.name}" -> "${matchedNaverTheme.name}" (hot)`);
        } else {
            // 매칭 안 된 경우: 신규 이슈 테마로 추가
            const newTheme = {
                id: aiTheme.id || aiTheme.name,
                name: aiTheme.name,
                headline: aiTheme.headline,
                stocks: aiTheme.stocks.filter(s => !isNoiseStock(s)),
                isFromNaver: false,
                isHot: true,
                isNewIssue: true, // AI만 발견한 신규 이슈
                naverRate: 0
            };

            if (newTheme.stocks.length > 0) {
                mergedThemes.push(newTheme);
                console.log(`  [New Issue] "${aiTheme.name}" added as new theme`);
            }
        }
    }

    // 핫 테마를 상위로 정렬 (핫 테마 우선, 그 다음 등락률 순)
    mergedThemes.sort((a, b) => {
        if (a.isHot !== b.isHot) return b.isHot ? 1 : -1;
        return (b.naverRate || 0) - (a.naverRate || 0);
    });

    console.log(`[ThemeMerger] Final merged themes: ${mergedThemes.length} (hot: ${mergedThemes.filter(t => t.isHot).length})`);
    return mergedThemes;
}

/**
 * 테마 이름 유사도 체크
 * @param {string} name1
 * @param {string} name2
 * @returns {boolean}
 */
function isThemeNameSimilar(name1, name2) {
    const synonyms = {
        '반도체': ['반도체', '칩', 'HBM', '메모리', '파운드리'],
        '2차전지': ['2차전지', '배터리', '전지', '리튬', '양극재', '음극재'],
        '로봇': ['로봇', '자동화', '협동로봇', '산업용로봇'],
        '바이오': ['바이오', '제약', '신약', '의약품', '헬스케어'],
        '조선': ['조선', '선박', '해운', '기자재'],
        '원자력': ['원자력', '원전', '핵', '소형모듈원전', 'SMR'],
        '자동차': ['자동차', '전기차', 'EV', '자율주행', '모빌리티'],
        'AI': ['AI', '인공지능', '딥러닝', '머신러닝', 'LLM', 'GPT'],
        '방산': ['방산', '방위', '군수', '무기', 'K-방산'],
        '게임': ['게임', '엔터', '콘텐츠', '메타버스'],
        '화장품': ['화장품', '뷰티', '코스메틱', 'K-뷰티'],
        '건설': ['건설', '부동산', '시멘트', '레미콘'],
        '항공': ['항공', '우주', '에어', '비행']
    };

    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();

    for (const [key, values] of Object.entries(synonyms)) {
        const hasN1 = values.some(v => n1.includes(v.toLowerCase()));
        const hasN2 = values.some(v => n2.includes(v.toLowerCase()));
        if (hasN1 && hasN2) return true;
    }

    return false;
}

/**
 * 급등주 데이터에서 종목 정보 찾기
 * @param {string} stockName
 * @param {Array} hotStocks
 * @returns {Object|null}
 */
function findStockInHotStocks(stockName, hotStocks) {
    return hotStocks.find(s => s.name === stockName) || null;
}

/**
 * 테마 종목에 급등주 데이터 보강
 * @param {Array} themes - 테마 배열
 * @param {Array} hotStocks - 급등주 데이터
 * @returns {Array}
 */
function enrichThemesWithHotStocks(themes, hotStocks) {
    return themes.map(theme => {
        const enrichedStocks = theme.stocks.map(stockName => {
            const hotData = findStockInHotStocks(stockName, hotStocks);
            if (hotData) {
                return {
                    name: stockName,
                    code: hotData.code,
                    rate: hotData.rate || 0,
                    amount: hotData.amount || 0,
                    price: hotData.price || 0,
                    fromHotStocks: true
                };
            }
            return { name: stockName, needsLookup: true };
        });

        return {
            ...theme,
            enrichedStocks
        };
    });
}

module.exports = {
    convertNaverToThemes,
    mergeThemes,
    isThemeNameSimilar,
    findStockInHotStocks,
    enrichThemesWithHotStocks
};
