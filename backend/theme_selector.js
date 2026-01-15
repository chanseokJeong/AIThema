/**
 * 동적 테마 선정기
 * - 거래대금/등락률 기반 핵심 테마 7개 자동 선정
 * - 특수 분류: 개별이슈, 신규상장, 기타섹터
 * - 최종 10개 테마만 반환
 */

// 핵심 테마 후보군 (동적 선정 대상)
const CORE_THEME_CANDIDATES = [
    '로봇', '바이오', '2차전지', '반도체', '조선',
    '원자력', '자동차', '건설', '방산', '항공', 'AI/소프트웨어'
];

// 기타섹터로 통합될 테마
const OTHER_SECTOR_THEMES = ['화장품', '게임', '엔터/미디어', '금융/증권'];

// 특수 분류 테마명 (선정에서 제외)
const SPECIAL_THEME_NAMES = ['개별이슈', '기타', '기타섹터', '신규상장'];

// 테마 분할 설정
const SPLIT_CONFIG = {
    minStocksToSplit: 6,    // 이 개수 이상이면 분할 검토
    stocksPerPart: 5,       // 파트당 종목 수
    maxParts: 3,            // 최대 분할 수
    minScoreToSplit: 5.0    // 이 점수 이상이어야 분할 (강세 테마만)
};

/**
 * 테마 순위 점수 계산
 * 공식: volumeScore + rateScore + surgeBonus + limitUpBonus
 *
 * @param {Object} theme - 테마 객체 (stocks, score, totalVolume 포함)
 * @returns {number} - 순위 점수
 */
function calculateThemeRankScore(theme) {
    const stocks = theme.stocks || [];
    if (stocks.length === 0) return 0;

    // 1. 총 거래대금 (억 단위) -> 100억당 1점
    const totalVolume = stocks.reduce((sum, s) => sum + (s.amount || 0), 0);
    const volumeScore = totalVolume / 100;

    // 2. 평균 등락률 -> 1%당 10점
    const avgRate = stocks.reduce((sum, s) => sum + (s.rate || 0), 0) / stocks.length;
    const rateScore = avgRate * 10;

    // 3. 급등주 보너스 (10% 이상 종목당 +5점)
    const surgeCount = stocks.filter(s => (s.rate || 0) >= 10).length;
    const surgeBonus = surgeCount * 5;

    // 4. 상한가 보너스 (29% 이상 종목당 +20점)
    const limitUpCount = stocks.filter(s => (s.rate || 0) >= 29).length;
    const limitUpBonus = limitUpCount * 20;

    // 5. 종목 수 보너스 (3개 이상이면 +10점)
    const countBonus = stocks.length >= 3 ? 10 : 0;

    const totalScore = volumeScore + rateScore + surgeBonus + limitUpBonus + countBonus;

    return totalScore;
}

/**
 * 테마에 최소 종목 수 보장
 * @param {Object} theme - 테마 객체
 * @param {Array} hotStocks - 급등주 배열 (보충용)
 * @param {Object} themeSectors - THEME_SECTORS 참조
 * @param {number} minStocks - 최소 종목 수 (기본 4)
 * @returns {Object} - 보충된 테마 객체
 */
function ensureMinimumStocks(theme, hotStocks, themeSectors, minStocks = 4) {
    if (!theme || !theme.stocks) return theme;
    if (theme.stocks.length >= minStocks) return theme;

    const currentNames = new Set(theme.stocks.map(s => s.name));
    const sectorInfo = themeSectors[theme.name];

    if (!sectorInfo) return theme;

    const additionalStocks = [];

    // 1. THEME_SECTORS의 stocks 리스트에서 보충
    for (const stockName of sectorInfo.stocks) {
        if (currentNames.has(stockName)) continue;
        if (theme.stocks.length + additionalStocks.length >= minStocks) break;

        // 급등주에서 해당 종목 찾기
        const hotStock = hotStocks.find(h => h.name === stockName);
        if (hotStock) {
            additionalStocks.push(hotStock);
            currentNames.add(stockName);
        }
    }

    // 2. 키워드 매칭으로 추가 보충
    if (theme.stocks.length + additionalStocks.length < minStocks) {
        for (const hotStock of hotStocks) {
            if (currentNames.has(hotStock.name)) continue;
            if (theme.stocks.length + additionalStocks.length >= minStocks) break;

            const matchesKeyword = sectorInfo.keywords.some(kw =>
                hotStock.name.includes(kw)
            );
            if (matchesKeyword) {
                additionalStocks.push(hotStock);
                currentNames.add(hotStock.name);
            }
        }
    }

    if (additionalStocks.length > 0) {
        console.log(`  [보충] ${theme.name}: ${theme.stocks.length} -> ${theme.stocks.length + additionalStocks.length}개 (+${additionalStocks.length})`);
    }

    return {
        ...theme,
        stocks: [...theme.stocks, ...additionalStocks]
    };
}

/**
 * 핵심 테마 동적 선정
 * @param {Array} allThemes - 전체 테마 배열
 * @param {number} maxCount - 선정할 최대 테마 수 (기본 7)
 * @param {Array} hotStocks - 급등주 배열 (종목 보충용)
 * @param {Object} themeSectors - THEME_SECTORS (종목 보충용)
 * @returns {Array} - 선정된 핵심 테마
 */
function selectCoreThemes(allThemes, maxCount = 7, hotStocks = [], themeSectors = {}) {
    // 특수 테마 제외
    const candidateThemes = allThemes.filter(t =>
        !SPECIAL_THEME_NAMES.includes(t.name) &&
        !OTHER_SECTOR_THEMES.includes(t.name)
    );

    // 점수 계산 및 정렬
    const scoredThemes = candidateThemes.map(t => ({
        ...t,
        rankScore: calculateThemeRankScore(t),
        isCore: true
    }));

    scoredThemes.sort((a, b) => b.rankScore - a.rankScore);

    let selected = scoredThemes.slice(0, maxCount);

    // 최소 종목 수 보장 (4개)
    if (hotStocks.length > 0 && Object.keys(themeSectors).length > 0) {
        selected = selected.map(t => ensureMinimumStocks(t, hotStocks, themeSectors, 4));
    }

    console.log('Core themes selected:');
    selected.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.name} (rankScore: ${t.rankScore.toFixed(1)}, stocks: ${t.stocks?.length || 0})`);
    });

    return selected;
}

/**
 * 기타섹터 통합
 * @param {Array} allThemes - 전체 테마 배열
 * @param {Array} coreThemeNames - 핵심 테마명 배열
 * @param {Object} options - 옵션
 * @returns {Object|null} - 기타섹터 테마 객체
 */
function mergeOtherSectors(allThemes, coreThemeNames, options = {}) {
    const { maxStocks = 5 } = options;

    // 핵심 테마에 포함되지 않은 테마들
    const otherThemes = allThemes.filter(t =>
        !coreThemeNames.includes(t.name) &&
        !SPECIAL_THEME_NAMES.includes(t.name)
    );

    if (otherThemes.length === 0) return null;

    // 종목 통합 (중복 제거)
    const mergedStocks = [];
    const usedNames = new Set();
    const sourceThemes = [];

    for (const theme of otherThemes) {
        if (!theme.stocks || theme.stocks.length === 0) continue;

        sourceThemes.push(theme.name);

        for (const stock of theme.stocks) {
            if (!usedNames.has(stock.name)) {
                mergedStocks.push({
                    ...stock,
                    sourceTheme: theme.name // 원래 테마 추적
                });
                usedNames.add(stock.name);
            }
        }
    }

    if (mergedStocks.length === 0) return null;

    // 등락률 + 거래대금 가중 정렬
    mergedStocks.sort((a, b) => {
        const scoreA = (a.rate || 0) + ((a.amount || 0) / 100);
        const scoreB = (b.rate || 0) + ((b.amount || 0) / 100);
        return scoreB - scoreA;
    });

    const selectedStocks = mergedStocks.slice(0, maxStocks);

    // 점수 계산
    const score = selectedStocks.length > 0
        ? selectedStocks.reduce((sum, s) => sum + (s.rate || 0), 0) / selectedStocks.length
        : 0;

    const totalVolume = selectedStocks.reduce((sum, s) => sum + (s.amount || 0), 0);

    console.log(`Other sectors merged: ${sourceThemes.join(', ')} -> ${selectedStocks.length} stocks`);

    return {
        name: '기타섹터',
        headline: `기타 테마 통합 (${sourceThemes.slice(0, 3).join(', ')}${sourceThemes.length > 3 ? ' 등' : ''})`,
        stocks: selectedStocks,
        score: score,
        totalVolume: totalVolume,
        sourceThemes: sourceThemes,
        isSpecial: true
    };
}

/**
 * 신규상장 테마 생성
 * @param {Array} ipoStocks - IPO 종목 배열
 * @param {Array} hotStocks - 급등주 배열 (실시간 데이터 보강용)
 * @param {Object} options - 옵션
 * @returns {Object|null} - 신규상장 테마 객체
 */
function createIPOTheme(ipoStocks, hotStocks, options = {}) {
    const { maxStocks = 5, minRate = -5 } = options;

    if (!ipoStocks || ipoStocks.length === 0) return null;

    // 급등주 데이터로 IPO 종목 실시간 데이터 보강
    const enrichedIPOs = ipoStocks.map(ipo => {
        const hotStock = hotStocks.find(h => h.code === ipo.code || h.name === ipo.name);
        if (hotStock) {
            return {
                ...ipo,
                rate: hotStock.rate || ipo.rate,
                amount: hotStock.amount || ipo.amount,
                price: hotStock.price || ipo.price
            };
        }
        return ipo;
    });

    // 필터링: 최소 등락률 이상 또는 거래대금 50억 이상
    const activeIPOs = enrichedIPOs.filter(ipo =>
        (ipo.rate >= minRate) || (ipo.amount >= 50)
    );

    if (activeIPOs.length === 0) return null;

    // 등락률 + 거래대금 가중 정렬
    activeIPOs.sort((a, b) => {
        const scoreA = (a.rate || 0) + ((a.amount || 0) / 50);
        const scoreB = (b.rate || 0) + ((b.amount || 0) / 50);
        return scoreB - scoreA;
    });

    const selectedStocks = activeIPOs.slice(0, maxStocks);

    // 점수 계산
    const score = selectedStocks.length > 0
        ? selectedStocks.reduce((sum, s) => sum + (s.rate || 0), 0) / selectedStocks.length
        : 0;

    const totalVolume = selectedStocks.reduce((sum, s) => sum + (s.amount || 0), 0);

    // 대표 종목으로 헤드라인 생성
    const topStock = selectedStocks[0];
    const headline = topStock
        ? `${topStock.name} 등 신규상장주 ${selectedStocks.length}개 움직임`
        : '신규상장 종목';

    console.log(`IPO theme created: ${selectedStocks.length} stocks (top: ${topStock?.name})`);

    return {
        name: '신규상장',
        headline: headline,
        stocks: selectedStocks.map(s => ({
            ...s,
            isIPO: true
        })),
        score: score,
        totalVolume: totalVolume,
        isSpecial: true
    };
}

/**
 * 개별이슈 테마 처리
 * @param {Array} allThemes - 전체 테마 배열
 * @param {Object} options - 옵션
 * @returns {Object|null} - 개별이슈 테마 객체
 */
function processIndividualTheme(allThemes, options = {}) {
    const { maxStocks = 5 } = options;

    // 기존 개별이슈 테마 찾기
    const individualTheme = allThemes.find(t => t.name === '개별이슈');

    if (!individualTheme || !individualTheme.stocks || individualTheme.stocks.length === 0) {
        return null;
    }

    // 등락률 기준 정렬 후 상위 N개
    const stocks = [...individualTheme.stocks];
    stocks.sort((a, b) => (b.rate || 0) - (a.rate || 0));
    const selectedStocks = stocks.slice(0, maxStocks);

    // 점수 재계산
    const score = selectedStocks.length > 0
        ? selectedStocks.reduce((sum, s) => sum + (s.rate || 0), 0) / selectedStocks.length
        : 0;

    const totalVolume = selectedStocks.reduce((sum, s) => sum + (s.amount || 0), 0);

    return {
        ...individualTheme,
        stocks: selectedStocks,
        score: score,
        totalVolume: totalVolume,
        isSpecial: true
    };
}

/**
 * 강세 테마 분할 (종목이 많은 테마를 여러 파트로 나눔)
 * 예: 로봇(12종목) -> 로봇①(5종목), 로봇②(5종목), 로봇③(2종목)
 *
 * @param {Array} themes - 테마 배열
 * @param {Object} config - 분할 설정 (SPLIT_CONFIG)
 * @returns {Array} - 분할된 테마 배열
 */
function splitLargeThemes(themes, config = SPLIT_CONFIG) {
    const result = [];

    for (const theme of themes) {
        const stocks = theme.stocks || [];
        const score = theme.score || 0;

        // 분할 조건 체크: 종목 수 >= 최소 기준 AND 점수 >= 최소 점수
        const shouldSplit = stocks.length >= config.minStocksToSplit &&
                           score >= config.minScoreToSplit;

        if (!shouldSplit) {
            // 분할 불필요: 그대로 추가 (5개로 제한)
            result.push({
                ...theme,
                stocks: stocks.slice(0, config.stocksPerPart)
            });
            continue;
        }

        // 종목을 등락률 + 거래대금 가중치로 정렬
        const sortedStocks = [...stocks].sort((a, b) => {
            const scoreA = (a.rate || 0) * 2 + ((a.amount || 0) / 100);
            const scoreB = (b.rate || 0) * 2 + ((b.amount || 0) / 100);
            return scoreB - scoreA;
        });

        // 파트 수 계산
        const partCount = Math.min(
            Math.ceil(sortedStocks.length / config.stocksPerPart),
            config.maxParts
        );

        console.log(`  [Split] ${theme.name}: ${stocks.length}종목 -> ${partCount}파트로 분할`);

        // 파트별로 테마 생성
        for (let i = 0; i < partCount; i++) {
            const startIdx = i * config.stocksPerPart;
            const partStocks = sortedStocks.slice(startIdx, startIdx + config.stocksPerPart);

            if (partStocks.length === 0) continue;

            // 파트 점수 계산
            const partScore = partStocks.reduce((sum, s) => sum + (s.rate || 0), 0) / partStocks.length;
            const partVolume = partStocks.reduce((sum, s) => sum + (s.amount || 0), 0);

            // 파트 이름: 로봇①, 로봇②, 로봇③
            const partLabels = ['①', '②', '③'];
            const partName = partCount > 1 ? `${theme.name}${partLabels[i]}` : theme.name;

            // 헤드라인 생성
            const topStock = partStocks[0];
            const partHeadline = topStock
                ? `${topStock.name} ${topStock.rate >= 0 ? '+' : ''}${(topStock.rate || 0).toFixed(1)}% 등 ${partName} 강세`
                : theme.headline;

            result.push({
                ...theme,
                id: `${theme.id || theme.name}_part${i + 1}`,
                name: partName,
                headline: partHeadline,
                stocks: partStocks,
                score: partScore,
                totalVolume: partVolume,
                // 분할 메타 정보 (프론트엔드에서 합산용)
                splitInfo: {
                    originalName: theme.name,
                    partNumber: i + 1,
                    totalParts: partCount,
                    totalStocks: sortedStocks.length
                }
            });

            console.log(`    ${partName}: ${partStocks.length}종목, score ${partScore.toFixed(2)}, volume ${partVolume}억`);
        }
    }

    return result;
}

/**
 * 최종 10개 테마 선정
 * @param {Array} allThemes - 전체 테마 배열
 * @param {Array} ipoStocks - IPO 종목 배열
 * @param {Array} hotStocks - 급등주 배열
 * @param {Object} options - 옵션 (themeSectors 포함 가능)
 * @returns {Array} - 최종 테마 배열 (최대 10개)
 */
async function selectFinalThemes(allThemes, ipoStocks, hotStocks, options = {}) {
    const {
        maxCoreThemes = 7,
        maxTotalThemes = 10,
        themeSectors = {} // THEME_SECTORS 전달용
    } = options;

    console.log('=== Selecting Final Themes ===');
    console.log(`Input: ${allThemes.length} themes, ${ipoStocks?.length || 0} IPO stocks, ${hotStocks?.length || 0} hot stocks`);

    const result = [];

    // 1. 핵심 테마 7개 선정 (최소 4종목 보장)
    const coreThemes = selectCoreThemes(allThemes, maxCoreThemes, hotStocks, themeSectors);

    // 1.5 ⭐ NEW: 강세 테마 분할 (종목 6개 이상 + 점수 5% 이상인 테마)
    console.log('Splitting large themes...');
    const splitThemes = splitLargeThemes(coreThemes, SPLIT_CONFIG);
    result.push(...splitThemes);

    // 핵심 테마명 추출 (분할된 것 포함)
    const coreNames = coreThemes.map(t => t.name);

    // 2. 개별이슈 추가
    const individualTheme = processIndividualTheme(allThemes);
    if (individualTheme && result.length < maxTotalThemes) {
        result.push(individualTheme);
        console.log(`Added: 개별이슈 (${individualTheme.stocks.length} stocks)`);
    }

    // 3. 신규상장 추가
    const ipoTheme = createIPOTheme(ipoStocks, hotStocks);
    if (ipoTheme && result.length < maxTotalThemes) {
        result.push(ipoTheme);
        console.log(`Added: 신규상장 (${ipoTheme.stocks.length} stocks)`);
    }

    // 4. 기타섹터 추가
    const otherSector = mergeOtherSectors(allThemes, coreNames);
    if (otherSector && result.length < maxTotalThemes) {
        result.push(otherSector);
        console.log(`Added: 기타섹터 (${otherSector.stocks.length} stocks)`);
    }

    // 최종 결과
    const finalResult = result.slice(0, maxTotalThemes);

    console.log('=== Final Themes ===');
    finalResult.forEach((t, i) => {
        const type = t.isCore ? 'CORE' : 'SPECIAL';
        console.log(`  ${i + 1}. [${type}] ${t.name} (score: ${(t.score || 0).toFixed(2)}, stocks: ${t.stocks?.length || 0})`);
    });

    return finalResult;
}

module.exports = {
    calculateThemeRankScore,
    selectCoreThemes,
    mergeOtherSectors,
    createIPOTheme,
    processIndividualTheme,
    selectFinalThemes,
    splitLargeThemes,
    CORE_THEME_CANDIDATES,
    OTHER_SECTOR_THEMES,
    SPECIAL_THEME_NAMES,
    SPLIT_CONFIG
};
