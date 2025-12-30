# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요


** 설계나 코딩을 하게 될때는 무조건 ultrathink를 한다. **

**AI Thema View (AI 테마 뷰)** - 주식 시장 "테마 강도 지수"를 시각화하는 로컬 스탠드얼론 웹 애플리케이션:
1. 한국 금융 뉴스 크롤링 (네이버 금융)
2. AI를 사용한 테마 분석 (Google Gemini)
3. 실시간 주가 데이터 수집
4. 주가 성과 기반 테마 점수 계산 및 표시

**기술 스택**: Node.js/Express 백엔드 + React/Vite 프론트엔드

## 개발 명령어

### 백엔드 (Express API 서버)
```bash
cd backend
node server.js                # 포트 3000에서 서버 시작
node test_crawler.js          # 뉴스 크롤러 테스트
node test_analyzer.js         # AI 테마 분석 테스트
node test_market.js           # 시장 데이터 수집 테스트
node list_models.js           # 사용 가능한 Gemini 모델 목록
```

### 프론트엔드 (React/Vite)
```bash
cd frontend

npm run dev                   # 개발 서버 시작 (기본: http://localhost:5173)
npm run build                 # 프로덕션 빌드
npm run preview               # 프로덕션 빌드 미리보기
npm run lint                  # ESLint 실행
```

### 환경 설정
- `backend/.env.example`을 `backend/.env`로 복사
- https://aistudio.google.com/app/apikey 에서 `GEMINI_API_KEY` 발급 후 추가
- KIS API 키는 문서화되어 있으나 현재 사용되지 않음

## 아키텍처

### 데이터 흐름
```
뉴스 크롤러 → AI 분석기 → 테마 캐시 → 가격 업데이터 → 프론트엔드
```

**2개의 업데이트 루프**:
1. **테마 루프** (5분마다): `crawler.js` → `analyzer.js` → 테마 캐시
2. **가격 루프** (10초마다): `market.js` → 실시간 가격으로 테마 보강 → 점수 계산

### 백엔드 컴포넌트

**server.js** (`backend/server.js`)
- CORS가 활성화된 Express 서버
- 2개의 독립적인 업데이트 루프 관리
- `/api/themes` 엔드포인트 제공
- 타임스탬프와 함께 분석된 테마 캐싱

**crawler.js** (`backend/crawler.js:108`)
- 네이버 금융 "특징주"와 속보 섹션에서 뉴스 수집
- EUC-KR 인코딩 처리를 위해 `axios` + `cheerio` + `iconv-lite` 사용
- 정규화된 제목으로 중복 제거
- 반환 형식: `[{source, title, link}, ...]`

**analyzer.js** (`backend/analyzer.js:7`)
- Google Gemini (`gemini-2.0-flash` 모델) 사용
- 테마 추출을 위한 상세한 프롬프트와 함께 뉴스 헤드라인 전송
- Rate Limit 처리를 위한 지수 백오프 구현
- 실패 시 목 데이터로 폴백
- 반환 형식: `[{id, name, headline, stocks: [...]}, ...]`

**market.js** (`backend/market.js:168`)
- 네이버 금융 종목 페이지 스크래핑:
  - Rate (등락률): 변화율 퍼센티지
  - Amount (거래대금): 거래량
- 종목명→코드 조회를 위한 `stockCodeMap` 유지
- 미등록 종목은 네이버 검색을 통한 동적 코드 조회
- 반환 형식: `[{name, rate, amount}, ...]`

### 프론트엔드 컴포넌트

**App.jsx** (`frontend/src/App.jsx`)
- 10초마다 `/api/themes` 조회
- 그리드 레이아웃으로 테마 카드 렌더링
- 단순 폴링 아키텍처 (WebSocket 없음)

**ThemeCard.jsx** (`frontend/src/components/ThemeCard.jsx`)
- 테마명, 점수, 헤드라인, 종목 목록 표시
- 색상 코드 점수 배지 (빨강/초록/회색)
- 개별 종목 등락률 및 거래대금 표시

### 주요 기술 세부사항

**한글 인코딩**: 네이버 금융은 EUC-KR 인코딩 사용, `iconv-lite`로 처리

**테마 점수 계산** (`server.js:64-65`):
```javascript
score = Sum(stock.rate) / stock.length
```

**AI 프롬프트 전략** (`analyzer.js:18-52`):
- "특징주" 뉴스 우선 처리
- 일반 시장/정치 뉴스 제외
- **중요**: AI는 테마당 4-5개의 연관 종목을 추론해야 함 (예: HBM 뉴스에 삼성전자만 언급되어도 SK하이닉스, 장비업체 등 포함)
- JSON만 반환

**종목 코드 해결** (`market.js:43-87`):
- 먼저 하드코딩된 `stockCodeMap` 확인
- 다음 런타임 `dynamicCodeCache` 확인
- 마지막으로 네이버 금융 검색 후 URL에서 추출

**에러 처리**:
- 모든 모듈은 폴백 제공 (목 데이터, 0 값)
- 크롤러/AI 실패해도 서버는 계속 동작
- Rate Limit은 지수 백오프로 처리

## 일반적인 패턴

**하드코딩된 맵에 새 종목 추가**: `backend/market.js`의 `stockCodeMap` 객체 수정

**업데이트 간격 변경**: `backend/server.js:88-89`의 상수 수정

**AI 동작 조정**: `backend/analyzer.js:18-52`의 프롬프트 수정

**뉴스 소스 추가**: `crawler.js`에 새 fetch 함수 생성 후 112번 줄의 `Promise.all`에 추가
