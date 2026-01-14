/**
 * 테마 그룹핑 모듈
 *
 * 네이버 테마를 직관적인 핵심 테마로 자동 압축
 * AI 없이 규칙 기반으로 동작 (AI는 보조 수단)
 */

// ========================================
// 1. 재벌 그룹 매핑 (종목 → 그룹)
// ========================================
const CONGLOMERATE_STOCKS = {
    '현대차그룹': [
        '현대차', '기아', '현대모비스', '현대제철', '현대위아',
        '현대글로비스', '현대오토에버', '현대로템', '현대건설',
        '현대엔지니어링', '현대일렉트릭', '현대에너지솔루션'
    ],
    '한화그룹': [
        '한화에어로스페이스', '한화오션', '한화시스템', '한화솔루션',
        '한화', '한화생명', '한화투자증권', '한화갤러리아',
        '한화에너지', '한화임팩트', '한화비전'
    ],
    '삼성그룹': [
        '삼성전자', '삼성SDI', '삼성물산', '삼성바이오로직스',
        '삼성생명', '삼성화재', '삼성증권', '삼성중공업',
        '삼성엔지니어링', '삼성전기', '삼성SDS', '호텔신라'
    ],
    'SK그룹': [
        'SK하이닉스', 'SK이노베이션', 'SK텔레콤', 'SK스퀘어',
        'SK네트웍스', 'SK케미칼', 'SK바이오팜', 'SK바이오사이언스',
        'SK아이이테크놀로지', 'SK가스', 'SK렌터카'
    ],
    'LG그룹': [
        'LG전자', 'LG화학', 'LG에너지솔루션', 'LG디스플레이',
        'LG이노텍', 'LG생활건강', 'LG유플러스', 'LG CNS',
        'LG헬로비전', 'LG경제연구원'
    ],
    '롯데그룹': [
        '롯데케미칼', '롯데칠성', '롯데쇼핑', '롯데지주',
        '롯데푸드', '롯데정밀화학', '롯데렌탈', '롯데하이마트'
    ],
    '포스코그룹': [
        'POSCO홀딩스', '포스코퓨처엠', '포스코인터내셔널',
        '포스코DX', '포스코엠텍', '포스코스틸리온'
    ],
    '두산그룹': [
        '두산에너빌리티', '두산밥캣', '두산로보틱스', '두산퓨얼셀',
        '두산', '두산테스나'
    ]
};

// ========================================
// 2. 테마 통합 규칙 (유사 테마 → 대표 테마)
// ========================================
const THEME_CONSOLIDATION = {
    '2차전지': [
        '2차전지', '2차전지(소재/부품)', '2차전지(생산)', '2차전지(전고체)',
        '2차전지(나트륨이온)', '배터리', '리튬', '양극재', '음극재'
    ],
    '자동차': [
        '자동차', '자동차 대표주', '자동차부품', '전기차', '수소차',
        '자율주행차', '스마트카', '리비안(RIVIAN)', '테슬라'
    ],
    '반도체': [
        '반도체', 'IT 대표주', 'HBM', '메모리반도체', '시스템반도체',
        '반도체장비', '반도체소재', 'AI반도체', '파운드리'
    ],
    '로봇': [
        '로봇', '협동로봇', '산업용로봇', '서비스로봇', '로봇부품',
        '자동화설비', '스마트팩토리'
    ],
    '방위산업': [
        '방산', '방위산업', 'K-방산', '군수', '무기체계', '우주항공방산'
    ],
    '원자력발전': [
        '원자력', '원전', 'SMR', '소형모듈원전', '원자력발전'
    ],
    '바이오': [
        '바이오', '제약', '신약', '바이오시밀러', '의약품', '헬스케어',
        '진단키트', '의료기기', 'mRNA'
    ],
    '조선': [
        '조선', '선박', '해운', '조선기자재', 'LNG선', '컨테이너선'
    ],
    '건설': [
        '건설', '부동산', '시멘트', '레미콘', '인테리어', '리모델링'
    ],
    '금융': [
        '금융', '증권', '은행', '보험', '저축은행', '캐피탈'
    ],
    '게임/엔터': [
        '게임', '엔터테인먼트', 'K-POP', '미디어', '콘텐츠', 'OTT'
    ],
    '화장품': [
        '화장품', 'K-뷰티', '뷰티', '코스메틱'
    ],
    'AI/소프트웨어': [
        'AI', '인공지능', '소프트웨어', 'SaaS', '클라우드', 'IT서비스'
    ],
    '밸류업': [
        '밸류업', '기업가치', '주주환원', '자사주', '배당'
    ],
    '항공/우주': [
        '항공', '우주', '위성', '드론', 'UAM'
    ],
    '전력설비': [
        '전력설비', '전력기기', '변압기', '초고압', '송전', 'HVDC'
    ]
};

// ========================================
// 3. 테마 우선순위 (상위에 표시할 순서)
// ========================================
const THEME_PRIORITY = [
    '현대차그룹', '한화그룹', '삼성그룹', 'SK그룹', 'LG그룹', '포스코그룹', '두산그룹',
    '로봇', '반도체', '2차전지', '자동차', '방위산업',
    '원자력발전', '바이오', '조선', 'AI/소프트웨어', '밸류업', '전력설비'
];

// ========================================
// 핵심 함수들
// ========================================

/**
 * 종목 리스트에서 재벌 그룹 감지
 * @param {Array} stocks - 종목 배열 [{name, rate, ...}]
 * @returns {Object} { groupName: { stocks: [...], avgRate, totalAmount } }
 */
function detectConglomerates(stocks) {
    const detected = {};

    console.log(`[detectConglomerates] Input stocks count: ${stocks.length}`);

    for (const [groupName, groupStocks] of Object.entries(CONGLOMERATE_STOCKS)) {
        const matched = stocks.filter(s => groupStocks.includes(s.name));

        if (matched.length > 0) {
            console.log(`[detectConglomerates] ${groupName}: matched ${matched.length} -> ${matched.map(s => s.name).join(', ')}`);
        }

        // ⭐ 중복 종목 제거 (같은 종목이 여러 테마에 포함되어 allStocks에 중복 유입될 수 있음)
        const uniqueMatched = [];
        const seenNames = new Set();
        for (const stock of matched) {
            if (!seenNames.has(stock.name)) {
                seenNames.add(stock.name);
                uniqueMatched.push(stock);
            }
        }

        if (matched.length !== uniqueMatched.length) {
            console.log(`[detectConglomerates] ${groupName}: dedupe ${matched.length} -> ${uniqueMatched.length}`);
        }

        if (uniqueMatched.length >= 2) { // 최소 2개 종목이 있어야 그룹으로 인정
            const avgRate = uniqueMatched.reduce((sum, s) => sum + (s.rate || 0), 0) / uniqueMatched.length;
            const totalAmount = uniqueMatched.reduce((sum, s) => sum + (s.amount || 0), 0);

            detected[groupName] = {
                stocks: uniqueMatched,
                avgRate: Math.round(avgRate * 100) / 100,
                totalAmount,
                stockCount: uniqueMatched.length
            };
            console.log(`[detectConglomerates] ${groupName}: ADDED with ${uniqueMatched.length} unique stocks`);
        }
    }

    return detected;
}

/**
 * 테마명을 대표 테마로 통합
 * @param {string} themeName - 원본 테마명
 * @returns {string} 통합된 테마명
 */
function consolidateThemeName(themeName) {
    const normalized = themeName.toLowerCase();

    for (const [representative, variations] of Object.entries(THEME_CONSOLIDATION)) {
        for (const variation of variations) {
            if (normalized.includes(variation.toLowerCase()) ||
                variation.toLowerCase().includes(normalized)) {
                return representative;
            }
        }
    }

    return themeName; // 매칭 안 되면 원본 반환
}

/**
 * 테마 리스트를 그룹핑하여 핵심 테마로 압축
 * @param {Array} themes - 테마 배열 [{name, stocks, score, ...}]
 * @param {number} maxThemes - 최대 테마 수 (기본: 10)
 * @returns {Array} 압축된 테마 배열
 */
function groupThemes(themes, maxThemes = 10) {
    console.log(`[ThemeGrouper] Grouping ${themes.length} themes into max ${maxThemes}...`);

    // 1. 모든 테마의 종목을 수집
    const allStocks = [];
    themes.forEach(theme => {
        if (theme.stocks && Array.isArray(theme.stocks)) {
            theme.stocks.forEach(stock => {
                if (typeof stock === 'object') {
                    allStocks.push(stock);
                }
            });
        }
    });

    // 2. 재벌 그룹 감지
    const conglomerates = detectConglomerates(allStocks);
    console.log(`[ThemeGrouper] Detected conglomerates: ${Object.keys(conglomerates).join(', ') || 'none'}`);

    // 3. 테마 통합
    const consolidated = new Map(); // 대표테마 → { stocks, scores, ... }

    for (const theme of themes) {
        const repName = consolidateThemeName(theme.name);

        if (!consolidated.has(repName)) {
            consolidated.set(repName, {
                name: repName,
                originalNames: [],
                stocks: [],
                stockSet: new Set(),
                totalScore: 0,
                count: 0,
                isHot: false,
                maxRate: -Infinity
            });
        }

        const group = consolidated.get(repName);
        group.originalNames.push(theme.name);
        group.totalScore += theme.score || 0;
        group.count++;
        group.isHot = group.isHot || theme.isHot;

        // 종목 병합 (중복 제거)
        if (theme.stocks) {
            theme.stocks.forEach(stock => {
                const stockName = typeof stock === 'string' ? stock : stock.name;
                if (!group.stockSet.has(stockName)) {
                    group.stockSet.add(stockName);
                    group.stocks.push(stock);

                    const rate = typeof stock === 'object' ? (stock.rate || 0) : 0;
                    if (rate > group.maxRate) group.maxRate = rate;
                }
            });
        }
    }

    // 4. 재벌 그룹을 테마로 추가
    for (const [groupName, groupData] of Object.entries(conglomerates)) {
        // 기존 테마와 중복되지 않게
        if (!consolidated.has(groupName)) {
            const topStock = groupData.stocks.sort((a, b) => (b.rate || 0) - (a.rate || 0))[0];

            consolidated.set(groupName, {
                name: groupName,
                originalNames: [groupName],
                stocks: groupData.stocks,
                stockSet: new Set(groupData.stocks.map(s => s.name)),
                totalScore: groupData.avgRate * 10, // 점수 환산
                count: 1,
                isHot: groupData.avgRate > 3, // 평균 3% 이상이면 핫
                maxRate: topStock?.rate || 0,
                isConglomerate: true,
                headline: `${groupName} ${groupData.stockCount}개 종목 평균 ${groupData.avgRate > 0 ? '+' : ''}${groupData.avgRate}%`
            });
        }
    }

    // 5. 최종 테마 리스트 생성
    const result = [];

    for (const [name, group] of consolidated) {
        const avgScore = group.totalScore / group.count;

        // 헤드라인 생성
        let headline = group.headline;
        if (!headline) {
            const topStock = group.stocks
                .filter(s => typeof s === 'object')
                .sort((a, b) => (b.rate || 0) - (a.rate || 0))[0];

            if (topStock) {
                headline = `${topStock.name} ${topStock.rate >= 0 ? '+' : ''}${(topStock.rate || 0).toFixed(1)}% 등 ${name} 강세`;
            } else {
                headline = `${name} 테마 동향`;
            }
        }

        // ⭐ FIX: 최종 결과에서 중복 종목 확실히 제거
        const uniqueStocks = [];
        const seenStockNames = new Set();
        for (const stock of group.stocks) {
            const stockName = typeof stock === 'string' ? stock : stock.name;
            if (stockName && !seenStockNames.has(stockName)) {
                seenStockNames.add(stockName);
                uniqueStocks.push(stock);
            }
        }

        result.push({
            id: name,
            name: name,
            headline: headline,
            stocks: uniqueStocks.slice(0, 10), // 최대 10개 종목
            score: avgScore,
            isHot: group.isHot,
            isConglomerate: group.isConglomerate || false,
            originalThemes: group.originalNames,
            stockCount: uniqueStocks.length
        });
    }

    // 6. 정렬: 핫 테마 우선, 그 다음 우선순위, 그 다음 점수
    result.sort((a, b) => {
        // 핫 테마 우선
        if (a.isHot !== b.isHot) return b.isHot ? 1 : -1;

        // 우선순위 체크
        const prioA = THEME_PRIORITY.indexOf(a.name);
        const prioB = THEME_PRIORITY.indexOf(b.name);
        if (prioA !== -1 && prioB !== -1) return prioA - prioB;
        if (prioA !== -1) return -1;
        if (prioB !== -1) return 1;

        // 점수순
        return (b.score || 0) - (a.score || 0);
    });

    // 7. 상위 N개만 반환
    const finalThemes = result.slice(0, maxThemes);

    console.log(`[ThemeGrouper] Final themes: ${finalThemes.map(t => t.name).join(', ')}`);

    return finalThemes;
}

/**
 * 테마 이름만 빠르게 압축 (AI 대용)
 * @param {Array} themeNames - 테마명 배열
 * @returns {Array} 압축된 테마명 배열
 */
function quickConsolidate(themeNames) {
    const consolidated = new Set();

    for (const name of themeNames) {
        consolidated.add(consolidateThemeName(name));
    }

    return Array.from(consolidated);
}

/**
 * 오늘의 핵심 테마 요약 생성 (AI 없이)
 * @param {Array} themes - 그룹핑된 테마 배열
 * @returns {string} 요약 문자열
 */
function generateThemeSummary(themes) {
    const topThemes = themes.slice(0, 8);
    const hotThemes = topThemes.filter(t => t.isHot);
    const conglomerates = topThemes.filter(t => t.isConglomerate);

    let summary = '오늘의 핵심 테마: ';
    summary += topThemes.map(t => `[${t.name}]`).join(' ');

    if (hotThemes.length > 0) {
        summary += `\n핫 테마: ${hotThemes.map(t => t.name).join(', ')}`;
    }

    if (conglomerates.length > 0) {
        summary += `\n그룹주 강세: ${conglomerates.map(t => t.name).join(', ')}`;
    }

    return summary;
}

module.exports = {
    CONGLOMERATE_STOCKS,
    THEME_CONSOLIDATION,
    THEME_PRIORITY,
    detectConglomerates,
    consolidateThemeName,
    groupThemes,
    quickConsolidate,
    generateThemeSummary
};
