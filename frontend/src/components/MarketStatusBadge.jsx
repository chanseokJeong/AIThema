import React from 'react';
import { Clock, Sun, Moon, Coffee, Zap } from 'lucide-react';

/**
 * 시장 상태 표시 배지
 * - PRE_MARKET: NXT 프리마켓 (08:00~09:00)
 * - REGULAR: 정규장 (09:00~15:30)
 * - AFTER_MARKET: NXT 애프터마켓 (15:40~20:00)
 * - CLOSED: 장 마감
 */
const MarketStatusBadge = ({ status, lastUpdated }) => {
    // 상태별 스타일 및 텍스트 정의
    const getStatusConfig = (marketStatus) => {
        switch (marketStatus) {
            case 'PRE_MARKET':
                return {
                    label: 'NXT 프리마켓',
                    sublabel: '08:00~09:00',
                    icon: Sun,
                    backgroundColor: '#FF9500',
                    color: '#FFFFFF',
                    glowColor: 'rgba(255, 149, 0, 0.4)',
                    isActive: true,
                    description: 'NXT 대체거래소 프리마켓 거래 중'
                };
            case 'REGULAR':
                return {
                    label: '정규장',
                    sublabel: '09:00~15:30',
                    icon: Zap,
                    backgroundColor: '#34C759',
                    color: '#FFFFFF',
                    glowColor: 'rgba(52, 199, 89, 0.4)',
                    isActive: true,
                    description: 'KRX 정규장 + NXT 메인마켓 거래 중'
                };
            case 'AFTER_MARKET':
                return {
                    label: 'NXT 애프터마켓',
                    sublabel: '15:40~20:00',
                    icon: Moon,
                    backgroundColor: '#5856D6',
                    color: '#FFFFFF',
                    glowColor: 'rgba(88, 86, 214, 0.4)',
                    isActive: true,
                    description: 'NXT 대체거래소 애프터마켓 거래 중'
                };
            case 'CLOSED':
            default:
                return {
                    label: '장 마감',
                    sublabel: '',
                    icon: Coffee,
                    backgroundColor: '#8E8E93',
                    color: '#FFFFFF',
                    glowColor: 'none',
                    isActive: false,
                    description: '거래 종료'
                };
        }
    };

    const config = getStatusConfig(status);
    const Icon = config.icon;

    // 마지막 업데이트 시간 포맷
    const formatLastUpdated = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <div
            className="market-status-badge"
            title={config.description}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '20px',
                backgroundColor: config.backgroundColor,
                color: config.color,
                fontSize: '13px',
                fontWeight: '600',
                boxShadow: config.isActive ? `0 0 12px ${config.glowColor}` : 'none',
                animation: config.isActive ? 'status-pulse 2s ease-in-out infinite' : 'none',
                cursor: 'default'
            }}
        >
            <Icon size={16} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{config.label}</span>
                {config.sublabel && (
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>{config.sublabel}</span>
                )}
            </div>
            {lastUpdated && (
                <span
                    style={{
                        fontSize: '10px',
                        opacity: 0.7,
                        marginLeft: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                    }}
                >
                    <Clock size={10} />
                    {formatLastUpdated(lastUpdated)}
                </span>
            )}
        </div>
    );
};

export default MarketStatusBadge;
