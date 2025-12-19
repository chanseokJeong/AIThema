const { fetchMarketData } = require('./market');

async function test() {
    console.log('Testing Naver Finance Scraper...');

    const stocks = ["삼성전자", "SK하이닉스", "한화오션", "없는종목"];
    const results = await fetchMarketData(stocks);

    console.log('Results:');
    console.log(JSON.stringify(results, null, 2));
}

test();
