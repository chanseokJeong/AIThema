const { fetchHotStocks } = require('./rising_stocks');

async function debugHotStocks() {
    console.log("Fetching hot stocks...");
    const stocks = await fetchHotStocks();

    console.log(`Total stocks fetched: ${stocks.length}`);

    // Check for specific missing stocks
    const targets = ['현대오토에버', '상지건설', '일성건설', '한라캐스트', '원익홀딩스'];

    console.log("\n--- Checking Target Stocks ---");
    targets.forEach(target => {
        const found = stocks.find(s => s.name === target);
        if (found) {
            console.log(`✅ Found ${target}: Rate=${found.rate}%, Amount=${found.amount}백만, Price=${found.price}`);
        } else {
            console.log(`❌ Missing ${target}`);
        }
    });

    console.log("\n--- Top 10 by Rate ---");
    stocks.sort((a, b) => b.rate - a.rate);
    stocks.slice(0, 10).forEach(s => {
        console.log(`${s.name}: ${s.rate}% (Amount: ${s.amount})`);
    });

    console.log("\n--- Top 10 by Amount ---");
    stocks.sort((a, b) => b.amount - a.amount);
    stocks.slice(0, 10).forEach(s => {
        console.log(`${s.name}: ${s.rate}% (Amount: ${s.amount})`);
    });
}

debugHotStocks();
