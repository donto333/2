# 천하: 패왕의 시대 — Steam 출시 가이드

웹 게임(Three.js)을 **Electron 데스크톱 앱**으로 감싸 Windows용 Steam 빌드를 만든다. 게임 코드는 웹 버전과 같은 것을 쓴다.

## 구조

```
desktop/                    Steam 데스크톱 셸 (Electron)
  main.cjs                  창·실행 모드·Steam 업적 IPC
  steam.cjs                 Steamworks 연동 (steamworks.js)
  preload.cjs               게임 화면에 window.CheonharoDesktop 노출
  cheonharo.config.json     온라인 서버 주소·App ID 등 설정
  steam-achievements.json   업적 목록
  build/icon.ico, icon.png  앱 아이콘
src/platform/steam.ts       게임 쪽 업적 판정 (웹에서는 아무 일도 하지 않음)
steam/upload.ps1            SteamPipe 업로드 스크립트
.github/workflows/steam-desktop.yml   Windows 빌드 자동화
```

## 실행 모드

| 모드 | 조건 | 동작 |
|---|---|---|
| 온라인 | 시작할 때 `onlineUrl`의 `/api/health`가 5초 안에 응답 | 기존 Manus 서버 화면을 그대로 연다. Manus 로그인·랭킹·세력전·대련 사용 가능 |
| 오프라인 | 서버 응답 없음, 또는 `--offline` | 설치 폴더에 들어 있는 게임을 연다. 진행도는 PC에 저장 |

- 온라인 화면의 게임 코드는 **서버에 배포된 웹 버전**에서 온다. Steam 업적 코드가 온라인에서도 동작하려면 이 커밋의 웹 버전을 서버에도 다시 배포해야 한다.
- 오프라인 화면은 항상 Steam 빌드에 포함된 코드로 동작하므로 업적이 바로 동작한다.
- F11 또는 Alt+Enter: 전체 화면 전환.

### 설정 바꾸기

설치 폴더(`Cheonha.exe` 옆)의 `cheonharo.config.json`을 고치면 다시 빌드하지 않아도 된다.

```json
{
  "onlineUrl": "https://cheonharo-wv7unoxx.manus.game/",
  "mode": "auto",
  "steamAppId": 480,
  "healthTimeoutMs": 5000,
  "fullscreen": false
}
```

`mode`: `auto`(서버 확인 후 결정) · `offline`(항상 오프라인). 실행 인자 `--offline`, `--online`, `--fullscreen`도 쓸 수 있다.

## 로그인 (기본 브라우저 방식)

Google은 앱 안에 들어 있는 창(Electron)에서의 Google 계정 로그인을 차단한다. 그래서 Steam 앱에서는 로그인만 PC의 기본 브라우저에서 한다.

1. 게임에서 로그인 버튼 → 기본 브라우저(Chrome/Edge)가 열리고 Manus 로그인 화면이 나온다.
2. 로그인을 마치면 브라우저에 "로그인 완료 — 게임 창으로 돌아가세요"가 뜬다.
3. 게임 창이 자동으로 로그인 상태로 새로 고쳐진다.

동작 방식: 데스크톱 앱 로그인 표준(RFC 8252 loopback + PKCE). 브라우저는 5분짜리 1회용 티켓만 앱(127.0.0.1)에 넘기고, 앱만 아는 비밀값이 있어야 티켓을 로그인 상태로 바꿀 수 있다.

- 서버: `server/desktop-auth.mjs` (새 파일), `server/app.mjs`, `server/webdev-adapter.mjs`(OAuth 콜백에 한 줄 연결)
- 앱: `desktop/browser-login.cjs`, `desktop/main.cjs`
- **서버에 이 기능이 배포되기 전**에는 앱이 이를 감지하고 예전처럼 창 안에서 로그인한다(이 경우 Google 로그인은 막힘).
- 웹 버전의 로그인 흐름은 바뀌지 않는다.

## Steam 업적

| 게임 ID | 조건 | 테스트 App ID 480에서 쓰는 이름 |
|---|---|---|
| `FIRST_VICTORY` | 첫 승리 | `ACH_WIN_ONE_GAME` |
| `VETERAN_100` | 100승 | `ACH_WIN_100_GAMES` |
| `RECRUIT_10` | 무장 10명 보유 | `ACH_TRAVEL_FAR_ACCUM` |
| `SCENARIO_FIRST` | 시나리오 첫 클리어 | `ACH_TRAVEL_FAR_SINGLE` |

실제 App ID를 받으면 Steamworks 파트너 사이트 → 업적 설정에서 **왼쪽 열의 게임 ID와 똑같은 API 이름**으로 업적을 등록하고 게시한다. 업적을 늘리려면 `src/platform/steam.ts`의 `earnedAchievements`와 `desktop/steam-achievements.json`을 함께 고친다.

## 빌드

### 자동 (권장): GitHub Actions

`main` 브랜치에 푸시하면 **Steam 데스크톱 빌드 (Windows)** 워크플로가 돈다. Actions 탭에서 수동 실행(Run workflow)도 된다.

1. GitHub 저장소 → **Actions** → 최근 실행 선택
2. 아래쪽 **Artifacts**에서 `cheonha-steam-windows-x64` 다운로드
3. ZIP을 풀면 `Cheonha.exe`가 든 폴더가 나온다. 이 폴더가 Steam에 올릴 내용이다.

### 직접 (Windows PC)

```powershell
corepack enable
pnpm install
pnpm run manus:build-source     # 웹 게임 → dist/
cd desktop
npm install
npm run copy-web                # dist/ → desktop/app/
npm start                       # 개발 실행 (Steam 클라이언트를 켜 두면 업적 시험 가능)
npm run dist:win                # desktop/release/win-unpacked/ 생성
```

## Steam에 올리기

1. **Steamworks 가입·앱 등록**: partner.steamgames.com에서 Steam Direct 등록비를 내고 App ID를 받는다. 기본 Depot ID도 같이 생긴다(보통 App ID + 1).
2. **설정 반영**: `desktop/cheonharo.config.json`의 `steamAppId`를 실제 App ID로 바꾸고 커밋한다(업로드 스크립트도 설치 폴더의 설정을 자동으로 바꿔 준다).
3. **steamcmd 준비**: Steamworks SDK의 `tools/ContentBuilder/builder/steamcmd.exe`를 쓰거나 Valve에서 steamcmd를 받는다.
4. **업로드**:

   ```powershell
   .\steam\upload.ps1 -AppId 1234560 -DepotId 1234561 -Username 내스팀계정 -Content C:\경로\cheonha-steam-windows-x64
   ```

5. **실행 옵션 등록**: Steamworks → 설치 → 일반 → 실행 옵션에 실행 파일 `Cheonha.exe`, 운영체제 Windows를 등록한다.
6. **빌드 적용**: SteamPipe → 빌드에서 올린 빌드를 `beta` 브랜치에 먼저 적용해 시험한 뒤 기본 브랜치에 적용한다.
7. **Steam 클라우드(선택)**: 오프라인 진행도는 `%APPDATA%\cheonharo-desktop\Local Storage`에 저장된다. Steam Auto-Cloud에 이 경로(루트 `WinAppDataRoaming`, 하위 경로 `cheonharo-desktop/Local Storage`, 패턴 `*`)를 등록하면 PC 간에 진행도가 옮겨진다.

## 출시 전 확인할 것

- [ ] 실제 App ID 반영, 업적 등록·게시
- [ ] 온라인 서버(`onlineUrl`)가 Steam 출시 기간 동안 계속 살아 있는지
- [ ] 서버 변경(데스크톱 로그인)을 Manus에 배포하고, Steam 앱에서 기본 브라우저 로그인이 끝까지 되는지
- [ ] 웹 버전을 서버에 다시 배포했는지 (온라인 모드 업적)
- [ ] 스토어 페이지: 캡슐 이미지, 스크린샷 5장 이상, 트레일러, 설명, 연령 등급 설문
- [ ] 결제·가챠 요소가 있으면 Steam 정책(외부 결제 금지, 확률 공개 등)에 맞는지
- [ ] 코드 서명(선택): 서명하지 않은 exe는 Windows SmartScreen 경고가 뜰 수 있다. Steam으로 설치하면 대개 문제없다.
