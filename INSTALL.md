# 천하: 패왕의 시대 설치 패키지

이 패키지는 게임 소스, Three.js/Rapier 런타임, 서버 인증 코드, Manus 클라이언트 접속기, 관리자 API, 정적 빌드 결과와 게임 자산을 포함한 프로젝트 스냅샷입니다.

## 포함된 핵심 파일

- `src/`: 게임 로직과 UI
- `public/`: 전장·무장·부대 이미지 자산
- `server/`: 인증 서버, 관리자 API, DB 마이그레이션
- `manus-auth.js`: Manus 로그인 클라이언트 접속기
- `leaderboard.js`: 랭킹 클라이언트 접속기
- `dist/`: 프로덕션 정적 빌드
- `scripts/`: 개발 서버·빌드·스모크 테스트
- `package.json`, `pnpm-lock.yaml`: 잠금된 의존성 목록

`node_modules/`, `.git/`, 테스트 캡처와 캐시는 배포 ZIP에서 제외했습니다. 설치 시 `install.sh`가 잠금 파일을 기준으로 의존성을 재설치합니다.

## 설치

```bash
chmod +x install.sh
./install.sh
```

## 정적 게임 실행

```bash
pnpm preview --host 0.0.0.0 --port 4173
```

## 로그인·관리자 기능 포함 실행

`.env.example`을 `.env`로 복사하고 실제 WebDev/Manus 런타임 값을 입력한 뒤 실행합니다. 비밀키는 소스나 ZIP에 넣지 마세요.

```bash
cp .env.example .env
pnpm dev
```

서버와 Vite가 함께 시작되며, 기본 포트는 `3000`입니다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

현재 패키지 기준 테스트는 39개입니다.

## Windows EXE 접속기

`cheonharo-standalone.exe`는 게임의 `dist/` 빌드를 EXE 내부에 포함한 Windows x64 포터블 접속기입니다. 실행하면 로컬 `127.0.0.1` 서버를 임시로 열고 기본 브라우저에서 게임을 실행하므로 만료되는 미리보기 URL에 의존하지 않습니다.

이 독립형 모드에서는 게임 플레이가 로컬로 동작합니다. Manus OAuth 로그인·관리자 API 같은 온라인 기능은 서버 환경이 필요하므로 WebDev 배포 주소에서 사용합니다.

온라인 모드 배포 주소(게시 후): `https://cheonharo2-acvypfni.manus.game/`

새 EXE는 실행 시 온라인 서버를 먼저 확인합니다. 서버가 살아 있으면 온라인 모드로 열고, 연결할 수 없으면 자동으로 로컬 오프라인 모드로 전환합니다. 강제로 선택할 수도 있습니다.

```bat
cheonharo-standalone.exe --online
cheonharo-standalone.exe --offline
```

다른 배포 주소를 열려면 명령 프롬프트에서 다음처럼 실행합니다.

```bat
cheonharo-standalone.exe --port=4173
```
