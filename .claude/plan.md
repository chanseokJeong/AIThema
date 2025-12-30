# 테마 분류 정확도 개선 통합 구현 계획

## 목표
티마 앱처럼 정확한 테마-종목 매핑과 주도주 선정을 위한 4가지 개선안 통합 구현

---

## Phase 1: 테마 정의 확장 (우선순위: 높음)

### 1.1 sector_analyzer.js 수정
- **현재**: 9개 테마 (로봇, 바이오, 2차전지, 반도체, 조선, 원자력, 자동차, 건설, 방산)
- **추가**: 6개 테마
  - `항공` - 대한항공, 아시아나항공, 제주항공, 진에어, 티웨이항공, 에어부산
  - `AI/소프트웨어` - 솔트룩스, 셀바스AI, 마인즈랩, 네이버, 카카오
  - `화장품` - 아모레퍼시픽, LG생활건강, 코스맥스, 클리오
  - `게임` - 크래프톤, 엔씨소프트, 넷마블, 펄어비스, 위메이드
  - `엔터/미디어` - 하이브, JYP, SM, CJ ENM, 스튜디오드래곤
  - `금융/증권` - 삼성증권, 키움증권, 미래에셋증권, KB금융

### 1.2 analyzer.js 수정
- `generateThemesFromHotStocks()` 내부의 중복 THEME_SECTORS 제거
- `sector_analyzer.js`에서 import하여 단일 소스로 관리

### 1.3 sector_crawler.js 수정
- SECTOR_CODES에 새 테마의 업종 코드 추가
  - 항공: 045 (운수장비)
  - AI/소프트웨어: 229, 280 (IT서비스, 소프트웨어)
  - 화장품: 263
  - 게임: 281
  - 금융/증권: 093, 094, 095

---

## Phase 2: 별점 대상 필터링 (우선순위: 높음)

### 2.1 server.js 수정
- `calculateStarRating()` 함수 시작 부분에 필터 추가
- "개별이슈", "기타" 테마는 별점 0 반환

```javascript
const STAR_EXCLUDED_THEMES = ['개별이슈', '기타'];

function calculateStarRating(theme) {
    // 별점 비대상 테마 필터링
    if (STAR_EXCLUDED_THEMES.some(excluded => theme.name.includes(excluded))) {
        return { stars: 0, reason: '별점 비대상 테마' };
    }
    // ... 기존 로직
}
```

---

## Phase 3: 네이버 금융 테마 페이지 크롤링 (우선순위: 중간)

### 3.1 theme_crawler.js 신규 생성
- `fetchThemeList()` - 테마 목록 수집
- `fetchThemeStocks(themeCode)` - 테마별 종목 수집
- `fetchTopThemesWithStocks(topN)` - 상위 N개 테마 + 종목 통합 수집

### 3.2 server.js 통합
- `updateThemes()`에 네이버 테마 데이터 병합 로직 추가
- 기존 THEME_SECTORS에 없는 테마도 동적으로 인식

---

## Phase 4: AI 프롬프트 개선 (우선순위: 중간)

### 4.1 analyzer.js 프롬프트 수정
- 테마 개수 목표: 6-8개 -> 10-15개
- 새 테마 카테고리 명시 (항공, AI, 화장품 등)
- 서브테마 허용 (반도체-HBM 등)
- "개별이슈" 사용 조건 명확화 (최후의 수단)
- 종목 수 유연화 (5개 고정 -> 3-5개)

---

## 구현 순서

```
1. Phase 2 (별점 필터링) - 가장 간단, 즉시 효과
2. Phase 1 (테마 확장) - 핵심 기능
3. Phase 4 (AI 프롬프트) - Phase 1과 함께
4. Phase 3 (네이버 테마) - 신규 기능, 마지막
```

---

## 수정 대상 파일

| 파일 | 작업 | Phase |
|------|------|-------|
| `backend/server.js` | calculateStarRating() 필터 추가 | 2 |
| `backend/sector_analyzer.js` | THEME_SECTORS 확장 | 1 |
| `backend/analyzer.js` | import 변경 + 프롬프트 개선 | 1, 4 |
| `backend/sector_crawler.js` | SECTOR_CODES 추가 | 1 |
| `backend/theme_crawler.js` | 신규 생성 | 3 |

---

## 테스트 방법

### Phase 1 테스트
```bash
node -e "const { THEME_SECTORS } = require('./sector_analyzer'); console.log(Object.keys(THEME_SECTORS));"
```

### Phase 2 테스트
- 서버 실행 후 `/api/themes` 확인
- "개별이슈", "기타" 테마의 stars=0 확인

### Phase 3 테스트
```bash
node -e "const t = require('./theme_crawler'); t.fetchThemeList().then(console.log);"
```

### Phase 4 테스트
```bash
node test_analyzer.js
# 10개 이상 테마 생성 확인
```

---

## 예상 효과

- 테마 커버리지: 60-65% -> 85-90%
- "개별이슈" 테마 별점 제거로 주도주 정확도 향상
- 티마와 유사한 테마 선정 결과 기대
