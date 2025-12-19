# 개선 계획서

## 문제점 요약
1. ❌ 급등주 데이터 미수집 → 뉴스만 보고 추론
2. ❌ 거래대금 스크래핑 실패 → 모두 0원
3. ❌ 단순 평균 점수 → 거래대금 가중치 없음
4. ❌ 포괄적 테마명 → 구체성 부족
5. ❌ 주도주 발굴 불가 → 연관 종목만 추론

---

## 핵심 개선안 3가지

### ✅ 1단계: 급등주 데이터 수집 추가 (최우선)

**새로운 크롤러 추가: `backend/rising_stocks.js`**

```javascript
// 네이버 금융 "급등주" 섹션 크롤링
// https://finance.naver.com/sise/sise_quant.naver (거래량 상위)
// https://finance.naver.com/sise/sise_rise.naver (상승률 상위)

async function fetchRisingStocks() {
  // 1. 상승률 상위 100개 종목 수집
  // 2. 거래대금 상위 100개 종목 수집
  // 3. 중복 제거 후 등락률 5% 이상 종목만 필터링

  return [
    { name: "코참", code: "123456", rate: 29.98, amount: 553억 },
    { name: "비즈온넥스텍", code: "234567", rate: 20.66, amount: 1797억 },
    ...
  ]
}
```

**데이터 플로우 변경:**
```
[현재] 뉴스 → AI 분석 → 테마 추출 → 종목 추론 → 주가 조회
[개선] 급등주 수집 → 뉴스 매칭 → AI 분석 → 테마 그룹핑
```

### ✅ 2단계: 거래대금 스크래핑 수정

**문제:** 네이버 금융 HTML 구조 변경으로 `$('th')` 셀렉터 실패

**해결책 1: 네이버 금융 API 활용** (추천)
```javascript
// 네이버 금융 시세 API (비공식)
const url = `https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:${code}`;
// JSON 응답으로 거래대금 직접 획득
```

**해결책 2: 다른 소스 활용**
- 다음 금융: 거래대금 스크래핑이 더 쉬움
- 한국거래소 공식 API (KRX API)

### ✅ 3단계: 테마 점수 계산 개선

**현재:**
```javascript
score = Sum(stock.rate) / stock.length
```

**개선 옵션 A: 거래대금 가중평균**
```javascript
totalWeightedRate = Sum(stock.rate × stock.amount)
totalAmount = Sum(stock.amount)
score = totalWeightedRate / totalAmount
```

**개선 옵션 B: 상위 종목 중심** (티마 방식 추정)
```javascript
// 등락률 상위 3종목만 사용
topStocks = stocks.sort((a,b) => b.rate - a.rate).slice(0, 3)
score = Sum(topStocks.rate) / 3
```

---

## 구현 우선순위

### 🔥 1순위: 급등주 데이터 수집
- 효과: 테마 점수 즉시 개선 (4.51 → 20+)
- 난이도: 중
- 예상 시간: 2-3시간

### 🔥 2순위: 거래대금 수정
- 효과: 가중평균 계산 가능
- 난이도: 하
- 예상 시간: 1시간

### 🔥 3순위: 점수 계산 로직 변경
- 효과: 주도주 부각
- 난이도: 하
- 예상 시간: 30분

---

## 예상 결과

**Before (현재):**
```
개별이슈: 4.51 (평균 등락률)
- CJ대한통운: +7.60%
- 삼성물산: +9.35%
```

**After (개선):**
```
개별이슈: 18.76 (상위 종목 가중평균)
- 코참: +29.98% (거래대금 553억)
- 비즈온넥스텍: +20.66% (거래대금 1,797억)
- 비나텍: +19.41% (거래대금 546억)
```

---

## 참고: 티마 앱 분석

**데이터 소스 추정:**
1. 네이버/다음 금융 "급등주" 실시간 데이터
2. 한국거래소(KRX) API
3. 증권사 HTS 데이터 (키움/NH투자증권 등)

**알고리즘 추정:**
```python
1. 급등주 수집 (등락률 5% 이상, 거래대금 상위)
2. 뉴스/공시와 매칭하여 테마 추출
3. 테마별로 상위 5개 종목 선별
4. 거래대금 가중 점수 계산
5. 점수 순 정렬
```
