# Walkthrough - AIThemaView Quality Upgrade

## 🎯 Goal
Upgrade the application to match the "Tima" app in terms of content quality, data density, and visual relevance.

## 🛠️ Implemented Changes

### 1. Market Leader Indicator (⭐)
- **Problem**: Users couldn't easily distinguish "Mainstream Market Leaders".
- **Solution**: Identified Top 3 High-Volume Themes and added a Gold Star (⭐).

### 2. Score/Volume Toggle
- **Problem**: Users wanted to see both "Score" and "Volume".
- **Solution**: Clickable score area toggles between "Rate Score" and "Total Volume (억)".

### 3. Dip Buying ("Nul-lim-mok") Support
- **Problem**: Large cap stocks correcting (negative rate) were hidden or mislabeled.
- **Solution**:
    - **Prioritized**: Stocks with `Amount >= 300억`.
    - **Included**: Even if Rate < 0 (down to -5%).
    - **Bug Fix**: Fixed negative rate parsing (Blue color).
    - **Logic**: Added "Force Injection" to ensure AI doesn't drop these key stocks.
- **Result**: "Robotiz" (-1.74%, 700억+) is now visible, colored BLUE, and prioritized in the list.

### 4. Volume-Weighted Scoring
- **Formula**: `Sum(Rate * Amount) / Sum(Amount)`

### 5. High Density UI & Noise Filtering
- **UI**: 5-column layout.
- **Filter**: Removed ETFs, SPACs.

## ✅ Verification
- **Visuals**: Confirmed compact layout, Stars, Toggles.
- **Data**: Confirmed correct sign (+/-) and inclusion of high-volume negative stocks.
