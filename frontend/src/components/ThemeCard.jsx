import React from 'react';
import { calculateThemeScore } from '../utils/calculation';
import { TrendingUp, TrendingDown, Star } from 'lucide-react';

// 별 등급 컴포넌트
const StarRating = ({ stars, reason }) => {
    if (!stars || stars === 0) return null;

    // 별 개수에 따른 색상
    const getStarColor = (starCount) => {
        switch (starCount) {
            case 3: return '#FF6B6B'; // 빨강 (최강 주도주)
            case 2: return '#FFD700'; // 금색 (강한 테마)
            case 1: return '#90EE90'; // 연두 (주목)
            default: return '#FFD700';
        }
    };

    const color = getStarColor(stars);

    return (
        <div
            className="star-rating"
            title={reason || '주도주'}
            style={{ display: 'flex', alignItems: 'center', gap: '1px' }}
        >
            {Array.from({ length: stars }).map((_, i) => (
                <Star key={i} size={14} fill={color} color={color} />
            ))}
        </div>
    );
};

const ThemeCard = ({ theme, showScore, onToggleDisplay }) => {
    // Use the score from backend if available, otherwise calculate
    const score = theme.score ? theme.score.toFixed(2) : calculateThemeScore(theme.stocks);
    const isPositive = parseFloat(score) >= 0;

    // Calculate max amount in this theme for relative bar sizing
    const maxAmount = Math.max(...theme.stocks.map(s => s.amount || 0), 1);
    // Calculate max rate in this theme for secondary indicator
    const maxRate = Math.max(...theme.stocks.map(s => Math.abs(s.rate) || 0), 1);

    // Display Value: Score or Total Volume (억 단위)
    const displayValue = showScore
        ? score
        : `${(theme.totalVolume || 0).toLocaleString()}억`;

    return (
        <div className="theme-card">
            <div className="card-header">
                <div className="header-top">
                    <div className="theme-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <StarRating stars={theme.stars} reason={theme.starReason} />
                        <h3 className="theme-name">{theme.name}</h3>
                    </div>
                    <div
                        className={`theme-score ${isPositive ? 'positive' : 'negative'}`}
                        onClick={onToggleDisplay}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        title={showScore ? "클릭하여 거래대금 보기" : "클릭하여 등락률 보기"}
                    >
                        {displayValue}
                    </div>
                </div>
                {theme.headline && (
                    <div className="theme-headline">
                        {theme.headline}
                    </div>
                )}
            </div>
            <div className="stock-list">
                {theme.stocks.map((stock, index) => {
                    // Bar width based on relative amount (거래대금 기준)
                    const amountBarWidth = Math.min((stock.amount || 0) / maxAmount * 100, 100);
                    // Secondary: Rate-based bar (OR 급등주 표시)
                    const rateBarWidth = Math.min(Math.abs(stock.rate || 0) / maxRate * 100, 100);
                    const isStockPositive = (stock.rate || 0) >= 0;
                    // Is this stock a "급등주"? (Rate > 10% OR top amount)
                    const isHotStock = Math.abs(stock.rate || 0) >= 10 || (stock.amount || 0) >= maxAmount * 0.8;

                    return (
                        <div key={`${stock.name}-${stock.code || index}`} className="stock-item">
                            <div className="stock-row top-row">
                                <span className="stock-name">
                                    {stock.name}
                                    {isHotStock && <span style={{ marginLeft: '4px', color: '#ffcc00' }}>🔥</span>}
                                </span>
                                <span className={`stock-rate ${stock.rate >= 0 ? 'positive' : 'negative'}`}>
                                    {stock.rate > 0 ? '+' : ''}{stock.rate.toFixed(2)}%
                                </span>
                            </div>
                            <div className="stock-row bottom-row">
                                <span className="stock-price">{stock.price ? stock.price.toLocaleString() : '-'}</span>
                                <span className="stock-time">{stock.time || ''}</span>
                                <span className="stock-amount">{stock.amount ? `${stock.amount.toLocaleString()}억` : ''}</span>
                            </div>
                            {/* Rate Bar (거래대금 기준, 테마 내 상대비교) */}
                            <div style={{
                                width: '100%',
                                height: '10px',
                                backgroundColor: '#333',
                                borderRadius: '3px',
                                marginTop: '8px',
                                overflow: 'hidden',
                                position: 'relative'
                            }}>
                                {/* 거래대금 바 (메인) */}
                                <div style={{
                                    width: `${amountBarWidth}%`,
                                    height: '100%',
                                    background: isStockPositive
                                        ? 'linear-gradient(90deg, #ff4d4d 0%, #ff6b6b 100%)'
                                        : 'linear-gradient(90deg, #4d79ff 0%, #6b8cff 100%)',
                                    borderRadius: '3px',
                                    position: 'absolute',
                                    left: 0,
                                    top: 0
                                }}></div>
                                {/* 등락률 인디케이터 (보조 - 세로선) */}
                                <div style={{
                                    width: '3px',
                                    height: '100%',
                                    backgroundColor: '#fff',
                                    position: 'absolute',
                                    left: `${rateBarWidth}%`,
                                    top: 0,
                                    opacity: 0.7,
                                    borderRadius: '1px'
                                }}></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ThemeCard;
