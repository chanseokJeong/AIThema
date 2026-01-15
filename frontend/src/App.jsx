import React, { useState, useEffect, useRef } from 'react';
import ThemeCard from './components/ThemeCard';
import MarketStatusBadge from './components/MarketStatusBadge';

function App() {
  const [themes, setThemes] = useState([]);
  const [showScore, setShowScore] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [marketStatus, setMarketStatus] = useState('CLOSED');
  const [lastUpdated, setLastUpdated] = useState(null);
  const lastVersionRef = useRef(0);

  useEffect(() => {
    const fetchData = () => {
      fetch('/api/themes')
        .then((res) => res.json())
        .then((data) => {
          // 새 API 형식: { themes: [], lastUpdated: number, version: number, marketStatus: string }
          const themesData = data.themes || data; // 이전 형식 호환
          const newVersion = data.version || Date.now();

          // 시장 상태 업데이트
          if (data.marketStatus) {
            setMarketStatus(data.marketStatus);
          }
          if (data.lastUpdated) {
            setLastUpdated(data.lastUpdated);
          }

          // 버전이 변경되었으면 테마 완전 갱신 (이전 상태 무시)
          if (newVersion !== lastVersionRef.current) {
            lastVersionRef.current = newVersion;
            setDataVersion(newVersion);
            // 테마 배열을 완전히 새로 설정 (React가 모든 항목을 새로 렌더링하도록)
            setThemes([...themesData]);
          } else {
            // 같은 버전 내에서의 업데이트 (가격 갱신 등)
            setThemes([...themesData]);
          }
        })
        .catch((err) => console.error('Failed to fetch themes:', err));
    };

    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 10000); // Poll every 10s

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-main">
          <h1>AI Thema View</h1>
          <MarketStatusBadge status={marketStatus} lastUpdated={lastUpdated} />
        </div>
        <p>Real-time Market Theme Strength Index</p>
      </header>
      <div className="theme-grid">
        {themes.map((theme, index) => (
          <ThemeCard
            key={`${theme.id || theme.name}-${dataVersion}-${index}`}
            theme={theme}
            showScore={showScore}
            onToggleDisplay={() => setShowScore(!showScore)}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
