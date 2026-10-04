# GnuNae maintenance run

- 일시 / 하네스 / host / OS: 2026-10-04T13:31:00Z / Antigravity / macOS (darwin-arm64)
- 기준 origin/main SHA / 작업 HEAD SHA / branch: `f4ae5e5` / `84733ec` / `maintenance/auto-weekly` -> `main`
- Node/npm 버전 / preflight 결과: Node v22.23.2, npm v10.9.8 / Preflight passed (Node 22 engine aligned)
- 확인한 issue / 기존 PR / workflow run:
  - Issue [#48](https://github.com/fkiller/GnuNae/issues/48) ("Store status watch") - Fresh scan completed and verified
  - Release workflow run [37205326203](https://github.com/fkiller/GnuNae/actions/runs/37205326203) (tag `v1.1.7`)
  - Docker Build workflow run [37205326161](https://github.com/fkiller/GnuNae/actions/runs/37205326161) (tag `v1.1.7`)
  - Store Status Watch run [37205768206](https://github.com/fkiller/GnuNae/actions/runs/37205768206)
- 이번 범위 / no-op 여부: Upstream `@openai/codex` 0.160.0 CLI 및 모델 파이프라인 동기화, Docker sandbox 패리티 빌드, GnuNae v1.1.7 패치 릴리즈, Microsoft Store 자동 제출, GHCR 이미지 발행

| 구성요소 | 이전 버전 | 목표 버전 | upstream 근거 | Native/Docker 영향 |
|---|---|---|---|---|
| `@openai/codex` | 0.155.1 | 0.160.0 | `npm view @openai/codex version` -> 0.160.0 | Native 런타임 핀 동기화 및 Dockerfile 패리티 빌드 완료 |
| GnuNae App | 1.1.6 | 1.1.7 | 주간 정기 유지보수 및 릴리즈 주기 (11일 경과) | 앱 버전 bump, website 메타데이터(`docs/index.html`) 동기화 |
| GHCR Docker sandbox | v1.1.6 / latest | v1.1.7 / latest | Codex 0.160.0 및 Playwright MCP 0.0.70 패리티 | `ghcr.io/fkiller/gnunae/sandbox:latest` 및 `v1.1.7` 발행 완료 |
| Microsoft Store | 1.1.6 (Published) | 1.1.7 (CommitStarted) | Windows APPX 패키징 및 Partner Center 자동 제출 | Submission ID `1152921505702038728` 커밋 완료 |

## Summary
- 이전 성공 실행(2026-09-23) 후 11일이 경과하여 주간 정기 유지보수 주기가 도래(overdue)함을 감지하고 자동 실행에 착수했습니다.
- 작업 공간 격리 규칙에 따라 루트 작업 디렉터리를 일체 수정하지 않고 `.worktrees/weekly-maintenance`에서 `origin/main` 기반으로 작업을 완벽히 격리했습니다.
- 업스트림 `@openai/codex` CLI 최신 버전 0.160.0을 감지하여 모델 파이프라인, 의존성 락파일, 런타임 매니저, Dockerfile, 설치 스크립트 및 런타임 문서를 0.160.0으로 동기화했습니다.
- 로컬 `npm ci`, 모델 무결성 검사, TypeScript 빌드, Vite UI 번들링, Docker 컨테이너 이미지 빌드 검증을 모두 PASS했습니다.
- `v1.1.7` 패치 버전을 생성하고 태그 `v1.1.7`을 origin에 푸시하여 CI/CD 배포 파이프라인(`release.yml`, `docker.yml`)을 가동했습니다.
- Docker 이미지가 GHCR에 성공적으로 빌드 및 푸시되었고, Microsoft Store APPX 패키지(`GnuNae-win-x64.appx`, 432.5 MB)가 빌드되어 Partner Center에 신규 제출(ID `1152921505702038728`)되었습니다.
- `store-status-watch.yml` 워크플로를 트리거하여 Issue #48에 Windows Store가 `CommitStarted`(in review) 상태로 정상 갱신되었음을 확인했습니다.

## What I inspected
- `~/.gnunae/maintenance-state.json`: 마지막 실행 2026-09-23, 다음 예정일 2026-09-30, 현재 2026-10-04 (11일 경과로 due).
- `git status -sb` 및 워크트리 목록: 루트 작업 디렉터리의 비스테이징/언트랙트 파일 보호 확인.
- 업스트림 npm 레지스트리: `@openai/codex` 최신 0.160.0 확인.
- 공식 모델 매니페스트 `src/core/codex-models.json` 및 `src/core/settings.ts`: 기본 모델 `gpt-6-astra` 유지 및 정합성 검증.
- Apple Developer / App Store Connect 응답: notarytool 및 altool의 403 에러 원인(Apple 계정 라이선스 계약 갱신 대기) 확인.

## Files changed
- `package.json`: version `1.1.7`, devDependencies `@openai/codex` `0.160.0`
- `package-lock.json`: version `1.1.7`, 의존성 락파일 0.160.0 동기화
- `resources/codex/package.json` & `resources/codex/package-lock.json`: `@openai/codex` `0.160.0`
- `resources/package.json` & `resources/package-lock.json`: `@openai/codex` `0.160.0`
- `src/core/runtime-manager.ts`: `CODEX_VERSION = '0.160.0'`
- `scripts/install-codex.js`: `CODEX_VERSION = '0.160.0'`
- `docker/Dockerfile`: `@openai/codex@0.160.0`
- `docs/PERIODIC_MAINTENANCE.md`: 0.160.0 핀 업데이트
- `docs/codex-model-runtime.md`: 0.160.0 핀 및 런타임 설명 동기화
- `docs/index.html`: 웹사이트 다운로드 및 메타 태그 `v1.1.7` 갱신
- `docs/handoff/reports/2026-10-04-weekly-maintenance-v1.1.7.md`: 본 주간 유지보수 보고서

## Verification

| 명령 또는 수동 검사 | PASS / FAIL / NOT RUN | HEAD SHA / run 링크 / 이유 |
|---|---|---|
| npm ci | PASS | Node 22 환경에서 484개 패키지 audit 정상 완료 |
| npm run check:codex-models | PASS | `gpt-6-astra` 기본 모델 매니페스트 정합성 확인 |
| npm run check:openai-model-pipeline -- --codex-version=0.160.0 | PASS | 모든 구성요소의 0.160.0 핀 정합성 확인 |
| npm run build | PASS | TypeScript(`tsc`) + Vite UI 번들 및 `build-ui.js` 정상 생성 |
| Docker build (npm run build:docker) | PASS | 로컬 Docker 데몬에서 `gnunae/sandbox:latest` 및 `ghcr.io/fkiller/gnunae/sandbox:latest` 빌드 성공 |
| CI Docker Build (docker.yml) | PASS | [Run 37205326161](https://github.com/fkiller/GnuNae/actions/runs/37205326161) 성공, GHCR 이미지 푸시 완료 |
| CI Linux (release.yml) | PASS | [Job 111445212468](https://github.com/fkiller/GnuNae/actions/runs/37205326203/job/111445212468) 성공, `deb` 및 `AppImage` 패키징 완료 |
| CI Microsoft Store (build-msstore) | PASS | [Job 111445212438](https://github.com/fkiller/GnuNae/actions/runs/37205326203/job/111445212438) 성공, APPX(432.5MB) 패키징 및 Partner Center 제출 완료 |
| CI macOS Developer ID / Notarization | FAIL (외부 블로커) | [Job 111445212253](https://github.com/fkiller/GnuNae/actions/runs/37205326203/job/111445212253) HTTP 403 (Apple Legal Agreement pending) |
| CI Mac App Store (build-mas) | FAIL (외부 블로커) | [Job 111445212431](https://github.com/fkiller/GnuNae/actions/runs/37205326203/job/111445212431) altool 403 / exit code 31 (Apple Legal Agreement pending) |
| GitHub Release 에셋 발행 | SKIPPED | macOS matrix 실패로 인해 의존성 `release` 잡 스킵됨 |
| Store Status Watch (Issue #48) | PASS | [Run 37205768206](https://github.com/fkiller/GnuNae/actions/runs/37205768206) 실행 완료, Issue #48 최신화 확인 |

별도 npm test/lint는 현재 프로젝트에 구성되어 있지 않습니다.

## Release and store impact

- **GHCR Docker Sandbox**: `ghcr.io/fkiller/gnunae/sandbox:latest` 및 `v1.1.7` 이미지가 성공적으로 빌드되어 GHCR에 게시되었습니다.
- **Microsoft Store (Windows)**:
  - APPX 패키지: `GnuNae-win-x64.appx` (432.5 MB)
  - Partner Center Submission ID: `1152921505702038728`
  - 현재 상태: `CommitStarted` (인증 및 리뷰 진행 중)
- **Linux 릴리즈**: `GnuNae-linux-amd64.deb` 및 `GnuNae-linux-x86_64.AppImage` 빌드 완료 (아티팩트 보관됨).
- **Apple / Mac App Store**:
  - Apple Developer Account Holder의 프로그램 라이선스 계약 갱신 동의가 필요합니다.
  - 오류 메시지: `HTTP status code: 403. A required agreement is missing or has expired. This request requires an in-effect agreement that has not been signed or has expired.`

## Native and Docker impact
- Native 모드: 번들 및 런타임 매니저가 `@openai/codex@0.160.0`을 사용하도록 업데이트되었습니다.
- Docker Virtual 모드: 컨테이너 Dockerfile의 베이스 패키지가 `@openai/codex@0.160.0`으로 갱신되었으며, 최신 이미지가 로컬 및 GHCR에 빌드/푸시되었습니다.
- 모델 정합성: 기본 모델 `gpt-6-astra`와 fallback 모델 `gpt-5.6-luna`의 양방향 정합성이 유지됩니다.

## Stale docs or conflicts found
- `docs/codex-model-runtime.md`의 pinned Codex 버전이 이전 0.155.1에서 0.160.0으로 업데이트되었습니다.
- `docs/PERIODIC_MAINTENANCE.md` 및 `docs/index.html`이 v1.1.7로 업데이트되었습니다.

## Manual confirmation needed
1. **Apple Developer Portal 계약 동의 (필수 액션)**:
   - Apple Developer 포털([developer.apple.com](https://developer.apple.com)) 또는 App Store Connect에 계정 소유자(Account Holder)로 로그인하여 상단에 표시되는 갱신된 "Apple Developer Program License Agreement"에 동의(Review & Accept)해야 합니다.
2. **동의 후 Mac 릴리즈 재실행**:
   - 계약 동의가 완료되면 GitHub Actions에서 `release.yml`을 수동 실행(`workflow_dispatch` -> `release_mode=stores-only` 또는 `release_mode=mas-only`, Branch: `main` 또는 Tag `v1.1.7`)하여 MAS 업로드 및 macOS DMG/ZIP 공증을 완료할 수 있습니다.
3. **Microsoft Store 인증 추적**:
   - Submission ID `1152921505702038728`이 파트너 센터에서 인증 단계를 거쳐 게시 완료되는지 Issue #48 또는 파트너 센터 포털에서 확인합니다.

## Recommended next tasks
- PR/Commit: `84733ec` (`chore(release): v1.1.7 weekly maintenance and model pipeline update`) -> `origin/main` 푸시 완료, Tag `v1.1.7` 푸시 완료.
- Apple 계약 동의 확인 후: `gh workflow run release.yml -f release_mode=stores-only -r main`
