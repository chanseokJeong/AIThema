# Windows 배포 및 외부 접속 가이드

AI Thema View를 Windows PC에 배포하고, 외부에서 접속하기 위한 설정 가이드입니다.

---

## 목차

1. [사전 준비물](#1-사전-준비물)
2. [Windows 환경 설정](#2-windows-환경-설정)
3. [프로젝트 설치 및 실행](#3-프로젝트-설치-및-실행)
4. [프로덕션 빌드](#4-프로덕션-빌드)
5. [Windows 방화벽 설정](#5-windows-방화벽-설정)
6. [공유기 포트 포워딩](#6-공유기-포트-포워딩)
7. [동적 DNS 설정 (선택)](#7-동적-dns-설정-선택)
8. [자동 시작 설정](#8-자동-시작-설정)
9. [보안 고려사항](#9-보안-고려사항)
10. [문제 해결](#10-문제-해결)

---

## 1. 사전 준비물

| 항목 | 설명 |
|------|------|
| Windows PC | Windows 10/11 권장 |
| Node.js | v18 이상 (LTS 권장) |
| Python | v3.8 이상 (수급 데이터용, 선택) |
| Git | 코드 다운로드용 (선택) |
| Gemini API Key | https://aistudio.google.com/app/apikey |
| 고정 내부 IP | 공유기 설정 필요 |
| 공인 IP | 외부 접속용 (ISP 제공) |

---

## 2. Windows 환경 설정

### 2.1 Node.js 설치

1. https://nodejs.org 에서 LTS 버전 다운로드
2. 설치 파일 실행 후 기본 옵션으로 설치
3. 설치 확인:
   ```cmd
   node --version
   npm --version
   ```

### 2.2 Python 설치 (수급 데이터용 - 선택)

Python은 외국인/기관 순매수 및 공매도 데이터 수집에 사용됩니다.
Python이 없어도 기본 기능은 작동합니다 (네이버 금융 스크래핑 폴백).

1. https://python.org 에서 Python 3.8+ 다운로드
2. 설치 시 **"Add Python to PATH"** 체크 필수
3. 설치 확인:
   ```cmd
   python --version
   ```
4. pykrx 라이브러리 설치:

   **Windows:**
   ```cmd
   cd C:\AIThemaView\backend\python
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```

   **Linux/Mac (가상 환경 필수):**
   ```bash
   cd /path/to/AIThemaView/backend/python
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

   > 최신 Linux(Debian 12+, Ubuntu 23.04+)는 PEP 668 정책으로 가상 환경이 필수입니다.

**수집 가능한 추가 데이터:**
- 외국인/기관/개인 순매수 (당일, 5일 합계)
- 공매도량 및 공매도 비중
- 기본 재무지표 (PER, PBR, 배당수익률)

### 2.3 Git 설치 (선택)

1. https://git-scm.com/download/win 에서 다운로드
2. 기본 옵션으로 설치

### 2.4 프로젝트 다운로드

**Git 사용 시:**
```cmd
git clone <repository-url> C:\AIThemaView
```

**수동 복사 시:**
- 프로젝트 폴더를 원하는 위치에 복사 (예: `C:\AIThemaView`)

---

## 3. 프로젝트 설치 및 실행

### 3.1 환경 변수 설정

```cmd
cd C:\AIThemaView\backend
copy .env.example .env
```

`.env` 파일을 메모장으로 열어 Gemini API 키 입력:
```
GEMINI_API_KEY=your_api_key_here
```

### 3.2 의존성 설치

**백엔드:**
```cmd
cd C:\AIThemaView\backend
npm install
```

**프론트엔드:**
```cmd
cd C:\AIThemaView\frontend
npm install
```

### 3.3 개발 모드 실행

터미널 2개를 열어서 각각 실행:

**터미널 1 - 백엔드:**
```cmd
cd C:\AIThemaView\backend
node server.js
```

**터미널 2 - 프론트엔드:**
```cmd
cd C:\AIThemaView\frontend
npm run dev -- --host
```

> `--host` 옵션은 외부 접속을 허용합니다.

### 3.4 접속 확인

- 로컬: http://localhost:5173
- 내부 네트워크: http://192.168.x.x:5173 (PC의 내부 IP)

---

## 4. 프로덕션 빌드

외부 배포용 정적 파일을 생성합니다.

### 4.1 프론트엔드 빌드

```cmd
cd C:\AIThemaView\frontend
npm run build
```

`dist` 폴더에 정적 파일이 생성됩니다.

### 4.2 Express에서 정적 파일 서빙 (선택)

백엔드 서버에서 프론트엔드도 함께 서빙하려면 `server.js`에 다음 추가:

```javascript
const path = require('path');

// 정적 파일 서빙 (프론트엔드 빌드 파일)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// SPA 라우팅 지원
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    }
});
```

이렇게 하면 **포트 3000 하나로 백엔드 + 프론트엔드 모두 제공** 가능합니다.

---

## 5. Windows 방화벽 설정

외부에서 접속하려면 방화벽에서 포트를 열어야 합니다.

### 5.1 GUI로 설정

1. **Windows 검색** → "방화벽" → **고급 보안이 포함된 Windows Defender 방화벽**
2. 좌측 **인바운드 규칙** 클릭
3. 우측 **새 규칙** 클릭
4. **포트** 선택 → 다음
5. **TCP** 선택, **특정 로컬 포트**: `3000, 5173` 입력 → 다음
6. **연결 허용** → 다음
7. 모든 프로필 체크 (도메인, 개인, 공용) → 다음
8. 이름: `AIThemaView` → 마침

### 5.2 명령어로 설정 (관리자 권한 필요)

```cmd
netsh advfirewall firewall add rule name="AIThemaView Backend" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="AIThemaView Frontend" dir=in action=allow protocol=TCP localport=5173
```

### 5.3 방화벽 규칙 확인

```cmd
netsh advfirewall firewall show rule name="AIThemaView Backend"
netsh advfirewall firewall show rule name="AIThemaView Frontend"
```

---

## 6. 공유기 포트 포워딩

외부 인터넷에서 접속하려면 공유기에서 포트 포워딩 설정이 필요합니다.

### 6.1 PC 내부 IP 고정

1. **설정** → **네트워크 및 인터넷** → **이더넷** (또는 Wi-Fi)
2. **IP 할당** → **편집** → **수동**
3. IPv4 켜기, 다음 정보 입력:
   - IP 주소: `192.168.0.100` (예시, 공유기에 따라 다름)
   - 서브넷 마스크: `255.255.255.0`
   - 게이트웨이: `192.168.0.1` (공유기 주소)
   - DNS: `8.8.8.8` 또는 공유기 주소

### 6.2 공유기 설정 접속

브라우저에서 공유기 관리 페이지 접속:
- 일반적으로 `http://192.168.0.1` 또는 `http://192.168.1.1`
- 공유기 제조사별 기본 주소:
  - ipTIME: `http://192.168.0.1`
  - KT 공유기: `http://172.30.1.254`
  - SKB 공유기: `http://192.168.45.1`
  - LGU+ 공유기: `http://192.168.219.1`

### 6.3 포트 포워딩 설정

공유기 관리자 페이지에서 **포트 포워딩** (또는 **가상 서버**, **NAT/포트 관리**) 메뉴 찾기

| 항목 | 백엔드 | 프론트엔드 (개발) |
|------|--------|-------------------|
| 서비스 이름 | AIThemaView-API | AIThemaView-Web |
| 외부 포트 | 3000 | 5173 |
| 내부 IP | 192.168.0.100 | 192.168.0.100 |
| 내부 포트 | 3000 | 5173 |
| 프로토콜 | TCP | TCP |

> **프로덕션 빌드**를 사용하면 포트 3000만 열면 됩니다.

### 6.4 공인 IP 확인

```cmd
curl ifconfig.me
```

또는 브라우저에서 https://whatismyip.com 접속

### 6.5 외부 접속 테스트

다른 네트워크(모바일 데이터 등)에서:
- `http://공인IP:3000/api/themes` - API 테스트
- `http://공인IP:5173` - 웹 페이지 (개발 모드)
- `http://공인IP:3000` - 웹 페이지 (프로덕션)

---

## 7. 동적 DNS 설정 (선택)

가정용 인터넷은 공인 IP가 변경될 수 있습니다. DDNS를 사용하면 고정 도메인으로 접속 가능합니다.

### 7.1 무료 DDNS 서비스

| 서비스 | 도메인 예시 | 특징 |
|--------|-------------|------|
| No-IP | yourname.ddns.net | 30일마다 확인 필요 |
| Duck DNS | yourname.duckdns.org | 완전 무료 |
| ipTIME DDNS | yourname.iptime.org | ipTIME 공유기 내장 |

### 7.2 Duck DNS 설정 예시

1. https://www.duckdns.org 접속 및 가입
2. 도메인 생성 (예: `mythemaview`)
3. 토큰 복사
4. Windows에서 자동 업데이트 배치 파일 생성:

**duckdns-update.bat:**
```batch
@echo off
curl "https://www.duckdns.org/update?domains=mythemaview&token=YOUR_TOKEN&ip="
```

5. 작업 스케줄러로 5분마다 실행 설정

### 7.3 접속

```
http://mythemaview.duckdns.org:3000
```

---

## 8. 자동 시작 설정

PC 재부팅 시 자동으로 서버가 시작되도록 설정합니다.

### 8.1 배치 파일 생성

**C:\AIThemaView\start-server.bat:**
```batch
@echo off
cd /d C:\AIThemaView\backend
start "AIThemaView Backend" node server.js
```

### 8.2 작업 스케줄러 등록

1. **Windows 검색** → "작업 스케줄러"
2. **작업 만들기** 클릭
3. **일반** 탭:
   - 이름: `AIThemaView Auto Start`
   - "가장 높은 수준의 권한으로 실행" 체크
4. **트리거** 탭 → 새로 만들기:
   - "시작할 때" 선택
5. **동작** 탭 → 새로 만들기:
   - 프로그램/스크립트: `C:\AIThemaView\start-server.bat`
6. **확인** 클릭

### 8.3 PM2 사용 (권장)

Node.js 프로세스 관리자로 더 안정적인 운영이 가능합니다.

```cmd
npm install -g pm2
npm install -g pm2-windows-startup

cd C:\AIThemaView\backend
pm2 start server.js --name "aithemaview"
pm2 save
pm2-startup install
```

**PM2 명령어:**
```cmd
pm2 status          # 상태 확인
pm2 logs            # 로그 보기
pm2 restart all     # 재시작
pm2 stop all        # 중지
```

---

## 9. 보안 고려사항

### 9.1 필수 보안 조치

| 항목 | 설명 | 적용 방법 |
|------|------|-----------|
| API 키 보호 | .env 파일 외부 노출 금지 | .gitignore에 추가 |
| 방화벽 | 필요한 포트만 열기 | 3000, 5173만 허용 |
| Windows 업데이트 | 최신 보안 패치 적용 | 자동 업데이트 활성화 |

### 9.2 추가 보안 권장사항

**HTTPS 적용 (Let's Encrypt):**
- Nginx 또는 Caddy를 리버스 프록시로 사용
- 무료 SSL 인증서 적용 가능

**접속 제한:**
```javascript
// server.js에 IP 화이트리스트 추가 (선택)
const allowedIPs = ['허용할IP1', '허용할IP2'];
app.use((req, res, next) => {
    const clientIP = req.ip;
    if (!allowedIPs.includes(clientIP)) {
        return res.status(403).send('Forbidden');
    }
    next();
});
```

**Rate Limiting:**
```cmd
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100 // 최대 100 요청
});
app.use(limiter);
```

### 9.3 주의사항

- **Gemini API 키**가 포함된 `.env` 파일은 절대 공개 저장소에 올리지 마세요
- 정기적으로 API 키 사용량을 모니터링하세요
- 의심스러운 접속이 있으면 방화벽 규칙을 검토하세요

---

## 10. 문제 해결

### 10.1 서버가 시작되지 않음

```cmd
# 포트 사용 중인지 확인
netstat -ano | findstr :3000

# 프로세스 종료 (PID로)
taskkill /PID 12345 /F
```

### 10.2 외부에서 접속이 안 됨

체크리스트:
1. [ ] 서버가 실행 중인가? (`node server.js`)
2. [ ] Windows 방화벽에서 포트 열렸는가?
3. [ ] 공유기 포트 포워딩 설정했는가?
4. [ ] 내부 IP가 올바른가?
5. [ ] ISP에서 포트 차단하지 않는가? (일부 ISP는 80, 443 외 차단)

### 10.3 방화벽 규칙 삭제

```cmd
netsh advfirewall firewall delete rule name="AIThemaView Backend"
netsh advfirewall firewall delete rule name="AIThemaView Frontend"
```

### 10.4 공인 IP가 자주 변경됨

- DDNS 서비스 사용 (7번 섹션 참조)
- ISP에 고정 IP 신청 (유료)

### 10.5 프론트엔드에서 API 호출 실패

프론트엔드 설정에서 API URL 확인:
```javascript
// 프론트엔드에서 API 호출 시 IP/도메인 확인
const API_URL = 'http://공인IP:3000/api';
```

또는 환경 변수 사용:
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
```

---

## 요약: 최소 설정 체크리스트

외부 접속을 위한 최소 필수 단계:

1. [ ] Node.js 설치
2. [ ] `npm install` (backend, frontend)
3. [ ] `.env` 파일에 Gemini API 키 설정
4. [ ] `npm run build` (프론트엔드)
5. [ ] `node server.js` (백엔드)
6. [ ] Windows 방화벽 포트 3000 열기
7. [ ] 공유기 포트 포워딩 3000 설정
8. [ ] 외부에서 `http://공인IP:3000` 접속 테스트

---

## 참고 링크

- [Node.js 공식 사이트](https://nodejs.org)
- [PM2 문서](https://pm2.keymetrics.io/docs)
- [Duck DNS](https://www.duckdns.org)
- [Let's Encrypt](https://letsencrypt.org)
