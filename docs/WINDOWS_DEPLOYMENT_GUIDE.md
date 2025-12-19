# AIThemaView Windows 배포 가이드 (.exe)

이 문서는 AIThemaView를 Windows 실행 파일(.exe)로 배포하는 방법을 설명합니다.

---

## 📋 개요

AIThemaView는 **Node.js 백엔드 + React 프론트엔드** 구조입니다.  
배포 방법은 크게 2가지가 있습니다:

| 방법 | 장점 | 단점 |
|------|------|------|
| **Electron** | 완전한 데스크톱 앱, 자체 브라우저 포함 | 파일 크기 큼 (~150MB+) |
| **pkg + 브라우저** | 가벼움 (~50MB), 시스템 브라우저 사용 | 별도 브라우저 필요 |

**권장: Electron** (사용자 경험이 더 좋음)

---

## 🛠️ 방법 1: Electron (권장)

### 1.1 Electron 설치

```bash
cd d:\AIThemaView
npm init -y
npm install electron electron-builder --save-dev
```

### 1.2 메인 프로세스 파일 생성

`d:\AIThemaView\main.js` 파일 생성:

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'assets/icon.ico')
    });

    // 프론트엔드 로드 (빌드된 정적 파일)
    mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (backendProcess) backendProcess.kill();
    });
}

function startBackend() {
    // 백엔드 서버 시작
    const serverPath = path.join(__dirname, 'backend/server.js');
    backendProcess = spawn('node', [serverPath], {
        env: { ...process.env, PORT: 3000 }
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`Backend Error: ${data}`);
    });
}

app.whenReady().then(() => {
    startBackend();
    // 백엔드 시작 대기 (3초)
    setTimeout(createWindow, 3000);
});

app.on('window-all-closed', () => {
    if (backendProcess) backendProcess.kill();
    app.quit();
});
```

### 1.3 package.json 수정

```json
{
  "name": "aithemaview",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "npm run build:frontend && electron-builder",
    "build:frontend": "cd frontend && npm run build"
  },
  "build": {
    "appId": "com.aithemaview.app",
    "productName": "AI Thema View",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "main.js",
      "backend/**/*",
      "frontend/dist/**/*",
      "!**/node_modules/.cache/**"
    ],
    "extraResources": [
      {
        "from": ".env",
        "to": ".env"
      }
    ],
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

### 1.4 프론트엔드 빌드 설정

`frontend/vite.config.js` 수정:

```javascript
export default {
  base: './',  // 상대 경로로 변경 (중요!)
  build: {
    outDir: 'dist'
  }
}
```

### 1.5 빌드 및 배포

```bash
# 1. 프론트엔드 빌드
cd frontend
npm run build

# 2. Electron 앱 빌드
cd ..
npm run build
```

**결과물**: `dist-electron/AI Thema View Setup.exe`

---

## 🛠️ 방법 2: pkg (가벼운 배포)

### 2.1 pkg 설치

```bash
npm install -g pkg
```

### 2.2 백엔드를 단일 exe로 패키징

```bash
cd d:\AIThemaView\backend
pkg server.js --targets node18-win-x64 --output AIThemaView-Server.exe
```

### 2.3 배포 구조

```
AIThemaView/
├── AIThemaView-Server.exe  (백엔드)
├── frontend/dist/          (프론트엔드 정적 파일)
├── .env                    (환경 변수)
└── start.bat               (실행 스크립트)
```

### 2.4 start.bat 생성

```batch
@echo off
start AIThemaView-Server.exe
timeout /t 3
start "" "http://localhost:3000"
```

---

## 🔐 환경 변수 (.env) 처리

### 옵션 A: 외부 .env 파일 (권장)
- `.env` 파일을 실행 파일과 같은 폴더에 배치
- 사용자가 API 키 직접 입력 가능

### 옵션 B: 빌드 시 환경 변수 포함
```javascript
// server.js 수정
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_DEFAULT_KEY';
```

> ⚠️ **주의**: API 키를 exe에 하드코딩하면 보안 위험이 있습니다.

### 옵션 C: 첫 실행 시 사용자 입력
- 앱 첫 실행 시 Gemini API 키 입력 다이얼로그 표시
- 입력된 키를 로컬 설정 파일에 저장

---

## 📦 배포 체크리스트

- [ ] 프론트엔드 빌드 완료 (`npm run build`)
- [ ] 백엔드 의존성 포함 (`node_modules`)
- [ ] `.env` 파일 또는 환경 변수 설정 방법 안내
- [ ] 아이콘 파일 준비 (`assets/icon.ico`)
- [ ] 설치 프로그램 테스트
- [ ] Windows Defender 예외 등록 안내 (필요시)

---

## 🚀 빠른 시작 (Electron)

```bash
# 1. 의존성 설치
cd d:\AIThemaView
npm install electron electron-builder --save-dev

# 2. 프론트엔드 빌드
cd frontend
npm run build
cd ..

# 3. Electron 앱 빌드
npx electron-builder --win

# 결과: dist-electron 폴더에 설치 파일 생성
```

---

## 📝 참고 사항

1. **파일 크기**: Electron 앱은 약 150-200MB, pkg는 약 50MB
2. **자동 업데이트**: `electron-updater` 패키지로 구현 가능
3. **코드 서명**: Windows SmartScreen 경고를 피하려면 코드 서명 필요 (유료)
4. **포터블 버전**: NSIS 대신 `portable` 타겟 사용 가능

문의사항이 있으시면 말씀해 주세요!
