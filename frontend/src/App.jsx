import React, { useState, useEffect } from 'react';
import ThemeCard from './components/ThemeCard';

function App() {
  const [themes, setThemes] = useState([]);
  const [showScore, setShowScore] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      fetch('/api/themes')
        .then((res) => res.json())
        .then((data) => setThemes(data))
        .catch((err) => console.error('Failed to fetch themes:', err));
    };

    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 10000); // Poll every 10s

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>AI Thema View</h1>
        <p>Real-time Market Theme Strength Index</p>
      </header>
      <div className="theme-grid">
        {themes.map((theme) => (
          <ThemeCard
            key={theme.id}
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
