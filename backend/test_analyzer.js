const { analyzeThemes } = require('./analyzer');

const mockNews = [
    { title: "삼성전자, HBM 공급 확대 기대감에 상승" },
    { title: "SK하이닉스도 HBM4 개발 박차" },
    { title: "조선주, 신조선가 상승에 동반 강세... 한화오션 급등" },
    { title: "[광고] 무료 급등주 추천 클릭하세요" }, // Should be filtered
    { title: "비트코인 1억 돌파 임박" } // Unrelated to main themes or separate theme
];

async function test() {
    console.log('Testing AI Analysis with Gemini...');
    const themes = await analyzeThemes(mockNews);
    console.log('Result:', JSON.stringify(themes, null, 2));
}

test();
