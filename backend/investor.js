/**
 * 투자자별 매매동향 (외국인/기관/개인) 및 공매도 데이터 수집
 *
 * 두 가지 방식 지원:
 * 1. Python (pykrx) - 정확한 KRX 데이터 (권장)
 * 2. 네이버 금융 스크래핑 - Python 미설치 시 폴백
 */

const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

// Python 사용 가능 여부 캐시
let pythonAvailable = null;
let lastPythonCheck = 0;
const PYTHON_CHECK_INTERVAL = 60000; // 1분

// 투자자 데이터 캐시 (API 호출 최소화)
const investorCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5분

/**
 * Python 사용 가능 여부 확인
 */
async function checkPython() {
    const now = Date.now();
    if (pythonAvailable !== null && now - lastPythonCheck < PYTHON_CHECK_INTERVAL) {
        return pythonAvailable;
    }

    return new Promise((resolve) => {
        const python = spawn('python', ['--version']);
        python.on('close', (code) => {
            pythonAvailable = code === 0;
            lastPythonCheck = now;
            resolve(pythonAvailable);
        });
        python.on('error', () => {
            pythonAvailable = false;
            lastPythonCheck = now;
            resolve(false);
        });
    });
}

/**
 * Python pykrx를 통한 데이터 수집
 */
async function fetchFromPython(command, code) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'python', 'stock_data.py');

        // 가상 환경 Python 경로 우선 시도
        const venvPython = path.join(__dirname, 'python', 'venv', 'bin', 'python');
        const venvPythonWin = path.join(__dirname, 'python', 'venv', 'Scripts', 'python.exe');

        // 가상 환경 Python 존재 여부 확인
        let pythonCmd = 'python';
        if (require('fs').existsSync(venvPython)) {
            pythonCmd = venvPython;  // Linux/Mac 가상 환경
        } else if (require('fs').existsSync(venvPythonWin)) {
            pythonCmd = venvPythonWin;  // Windows 가상 환경
        }

        const python = spawn(pythonCmd, [scriptPath, command, code]);

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        python.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        python.on('close', (code) => {
            if (code === 0 && stdout) {
                try {
                    const result = JSON.parse(stdout);
                    if (result && !result.error) {
                        resolve(result);
                    } else {
                        reject(new Error(result?.error || 'Unknown error'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Python output'));
                }
            } else {
                reject(new Error(stderr || 'Python script failed'));
            }
        });

        python.on('error', (err) => {
            reject(err);
        });

        // 타임아웃 10초
        setTimeout(() => {
            python.kill();
            reject(new Error('Python script timeout'));
        }, 10000);
    });
}

/**
 * 네이버 금융에서 외국인/기관 매매동향 스크래핑
 * URL: https://finance.naver.com/item/frgn.naver?code=005930
 */
async function fetchFromNaver(code) {
    try {
        const url = `https://finance.naver.com/item/frgn.naver?code=${code}`;

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const html = iconv.decode(response.data, 'euc-kr');
        const $ = cheerio.load(html);

        // 외국인 보유현황 테이블
        const foreignTable = $('table.tb_type1_ifrs, table.type2');

        // 외국인 보유 비율
        let foreignRatio = 0;
        const ratioText = $('em:contains("외국인한도소진율")').parent().next().text() ||
                         $('th:contains("외국인한도소진율")').next().text();
        if (ratioText) {
            foreignRatio = parseFloat(ratioText.replace(/[^0-9.-]/g, '')) || 0;
        }

        // 투자자별 매매동향 테이블
        const tradeTable = $('table.type2').eq(1);
        const rows = tradeTable.find('tbody tr');

        let foreignNet = 0;
        let institutionNet = 0;
        let retailNet = 0;

        // 최근 거래일 데이터 추출
        if (rows.length > 0) {
            const firstRow = rows.eq(0);
            const cells = firstRow.find('td');

            if (cells.length >= 6) {
                // 외국인 순매수 (4번째 컬럼 근처)
                const foreignText = cells.eq(4).text().replace(/[^0-9.-]/g, '');
                foreignNet = Math.round(parseFloat(foreignText) / 100000000) || 0;

                // 기관 순매수 (5번째 컬럼 근처)
                const instText = cells.eq(5).text().replace(/[^0-9.-]/g, '');
                institutionNet = Math.round(parseFloat(instText) / 100000000) || 0;
            }
        }

        // 개인은 외국인+기관의 반대
        retailNet = -(foreignNet + institutionNet);

        return {
            foreignNet,
            institutionNet,
            retailNet,
            foreignRatio,
            source: 'naver'
        };
    } catch (error) {
        console.error(`[Investor] Naver fetch error for ${code}:`, error.message);
        return null;
    }
}

/**
 * 네이버 금융에서 공매도 데이터 스크래핑
 * NOTE: 네이버 금융에 공매도 페이지가 없어서 비활성화됨
 * 공매도 데이터는 pykrx를 통해서만 수집 가능
 */
async function fetchShortFromNaver(code) {
    // 네이버 금융에 공매도 페이지가 없음 (404)
    // pykrx가 작동하면 거기서 공매도 데이터를 수집
    return null;
}

/**
 * 통합 투자자 데이터 조회 (캐시 포함)
 */
async function getInvestorData(code) {
    // 캐시 확인
    const cached = investorCache.get(code);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    let investorData = null;
    let shortData = null;

    // Python 사용 가능하면 pykrx 사용
    const canUsePython = await checkPython();

    if (canUsePython) {
        try {
            const allData = await fetchFromPython('all', code);
            if (allData) {
                investorData = allData.investor || null;
                shortData = allData.short || null;
            }
        } catch (error) {
            console.log(`[Investor] Python fallback to Naver for ${code}`);
        }
    }

    // Python 실패시 네이버 스크래핑
    if (!investorData) {
        investorData = await fetchFromNaver(code);
    }

    if (!shortData) {
        shortData = await fetchShortFromNaver(code);
    }

    const result = {
        code,
        investor: investorData,
        short: shortData,
        timestamp: new Date().toISOString()
    };

    // 캐시 저장
    investorCache.set(code, {
        data: result,
        timestamp: Date.now()
    });

    return result;
}

/**
 * 여러 종목 일괄 조회 (병렬 처리)
 */
async function getBulkInvestorData(codes) {
    const BATCH_SIZE = 5; // 동시 요청 제한
    const results = [];

    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
        const batch = codes.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(code => getInvestorData(code).catch(() => null))
        );
        results.push(...batchResults);

        // Rate limit 방지
        if (i + BATCH_SIZE < codes.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return results.filter(r => r !== null);
}

/**
 * 수급 점수 계산
 * 외국인/기관 순매수 합계 기반
 */
function calculateSupplyScore(investorData) {
    if (!investorData || !investorData.investor) {
        return 0;
    }

    const { foreignNet = 0, institutionNet = 0 } = investorData.investor;
    const netBuy = foreignNet + institutionNet;

    // 순매수 금액 기준 점수 (억원)
    // -100억 이하: -2점, -50~-100억: -1점, -50~50억: 0점, 50~100억: +1점, 100억 이상: +2점
    if (netBuy >= 100) return 2;
    if (netBuy >= 50) return 1;
    if (netBuy <= -100) return -2;
    if (netBuy <= -50) return -1;
    return 0;
}

/**
 * 공매도 위험 점수 계산
 */
function calculateShortRisk(investorData) {
    if (!investorData || !investorData.short) {
        return 0;
    }

    const { shortRatio = 0 } = investorData.short;

    // 공매도 비중 기준 위험도
    // 5% 미만: 0점, 5~10%: 1점, 10~20%: 2점, 20% 이상: 3점
    if (shortRatio >= 20) return 3;
    if (shortRatio >= 10) return 2;
    if (shortRatio >= 5) return 1;
    return 0;
}

/**
 * 캐시 정리 (메모리 관리)
 */
function clearCache() {
    const now = Date.now();
    for (const [key, value] of investorCache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) {
            investorCache.delete(key);
        }
    }
}

// 5분마다 캐시 정리
setInterval(clearCache, 5 * 60 * 1000);

module.exports = {
    getInvestorData,
    getBulkInvestorData,
    calculateSupplyScore,
    calculateShortRisk,
    checkPython,
    clearCache
};
