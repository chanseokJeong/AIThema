import React from 'react';
import { calculateThemeScore } from '../utils/calculation';
import { TrendingUp, TrendingDown, Star, AlertTriangle } from 'lucide-react';

// 분할 테마 정보 배지 컴포넌트
const SplitInfoBadge = ({ splitInfo }) => {
    if (!splitInfo || splitInfo.totalParts <= 1) return null;

    return (
        <span
            className="split-info-badge"
            title={`${splitInfo.originalName} 테마가 ${splitInfo.totalParts}개로 분할됨 (전체 ${splitInfo.totalStocks}종목)`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: '500',
                backgroundColor: 'rgba(255, 215, 0, 0.2)',
                color: '#FFD700',
                border: '1px solid rgba(255, 215, 0, 0.4)',
                marginLeft: '6px'
            }}
        >
            {splitInfo.partNumber}/{splitInfo.totalParts}
        </span>
    );
};

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

// 상한가/하한가 배지 컴포넌트
const LimitBadge = ({ limitType, limitText }) => {
    if (!limitType) return null;

    const isUpper = limitType === 'UPPER';
    const style = {
        backgroundColor: isUpper ? '#FF0000' : '#0066FF',
        color: '#FFFFFF',
        text: limitText || (isUpper ? '상한가' : '하한가')
    };

    return (
        <span
            className={`limit-badge ${isUpper ? 'upper' : 'lower'}`}
            title={style.text}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                backgroundColor: style.backgroundColor,
                color: style.color,
                marginLeft: '4px',
                animation: isUpper ? 'limit-pulse 0.8s ease-in-out infinite' : 'none',
                boxShadow: isUpper ? '0 0 8px rgba(255, 0, 0, 0.6)' : 'none'
            }}
        >
            {isUpper ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {style.text}
        </span>
    );
};

// NXT 시장 배지 컴포넌트 (프리마켓/애프터마켓)
const NxtBadge = ({ marketStatus }) => {
    if (!marketStatus || marketStatus === 'REGULAR' || marketStatus === 'CLOSED') return null;

    const config = {
        PRE_MARKET: {
            label: 'NXT',
            className: 'pre-market',
            title: 'NXT 프리마켓 시세 (08:00~09:00)'
        },
        AFTER_MARKET: {
            label: 'NXT',
            className: 'after-market',
            title: 'NXT 애프터마켓 시세 (15:40~20:00)'
        }
    };

    const statusConfig = config[marketStatus];
    if (!statusConfig) return null;

    return (
        <span
            className={`nxt-badge ${statusConfig.className}`}
            title={statusConfig.title}
        >
            {statusConfig.label}
        </span>
    );
};

// VI(변동성완화장치) 배지 컴포넌트
const VIBadge = ({ viType, viText }) => {
    if (!viType) return null;

    // VI 타입에 따른 스타일
    const getViStyle = (type) => {
        switch (type) {
            case 'STATIC':
                return {
                    backgroundColor: '#FF4444',
                    color: '#FFFFFF',
                    text: viText || '정적VI'
                };
            case 'DYNAMIC':
                return {
                    backgroundColor: '#FF8800',
                    color: '#FFFFFF',
                    text: viText || '동적VI'
                };
            case 'HALT':
                return {
                    backgroundColor: '#8B0000',
                    color: '#FFFFFF',
                    text: viText || '거래정지'
                };
            default:
                return {
                    backgroundColor: '#FF6600',
                    color: '#FFFFFF',
                    text: 'VI'
                };
        }
    };

    const style = getViStyle(viType);

    return (
        <span
            className="vi-badge"
            title={`${style.text} 발동 중 - 2분간 단일가 매매`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                backgroundColor: style.backgroundColor,
                color: style.color,
                marginLeft: '4px',
                animation: 'vi-pulse 1s ease-in-out infinite'
            }}
        >
            <AlertTriangle size={10} />
            {style.text}
        </span>
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
                        <SplitInfoBadge splitInfo={theme.splitInfo} />
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
                        <div
                            key={`${stock.name}-${stock.code || index}`}
                            className={`stock-item ${stock.isVI ? 'vi-active' : ''} ${stock.isLimit ? 'limit-active' : ''}`}
                            style={
                                stock.isVI ? {
                                    border: '2px solid #FF4444',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                                    padding: '8px',
                                    marginBottom: '6px'
                                } : stock.isLimit ? {
                                    border: `2px solid ${stock.limitType === 'UPPER' ? '#FF0000' : '#0066FF'}`,
                                    borderRadius: '6px',
                                    backgroundColor: stock.limitType === 'UPPER' ? 'rgba(255, 0, 0, 0.15)' : 'rgba(0, 102, 255, 0.15)',
                                    padding: '8px',
                                    marginBottom: '6px',
                                    boxShadow: stock.limitType === 'UPPER' ? '0 0 12px rgba(255, 0, 0, 0.4)' : 'none'
                                } : {}
                            }
                        >
                            <div className="stock-row top-row">
                                <span className="stock-name">
                                    {stock.name}
                                    {stock.marketStatus && <NxtBadge marketStatus={stock.marketStatus} />}
                                    {stock.isLimit && <LimitBadge limitType={stock.limitType} limitText={stock.limitText} />}
                                    {stock.isVI && <VIBadge viType={stock.viType} viText={stock.viText} />}
                                    {isHotStock && !stock.isVI && !stock.isLimit && <span style={{ marginLeft: '4px', color: '#ffcc00' }}>🔥</span>}
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
