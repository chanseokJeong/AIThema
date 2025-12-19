const { fetchStockByCode } = require('./naver_api');
const { fetchMarketData } = require('./market');

async function debug() {
    console.log('=== Debugging Discrepancies ===');

    // 1. Construction Stocks (Amount Issue)
    // 상지건설 (042940), 신원종합개발 (017000)
    const constructionStocks = [
        { name: '상지건설', code: '042940' },
        { name: '신원종합개발', code: '017000' }
    ];

    console.log('\n--- Construction Stocks (Amount Check) ---');
    for (const s of constructionStocks) {
        const data = await fetchStockByCode(s.code);
        console.log(`${s.name} (${s.code}):`);
        if (data) {
            console.log(`  Raw Amount (aa): ${data.amount * 100000000} (Estimated from 억)`); // Re-calculate raw for display if needed, but fetchStockByCode returns processed.
            // Wait, I need raw data. I'll use a temporary raw fetch here or modify naver_api temporarily.
            // Actually, let's just look at the processed output first.
            console.log(`  Processed Amount: ${data.amount}억`);
            console.log(`  Rate: ${data.rate}%`);
        } else {
            console.log('  Failed to fetch.');
        }
    }

    // 2. Robot Stocks (Missing Issue)
    // 레인보우로보틱스 (277810), 두산로보틱스 (454910)
    const robotStocks = [
        { name: '레인보우로보틱스', code: '277810' },
        { name: '두산로보틱스', code: '454910' }
    ];

    console.log('\n--- Robot Stocks (Visibility Check) ---');
    for (const s of robotStocks) {
        const data = await fetchStockByCode(s.code);
        console.log(`${s.name} (${s.code}):`);
        if (data) {
            console.log(`  Amount: ${data.amount}억`);
            console.log(`  Rate: ${data.rate}%`);
            const isDip = data.rate >= -5.0 && data.amount >= 300;
            console.log(`  Dip Candidate? ${isDip} (Rate >= -5.0 && Amount >= 300)`);
        } else {
            console.log('  Failed to fetch.');
        }
    }
}

debug();
