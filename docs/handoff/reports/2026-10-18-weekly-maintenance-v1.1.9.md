# GnuNae maintenance run

- 일시 / 하네스 / host / OS: 2026-10-18T13:56:34.581Z / Antigravity / macOS (darwin-arm64)
- 기준 origin/main SHA / 작업 HEAD SHA / branch: `1b577ba7e677fa39dacdf099b6adf1ddb3cff268` / `maintenance/auto-weekly` -> `main`
- Node/npm 버전 / preflight 결과: Node v22.23.2, npm 10.9.8 / Preflight passed
- 확인한 issue / 기존 PR / workflow run:
  - Issue [#48](https://github.com/fkiller/GnuNae/issues/48) ("Store status watch")
  - Release workflow run [39131099450](https://github.com/fkiller/GnuNae/actions/runs/39131099450) (tag `v1.1.9`)
  - Docker Build workflow run [39131099452](https://github.com/fkiller/GnuNae/actions/runs/39131099452) (tag `v1.1.9`)
  - Store Status Watch workflow run [39133761319](https://github.com/fkiller/GnuNae/actions/runs/39133761319)
- 이번 범위 / no-op 여부: Upstream @openai/codex 0.163.0 CLI 동기화, Docker sandbox 패리티 빌드, GnuNae v1.1.9 패치 릴리즈

| 구성요소 | 이전 버전 | 목표 버전 | upstream 근거 | Native/Docker 영향 |
|---|---|---|---|---|
| `@openai/codex` | 0.162.1 | 0.163.0 | `npm view @openai/codex version` -> 0.163.0 | Native 런타임 핀 동기화 및 Dockerfile 패리티 빌드 |
| GnuNae App | 1.1.8 | 1.1.9 | 주간 정기 유지보수 및 릴리즈 주기 | 앱 버전 bump, website 메타데이터(`docs/index.html`) 동기화 |
| GHCR Docker sandbox | v1.1.8 / latest | v1.1.9 / latest | Codex 0.163.0 패리티 | `ghcr.io/fkiller/gnunae/sandbox:latest` 및 `v1.1.9` |
| Microsoft Store | 1.1.8 (Published) | 1.1.9 (in review) | Windows APPX 패키징 및 Partner Center 자동 제출 | Submission ID `1152921505702162910` 커밋 완료 |
| Mac App Store | 1.1.8 (Published) | 1.1.9 (in review) | altool 패키징 업로드 및 App Store Connect 심사 자동 제출 | Review Submission ID `4955139f-ae2a-430d-9e2d-e0cffb5262c0` (`WAITING_FOR_REVIEW`) 제출 완료 |

## Summary
- 주간 정기 유지보수 스케줄러 실행에 착수했습니다.
- 작업 공간 격리 규칙에 따라 루트 작업 디렉터리를 일체 수정하지 않고 `.worktrees/weekly-maintenance`에서 `origin/main` 기반으로 작업을 완벽히 격리했습니다.
- 업스트림 `@openai/codex` CLI 최신 버전 0.163.0를 감지하여 모델 파이프라인, 의존성 락파일, 런타임 매니저, Dockerfile, 설치 스크립트 및 런타임 문서를 0.163.0으로 동기화했습니다.
- 로컬 `npm ci`, 모델 무결성 검사, TypeScript 빌드, Vite UI 번들링, Docker 컨테이너 이미지 빌드 검증을 모두 수행했습니다.
- `v1.1.9` 패치 버전을 생성하고 태그 `v1.1.9`를 origin에 푸시하여 CI/CD 배포 파이프라인(`release.yml`, `docker.yml`)을 가동했습니다.
- Docker 이미지가 GHCR에 성공적으로 빌드 및 푸시되었습니다 (`ghcr.io/fkiller/gnunae/sandbox:latest`, `v1.1.9`).
- Microsoft Store APPX 패키지가 빌드되어 Partner Center에 신규 제출(ID `1152921505702162910`, `CommitStarted` -> `in review`)되었습니다.
- Mac App Store 패키지가 빌드되어 altool로 업로드된 후, App Store Connect 빌드 검증(VALID, build `1792330755`)을 거쳐 정상적으로 심사 제출(ID `4955139f-ae2a-430d-9e2d-e0cffb5262c0`, `WAITING_FOR_REVIEW`)되었습니다.
- GitHub Release `v1.1.9`에 macOS DMG/ZIP (ARM64 & x64), Linux DEB/AppImage 등 6개 에셋이 공증/서명되어 공식 발행되었습니다.
- `store-status-watch.yml` 워크플로를 트리거하여 Issue #48에 모든 스토어 상태가 정상(`in review`)으로 갱신되었음을 확인했습니다.

## What I inspected
- `~/.gnunae/maintenance-state.json`: 이전 실행 상태 및 7일 주기 도래 확인.
- `git status -sb` 및 워크트리 목록: 루트 작업 디렉터리의 미커밋/언트랙트 파일 보호 확인.
- 업스트림 npm 레지스트리: `@openai/codex` 최신 0.163.0 확인.
- 모델 매니페스트 `src/core/codex-models.json` 및 `src/core/settings.ts`: 기본 모델 `gpt-6-astra` 유지 및 정합성 검증.
- CI/CD 워크플로: `release.yml` (Run 39131099450), `docker.yml` (Run 39131099452), `store-status-watch.yml` (Run 39133761319).
- GitHub Issue #48: 다중 스토어 리뷰 진행 상태 확인.

## Files changed
- `package.json`: version `1.1.9`, devDependencies `@openai/codex` `0.163.0`
- `package-lock.json`: version `1.1.9`, 의존성 락파일 0.163.0 동기화
- `resources/codex/package.json` & `resources/codex/package-lock.json`: `@openai/codex` `0.163.0`
- `resources/package.json` & `resources/package-lock.json`: `@openai/codex` `0.163.0`
- `src/core/runtime-manager.ts`: `CODEX_VERSION = '0.163.0'`
- `scripts/install-codex.js`: `CODEX_VERSION = '0.163.0'`
- `docker/Dockerfile`: `@openai/codex@0.163.0`
- `docs/PERIODIC_MAINTENANCE.md`: 0.163.0 핀 업데이트
- `docs/codex-model-runtime.md`: 0.163.0 핀 및 런타임 설명 동기화
- `docs/index.html`: 웹사이트 다운로드 및 메타 태그 `v1.1.9` 갱신
- `docs/handoff/reports/2026-10-18-weekly-maintenance-v1.1.9.md`: 본 주간 유지보수 보고서

## Verification

| 명령 또는 수동 검사 | PASS / FAIL / NOT RUN | HEAD SHA / run 링크 / 이유 |
|---|---|---|
| npm ci | PASS | Node 22 환경 패키지 정상 정렬 |
| npm run check:codex-models | PASS | `gpt-6-astra` 기본 모델 매니페스트 정합성 확인 |
| npm run check:openai-model-pipeline -- --codex-version=0.163.0 | PASS | 모든 구성요소의 0.163.0 핀 정합성 확인 |
| npm run build | PASS | TypeScript(`tsc`) + Vite UI 번들 정상 생성 |
| Docker build (npm run build:docker) | PASS | 로컬 Docker 샌드박스 빌드 성공 |
| CI Docker Build (docker.yml) | PASS | [Run 39131099452](https://github.com/fkiller/GnuNae/actions/runs/39131099452) 성공, GHCR 이미지 푸시 완료 |
| CI Linux (release.yml) | PASS | [Job 117686259276](https://github.com/fkiller/GnuNae/actions/runs/39131099450/job/117686259276) 성공, `deb` 및 `AppImage` 패키징 완료 |
| CI macOS Developer ID / Notarization | PASS | [Job 117686259344](https://github.com/fkiller/GnuNae/actions/runs/39131099450/job/117686259344) 성공, ARM64 및 x64 DMG/ZIP 공증 완료 |
| CI Microsoft Store (build-msstore) | PASS | [Job 117686259273](https://github.com/fkiller/GnuNae/actions/runs/39131099450/job/117686259273) 성공, APPX 패키징 및 Partner Center 제출 완료 |
| CI Mac App Store (build-mas) | PASS | [Job 117686259153](https://github.com/fkiller/GnuNae/actions/runs/39131099450/job/117686259153) 성공, altool 업로드 및 심사 제출 완료 |
| GitHub Release 에셋 발행 | PASS | [Release v1.1.9](https://github.com/fkiller/GnuNae/releases/tag/v1.1.9) (macOS ARM64/x64, Linux DEB/AppImage 6개 에셋 등록) |
| Store Status Watch (Issue #48) | PASS | [Run 39133761319](https://github.com/fkiller/GnuNae/actions/runs/39133761319) 실행 완료, Issue #48 최신화 확인 |

## Release and store impact

- **GHCR Docker Sandbox**: `ghcr.io/fkiller/gnunae/sandbox:latest` 및 `v1.1.9` 이미지가 성공적으로 빌드되어 GHCR에 게시되었습니다.
- **Microsoft Store (Windows)**:
  - APPX 패키지: `GnuNae-win-x64.appx` (437.1 MB)
  - Partner Center Submission ID: `1152921505702162910`
  - 현재 상태: `CommitStarted` -> `in review` (인증 및 리뷰 진행 중)
- **Mac App Store (macOS)**:
  - App Store Connect Build: `1.1.9 (build 1792330755)` -> `VALID`
  - Review Submission ID: `4955139f-ae2a-430d-9e2d-e0cffb5262c0`
  - 현재 상태: `WAITING_FOR_REVIEW` (`in review`)
- **GitHub Release & Linux / macOS 독립 배포**:
  - `GnuNae-linux-amd64.deb` (142.93 MiB)
  - `GnuNae-linux-x86_64.AppImage` (205.91 MiB)
  - `GnuNae-mac-arm64.dmg` (202.36 MiB)
  - `GnuNae-mac-arm64.zip` (195.79 MiB)
  - `GnuNae-mac-x64.dmg` (210.26 MiB)
  - `GnuNae-mac-x64.zip` (203.66 MiB)

## Native and Docker impact
- Native 모드: 번들 및 런타임 매니저가 `@openai/codex@0.163.0`를 사용하도록 업데이트되었습니다.
- Docker Virtual 모드: 컨테이너 Dockerfile의 베이스 패키지가 `@openai/codex@0.163.0`로 갱신되었으며, 최신 이미지가 로컬 및 GHCR에 빌드/푸시되었습니다.
- 모델 정합성: 기본 모델 `gpt-6-astra`와 fallback 모델 `gpt-5.6-luna`의 양방향 정합성이 유지됩니다.

## Stale docs or conflicts found
- `docs/codex-model-runtime.md`의 pinned Codex 버전이 이전 0.162.1에서 0.163.0으로 업데이트되었습니다.
- `docs/PERIODIC_MAINTENANCE.md` 및 `docs/index.html`이 v1.1.9로 업데이트되었습니다.

## Manual confirmation needed
- 특별한 수동 블로커 없음. Windows Store 및 Mac App Store 심사 진행 상태는 Issue #48 또는 각 스토어 개발자 콘솔에서 모니터링됩니다.

## Recommended next tasks
- PR/Commit: `7be5f33` (`chore(release): v1.1.9 weekly maintenance and model pipeline update`) -> `origin/main` 푸시 완료, Tag `v1.1.9` 푸시 완료.
- 본 실행 보고서 커밋 및 푸시 완료.
