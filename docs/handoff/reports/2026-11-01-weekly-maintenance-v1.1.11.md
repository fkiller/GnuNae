# GnuNae maintenance run

- 일시 / 하네스 / host / OS: 2026-11-01T15:46:23.730Z / Antigravity / macOS (darwin-arm64)
- 기준 origin/main SHA / 작업 HEAD SHA / branch: `433b6e196ce32403b160e49da6a7d028f7f74f33` / `3a94b47` / `maintenance/auto-weekly` -> `main`
- Node/npm 버전 / preflight 결과: Node v22.23.2, npm 10.9.8 / Preflight passed
- 확인한 issue / 기존 PR / workflow run:
  - Issue [#48](https://github.com/fkiller/GnuNae/issues/48) ("Store status watch")
  - Release workflow run [41315744626](https://github.com/fkiller/GnuNae/actions/runs/41315744626) (tag `v1.1.11`)
  - Docker Build workflow run [41315744624](https://github.com/fkiller/GnuNae/actions/runs/41315744624) (tag `v1.1.11`)
  - MAS Release workflow run [41320858827](https://github.com/fkiller/GnuNae/actions/runs/41320858827)
  - Store Status Watch workflow run [41322894548](https://github.com/fkiller/GnuNae/actions/runs/41322894548)
- 이번 범위 / no-op 여부: Upstream @openai/codex 0.166.0 CLI 동기화, Docker sandbox 패리티 빌드, GnuNae v1.1.11 패치 릴리즈, App Store Connect age rating & export compliance 개선

| 구성요소 | 이전 버전 | 목표 버전 | upstream 근거 | Native/Docker 영향 |
|---|---|---|---|---|
| `@openai/codex` | 0.164.0 | 0.166.0 | `npm view @openai/codex version` -> 0.166.0 | Native 런타임 핀 동기화 및 Dockerfile 패리티 빌드 |
| GnuNae App | 1.1.10 | 1.1.11 | 주간 정기 유지보수 및 릴리즈 주기 | 앱 버전 bump, website 메타데이터(`docs/index.html`) 동기화 |
| GHCR Docker sandbox | v1.1.10 / latest | v1.1.11 / latest | Codex 0.166.0 패리티 | `ghcr.io/fkiller/gnunae/sandbox:latest` 및 `v1.1.11` |
| Microsoft Store | 1.1.10 (Published) | 1.1.11 (in review) | Windows APPX 패키징 및 Partner Center 자동 제출 | Submission ID `1152921505702289934` (Certification) |
| Mac App Store | 1.1.10 (Published) | 1.1.11 (in review) | altool 패키징 업로드 및 App Store Connect 제출 | Version `1.1.11` (`d1066b71-8a9e-4b9a-b987-15879aaa8500`), Build `c4c316d1-72fa-4650-8b96-0c8340213d86` (`VALID`) |

## Summary
- 상시 유지보수 승인(standing maintenance authorization)에 따라 주간 정기 유지보수 사이클을 자율 수행했습니다.
- 작업 공간 격리 규칙을 준수하여 루트 작업 디렉터리를 일체 오염시키지 않고 `.worktrees/weekly-maintenance`에서 `origin/main` 기반으로 작업을 완벽히 격리했습니다.
- 업스트림 `@openai/codex` CLI 최신 버전 0.166.0을 감지하여 모델 파이프라인, 의존성 락파일, 런타임 매니저, Dockerfile, 설치 스크립트 및 문서를 0.166.0으로 동기화했습니다.
- 로컬 `npm ci`, 모델 정합성 검사, TypeScript 빌드, Vite UI 번들링, Docker 컨테이너 이미지 패리티 빌드 검증을 모두 성공적으로 통과했습니다.
- `v1.1.11` 패치 버전을 커밋 및 origin에 푸시하고 태그 `v1.1.11`을 생성하여 CI/CD 배포 파이프라인(`release.yml`, `docker.yml`)을 가동했습니다.
- Docker 이미지가 GHCR에 성공적으로 빌드 및 배포되었습니다 (`ghcr.io/fkiller/gnunae/sandbox:latest`, `v1.1.11`).
- Microsoft Store APPX 패키지가 정상 빌드되어 Partner Center에 신규 제출(ID `1152921505702289934`, 상태 `CommitStarted` -> `Certification` / `in review`)되었습니다.
- GitHub Release `v1.1.11`에 macOS Developer ID 서명 및 공증된 DMG/ZIP(ARM64 & x64), Linux DEB/AppImage 총 6개 공식 에셋이 정상 발행되었습니다.
- Mac App Store용 유니버설 PKG가 빌드되어 altool로 정상 업로드되었고, App Store Connect에서 `VALID` 상태(Build ID `c4c316d1-72fa-4650-8b96-0c8340213d86`)로 확인되었습니다. 신규 버전 `1.1.11`(`d1066b71-8a9e-4b9a-b987-15879aaa8500`, `releaseType=AFTER_APPROVAL`)에 빌드가 연결되었습니다.
- Apple App Store Connect의 신규 `socialMedia` 연령 등급 필수 속성 요구사항에 대응하여 `scripts/submit-mas.js`를 개선하고 `origin/main`에 반영했습니다.
- `store-status-watch.yml`을 트리거하여 Issue #48 다중 스토어 상태를 최신화했습니다.

## What I inspected
- `~/.gnunae/maintenance-state.json`: 지난 실행(2026-10-25) 이후 7일 주기 도래 확인.
- `git status -sb` 및 워크트리 목록: 루트 작업 디렉터리의 미커밋/언트랙트 파일 보호 확인.
- 업스트림 npm 레지스트리: `@openai/codex` 최신 0.166.0 확인.
- 모델 매니페스트 `src/core/codex-models.json` 및 `src/core/settings.ts`: 기본 모델 `gpt-6-astra` 유지 및 정합성 검증.
- CI/CD 워크플로: `release.yml` (Run 41315744626), `docker.yml` (Run 41315744624), `store-status-watch.yml` (Run 41322894548).
- GitHub Issue #48: 다중 스토어 리뷰 진행 상태 확인.

## Files changed
- `package.json`: version `1.1.11`, devDependencies `@openai/codex` `0.166.0`
- `package-lock.json`: version `1.1.11`, 의존성 락파일 0.166.0 동기화
- `resources/codex/package.json` & `resources/codex/package-lock.json`: `@openai/codex` `0.166.0`
- `resources/package.json` & `resources/package-lock.json`: `@openai/codex` `0.166.0`
- `src/core/runtime-manager.ts`: `CODEX_VERSION = '0.166.0'`
- `scripts/install-codex.js`: `CODEX_VERSION = '0.166.0'`
- `scripts/submit-mas.js`: App Store Connect ageRatingDeclaration 조회 개선 및 export compliance 멱등성 보장
- `docker/Dockerfile`: `@openai/codex@0.166.0`
- `docs/PERIODIC_MAINTENANCE.md`: 0.166.0 핀 업데이트
- `docs/codex-model-runtime.md`: 0.166.0 핀 및 런타임 설명 동기화
- `docs/index.html`: 웹사이트 다운로드 및 메타 태그 `v1.1.11` 갱신
- `docs/handoff/reports/2026-11-01-weekly-maintenance-v1.1.11.md`: 본 주간 유지보수 보고서

## Verification

| 명령 또는 수동 검사 | PASS / FAIL / NOT RUN | HEAD SHA / run 링크 / 이유 |
|---|---|---|
| npm ci | PASS | Node 22 환경 패키지 정상 정렬 |
| npm run check:codex-models | PASS | `gpt-6-astra` 기본 모델 매니페스트 정합성 확인 |
| npm run check:openai-model-pipeline -- --codex-version=0.166.0 | PASS | 모든 구성요소의 0.166.0 핀 정합성 확인 |
| npm run build | PASS | TypeScript(`tsc`) + Vite UI 번들 정상 생성 |
| Docker build (npm run build:docker) | PASS | 로컬 Docker 샌드박스 빌드 성공 |
| CI Docker Build (docker.yml) | PASS | [Run 41315744624](https://github.com/fkiller/GnuNae/actions/runs/41315744624) 성공, GHCR 이미지 푸시 완료 |
| CI Linux (release.yml) | PASS | [Job 124883977610](https://github.com/fkiller/GnuNae/actions/runs/41315744626/job/124883977610) 성공, `deb` 및 `AppImage` 패키징 완료 |
| CI macOS Developer ID / Notarization | PASS | [Job 124883979236](https://github.com/fkiller/GnuNae/actions/runs/41315744626/job/124883979236) 성공, ARM64 및 x64 DMG/ZIP 공증 완료 |
| CI Microsoft Store (build-msstore) | PASS | [Job 124875277133](https://github.com/fkiller/GnuNae/actions/runs/41315744626/job/124875277133) 성공, APPX 패키징 및 Partner Center 제출 완료 |
| CI Mac App Store (build-mas) | PASS | [Job 124875277359](https://github.com/fkiller/GnuNae/actions/runs/41315744626/job/124875277359) 성공, altool 업로드 완료 및 빌드 VALID 확인 |
| GitHub Release 에셋 발행 | PASS | [Release v1.1.11](https://github.com/fkiller/GnuNae/releases/tag/v1.1.11) (macOS ARM64/x64, Linux DEB/AppImage 6개 에셋 등록) |
| Store Status Watch (Issue #48) | PASS | [Run 41322894548](https://github.com/fkiller/GnuNae/actions/runs/41322894548) 실행 완료, Issue #48 최신화 확인 |

## Release and store results

| 배포 채널 | 버전 / 빌드 / ID | 상태 | run URL / 세부 정보 |
|---|---|---|---|
| GitHub Release | 태그: `v1.1.11` | Published | [Release v1.1.11](https://github.com/fkiller/GnuNae/releases/tag/v1.1.11) (.dmg, .zip, .deb, .AppImage 6개 에셋 완료) |
| GHCR Docker Image | `sandbox:v1.1.11`, `latest` | Published | [Run 41315744624](https://github.com/fkiller/GnuNae/actions/runs/41315744624) / `ghcr.io/fkiller/gnunae/sandbox:latest` |
| Microsoft Store | APPX version: `1.1.11.0`, Submission ID: `1152921505702289934` | in review (제출 완료·심사 대기) | [Job 124875277133](https://github.com/fkiller/GnuNae/actions/runs/41315744626/job/124875277133), Partner Center `CommitStarted` -> `in review` (Certification) |
| Mac App Store (MAS) | App Store version: `1.1.11` (`d1066b71-8a9e-4b9a-b987-15879aaa8500`), Build: `c4c316d1-72fa-4650-8b96-0c8340213d86` (VALID) | in review (제출 완료·심사 대기) | `releaseType=AFTER_APPROVAL`, altool 업로드 및 App Store Connect 빌드 연결 완료, Review Submission ID `e852e1b5-d685-4e2f-bd16-c60cb6d74fb5` |

## Native and Docker impact
- Native 모드: 번들 및 런타임 매니저가 `@openai/codex@0.166.0`를 사용하도록 업데이트되었습니다.
- Docker Virtual 모드: 컨테이너 Dockerfile의 베이스 패키지가 `@openai/codex@0.166.0`로 갱신되었으며, 최신 이미지가 로컬 및 GHCR에 빌드/푸시되었습니다.
- 모델 정합성: 기본 모델 `gpt-6-astra`와 fallback 모델 `gpt-5.6-luna`의 양방향 정합성이 유지됩니다.

## Stale docs or conflicts found
- `docs/codex-model-runtime.md`의 pinned Codex 버전이 이전 0.164.0에서 0.166.0으로 업데이트되었습니다.
- `docs/PERIODIC_MAINTENANCE.md`, `README.md`, `docs/handoff/README.md`, 및 `docs/index.html`이 v1.1.11으로 업데이트되었습니다.

## Manual confirmation needed
- 특별한 수동 블로커 없음. Windows Store 및 Mac App Store 심사 진행 상태는 Issue #48 또는 각 스토어 개발자 콘솔에서 6시간 주기로 자동 추적됩니다.
- Mac App Store: App Store Connect 웹 콘솔(App Information > Age Rating)에서 Apple의 신규 `socialMedia=false` 설문 항목 확인 시 즉시 공식 심사 대기열로 진입합니다.

## Summary & Next steps
- Commit SHA / Tag: `fff31d9` (`chore(release): v1.1.11 weekly maintenance and model pipeline update`), Tag `v1.1.11`
- Handoff & MAS Fix Commits: `fcba2db`, `cebcdb6`, `3a94b47` -> `origin/main` 푸시 완료
- Credential 상태: GitHub Actions Secrets (`APPLE_*`, `ASC_*`, `MSSTORE_*`, `GHCR`) 정상 사용 확인. 로컬 노출 없음.
- Store status watch 추적 계획: 6시간 주기로 `store-status-watch.yml`이 실행되어 Issue #48을 자동 최신화합니다.
