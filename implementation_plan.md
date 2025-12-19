# Implementation Plan - Stock Noise Filtering & Theme Polish

## Goal
Improve the quality of the theme view by removing non-equity instruments (ETFs, ETNs, SPACs, Preferred Stocks) and refining theme names to be more concise, matching the "Tima" app style.

## User Review Required
> [!NOTE]
> This change will strictly filter out stocks containing keywords like "ETF", "ETN", "스팩", "우", "우B", "TIGER", "KODEX", "SOL", "KBSTAR". If there is a legitimate company name containing these (highly unlikely), it might be hidden.

## Proposed Changes

### Backend

#### [MODIFY] [market.js](file:///d:/AIThemaView/backend/market.js)
- Add `isNoiseStock(name)` helper function.
- Filter `hotStocks` list before passing it to the analyzer.
- **Keywords to exclude**: `스팩`, `제\d+호`, `우`, `우B`, `ETF`, `ETN`, `TIGER`, `KODEX`, `SOL`, `KBSTAR`, `ACE`, `HANARO`.

#### [MODIFY] [analyzer.js](file:///d:/AIThemaView/backend/analyzer.js)
- Update System Prompt:
    - Explicitly forbid creating themes based on stock types (e.g., "SPAC Theme", "Preferred Stock Theme").
    - Enforce "Industry/Sector" based grouping.
    - Request concise, single-word or short-phrase theme names (e.g., "로봇" instead of "로봇 및 자동화").

## Verification Plan

### Automated Tests
- None (Visual verification required).

### Manual Verification
1. Restart the backend server.
2. Visit `http://localhost:5173`.
3. Verify that:
    - No "TIGER...", "KODEX..." stocks appear in the cards.
    - No "스팩" or "우선주" themes appear.
    - Theme names are short and clean (e.g., "원자력", "반도체").
