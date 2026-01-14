/**
 * VI(변동성완화장치) 정보 수집 테스트
 *
 * 테스트 항목:
 * 1. naver_api.js의 parseViStatus 함수 정상 동작 확인
 * 2. fetchStockByCode에서 VI 정보가 포함되는지 확인
 * 3. market.js의 fetchStockPrice에서 VI 정보가 전달되는지 확인
 */

const { fetchStockByCode, parseViStatus, VI_STATUS } = require('./naver_api');
const { fetchStockPrice } = require('./market');

async function testViParsing() {
    console.log('=== VI 파싱 로직 테스트 ===\n');

    // 테스트 케이스: 다양한 tradeStopType 값
    const testCases = [
        { code: '1', text: 'Trading', name: 'TRADING' },
        { code: '2', text: '정적VI', name: 'VI_STATIC' },
        { code: '3', text: '동적VI', name: 'VI_DYNAMIC' },
        { code: '4', text: '거래정지', name: 'HALT' },
        null,
        undefined
    ];

    testCases.forEach((testCase, i) => {
        const result = parseViStatus(testCase);
        console.log(`Case ${i + 1}: ${JSON.stringify(testCase)}`);
        console.log(`  -> isVI: ${result.isVI}, viType: ${result.viType}, viText: ${result.viText}\n`);
    });
}

async function testRealStockVI() {
    console.log('=== 실제 종목 VI 정보 테스트 ===\n');

    // 테스트할 종목 코드 목록 (대형주 + 변동성이 높은 종목)
    const testCodes = [
        { code: '005930', name: '삼성전자' },
        { code: '000660', name: 'SK하이닉스' },
        { code: '035720', name: '카카오' },
        { code: '035420', name: 'NAVER' },
        { code: '051910', name: 'LG화학' }
    ];

    console.log('네이버 금융 API에서 VI 정보 조회 중...\n');

    for (const stock of testCodes) {
        try {
            const data = await fetchStockByCode(stock.code);
            if (data) {
                console.log(`[${stock.name}] (${stock.code})`);
                console.log(`  현재가: ${data.price?.toLocaleString()}원`);
                console.log(`  등락률: ${data.rate > 0 ? '+' : ''}${data.rate?.toFixed(2)}%`);
                console.log(`  VI 발동: ${data.isVI ? 'YES' : 'NO'}`);
                if (data.isVI) {
                    console.log(`  VI 타입: ${data.viType}`);
                    console.log(`  VI 설명: ${data.viText}`);
                }
                console.log('');
            } else {
                console.log(`[${stock.name}] 데이터 조회 실패\n`);
            }
        } catch (error) {
            console.error(`[${stock.name}] 오류: ${error.message}\n`);
        }
    }
}

async function testMarketJsVI() {
    console.log('=== market.js VI 정보 전달 테스트 ===\n');

    const testStocks = ['삼성전자', 'SK하이닉스', '카카오'];

    for (const stockName of testStocks) {
        try {
            const data = await fetchStockPrice(stockName);
            console.log(`[${stockName}]`);
            console.log(`  현재가: ${data.price?.toLocaleString()}원`);
            console.log(`  등락률: ${data.rate > 0 ? '+' : ''}${data.rate?.toFixed(2)}%`);
            console.log(`  VI 발동: ${data.isVI ? 'YES' : 'NO'}`);
            console.log(`  viType: ${data.viType}`);
            console.log(`  viText: ${data.viText}`);
            console.log('');
        } catch (error) {
            console.error(`[${stockName}] 오류: ${error.message}\n`);
        }
    }
}

async function main() {
    console.log('==================================================');
    console.log('  VI(변동성완화장치) 기능 테스트');
    console.log('==================================================\n');

    // 1. 파싱 로직 테스트
    await testViParsing();

    console.log('--------------------------------------------------\n');

    // 2. 실제 종목 VI 정보 테스트
    await testRealStockVI();

    console.log('--------------------------------------------------\n');

    // 3. market.js 통합 테스트
    await testMarketJsVI();

    console.log('==================================================');
    console.log('  테스트 완료');
    console.log('==================================================');
}

main().catch(console.error);
