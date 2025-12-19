const { fetchNews } = require('./crawler');

async function test() {
    console.log('Fetching news...');
    const news = await fetchNews();
    console.log('News fetched:', news.length);
    if (news.length > 0) {
        console.log('First 3 items:');
        console.log(news.slice(0, 3));
    }
}

test();
