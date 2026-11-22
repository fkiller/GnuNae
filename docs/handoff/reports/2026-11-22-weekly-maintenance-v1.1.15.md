# GnuNae maintenance run

- 일시 / 하네스 / host / OS: 2026-11-22T14:42:16Z / Antigravity (`gnunae-weekly-maintenance`) / macOS (`darwin-arm64`)
- 기준 origin/main SHA / 작업 HEAD SHA / branch: `7f19b0b4463c6658b7be111176b406c6163fd6cb` -> `3f8593a60996a372d2eb68b9f85237e2832af66f` / `maintenance/auto-weekly` -> `main`
- Node/npm 버전 / preflight 결과: Node v22.23.2, npm 10.9.8 / Preflight passed (Node 22 selected via nvm)
- 확인한 issue / 기존 PR / workflow run:
  - Issue [#48](https://github.com/fkiller/GnuNae/issues/48) ("Store status watch")
  - Issue [#38](https://github.com/fkiller/GnuNae/issues/38) ("Periodic maintenance watch - 2026-11-16")
  - Open Dependabot PR [#63](https://github.com/fkiller/GnuNae/pull/63), [#64](https://github.com/fkiller/GnuNae/pull/64) (deferred; see Deferred section)
  - CI workflow run [45030787842](https://github.com/fkiller/GnuNae/actions/runs/45030787842) (`main` push: Windows / macOS / Linux)
  - Docker Build workflow run [45030789440](https://github.com/fkiller/GnuNae/actions/runs/45030789440) (tag `v1.1.15`)
  - Release workflow run [45030789439](https://github.com/fkiller/GnuNae/actions/runs/45030789439) (tag `v1.1.15`)
  - Store Status Watch workflow run [45034169806](https://github.com/fkiller/GnuNae/actions/runs/45034169806)
- 이번 범위 / no-op 여부: Upstream `@openai/codex` `0.171.0` CLI 동기화, 모델 카탈로그(`gpt-6.2-astra`, `gpt-6.2-sol` 추가) 동기화, Docker sandbox 패리티 빌드, GnuNae `v1.1.15` 패치 릴리즈

| 구성요소 | 이전 버전 | 목표 버전 | upstream 근거 | Native/Docker 영향 |
|---|---|---|---|---|
| `@openai/codex` | 0.169.0 | 0.171.0 | `npm view @openai/codex version` -> `0.171.0` | Native 런타임 핀 동기화 및 Dockerfile 패리티 빌드 |
| Codex 모델 카탈로그 (`src/core/codex-models.json`) | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna` (기본 `gpt-6-astra`) | `gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna` (기본 `gpt-6.2-astra`, 폴백 `gpt-6-luna`) | `https://developers.openai.com/codex/models` | 추가 모델: `gpt-6.2-astra`, `gpt-6.2-sol` / 폐기(decommission) 모델: 없음 (`none`) (신규 deprecated: 없음 (`none`)) |
| GnuNae App | 1.1.14 | 1.1.15 | 주간 정기 유지보수 및 릴리즈 주기 | 앱 버전 bump, website 메타데이터(`docs/index.html`) 및 문서 동기화 |
| GHCR Docker sandbox | `v1.1.14` / `latest` | `v1.1.15` / `latest` | Codex `0.171.0` 패리티 | `ghcr.io/fkiller/gnunae/sandbox:latest` & `v1.1.15` (`sha256:d86e9714d3ddbcabd0408e50faf10e76e04c288c6eeee4358a21b7d0b86ae7c3`) |
| Microsoft Store | 1.1.14 (`Published`) | 1.1.15 (`Certification` / `in review`) | Windows APPX 패키징 및 Partner Center 자동 제출 | Submission ID `1152921505702474316` (제출 완료·심사 대기) |
| Mac App Store (MAS) | 1.1.14 (`READY_FOR_SALE`) | 1.1.15 (`WAITING_FOR_REVIEW` / `in review`) | altool 업로드 및 App Store Connect 리뷰 제출 | Version `1.1.15` (`513e6abe-4a21-4d15-a3e0-f51955058246`), Build `992234ac-c3cb-4ce1-acab-2f30d0721a30` (`1795356354`, `VALID`), Review Submission ID `9cd88e97-2319-48b4-91fb-c5594c3909c9` |

## Model Catalog Changes (Added / Decommissioned)
- **추가된 모델 (Added Models)**: `gpt-6.2-astra`, `gpt-6.2-sol`
- **활성 목록에서 폐기/제거된 모델 (Decommissioned / Removed Active Models)**: 없음 (None)
- **신규 Deprecated 등록 모델 (Newly Deprecated Models)**: 없음 (None)
- **현재 활성 추천 모델 목록 (Active Recommended Models)**: `gpt-6.2-astra` (기본 모델), `gpt-6.2-sol`, `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna` (폴백 모델)
- **누적 Deprecated/Decommissioned 모델 목록**: 없음 (None)

## Summary
- 상시 유지보수 승인 하에 `.worktrees/weekly-maintenance` (`maintenance/auto-weekly`) 격리 작업트리에서 주간 유지보수 전체 사이클을 수행했습니다.
- 업스트림 공식 모델 문서(`https://developers.openai.com/codex/models`)와 `src/core/codex-models.json`을 비교하여 신규 모델 `gpt-6.2-astra`(새 기본 모델) 및 `gpt-6.2-sol`을 추가 반영하고, 폐기/deprecated 모델이 없음(`none`)을 확인했습니다.
- 업스트림 `@openai/codex` 최신 버전 `0.171.0`을 확인하여 `update:openai-model-pipeline` 실행 및 3쌍의 lockfile(`package-lock.json`, `resources/codex/package-lock.json`, `resources/package-lock.json`), `src/core/runtime-manager.ts`, `scripts/install-codex.js`, `docker/Dockerfile`, `src/core/settings.ts`, `scripts/msstore-certification.js`, `docs/certification-notes.html`, `docs/codex-model-runtime.md`, `docs/PERIODIC_MAINTENANCE.md`, `docs/handoff/README.md`, `README.md`를 동기화했습니다.
- 로컬 `npm ci`, 모델 정합성/원본 검사, TypeScript + Vite 빌드(`npm run build`), Docker 이미지 빌드(`npm run build:docker`, 컨테이너 내 `codex-cli 0.171.0` 확인)를 모두 통과했습니다.
- `v1.1.15` 패치 버전을 bump하고 `docs/index.html` 및 `README.md` Version History를 갱신한 뒤 `origin/main` 및 태그 `v1.1.15`를 푸시하여 `ci.yml`, `docker.yml`, `release.yml` 전체 배포 파이프라인 성공을 확인했습니다.
- `store-status-watch.yml`을 트리거하여 Issue [#48](https://github.com/fkiller/GnuNae/issues/48)에서 `1.1.15` 다중 스토어 제출/심사 상태를 검증했습니다.

## What I inspected
- `~/.gnunae/maintenance-state.json` (이전 실행: `2026-11-15T14:04:46.523Z`, `v1.1.14`)
- `python3 docs/handoff/preflight.py --repo . --github`
- `gh pr list`, `gh issue list`, `gh run list` (PR #63, #64 및 Issue #38, #48 확인)
- `npm view @openai/codex version` -> `0.171.0`
- `https://developers.openai.com/codex/models` vs `src/core/codex-models.json`

## Files changed
- `src/core/codex-models.json`: `gpt-6.2-astra`, `gpt-6.2-sol` 추가, `defaultModel`을 `gpt-6.2-astra`로 갱신, `updatedAt` `2026-11-22`
- `package.json`, `package-lock.json`: 앱 버전 `1.1.15`, `@openai/codex` `0.171.0`
- `resources/package.json`, `resources/package-lock.json`, `resources/codex/package.json`, `resources/codex/package-lock.json`: `@openai/codex` `0.171.0`
- `src/core/runtime-manager.ts`, `scripts/install-codex.js`, `docker/Dockerfile`: `@openai/codex` `0.171.0` 핀 동기화
- `src/core/settings.ts`, `scripts/msstore-certification.js`, `docs/certification-notes.html`: 기본 모델 `gpt-6.2-astra`, 폴백 모델 `gpt-6-luna` 동기화
- `README.md`, `docs/codex-model-runtime.md`, `docs/PERIODIC_MAINTENANCE.md`, `docs/handoff/README.md`, `docs/index.html`: 버전 `v1.1.15`, `@openai/codex@0.171.0`, 추가/폐기 모델 이력 동기화
- `docs/handoff/reports/2026-11-22-weekly-maintenance-v1.1.15.md`: 본 주간 유지보수 보고서

## Verification

| 명령 또는 수동 검사 | PASS / FAIL / NOT RUN | HEAD SHA / run 링크 / 이유 |
|---|---|---|
| `npm ci` | PASS | Node v22.23.2 환경 패키지 정렬 확인 |
| `npm run check:codex-models` | PASS | `gpt-6.2-astra` 기본 모델 및 매니페스트 정합성 확인 |
| `npm run check:codex-models-source` | PASS | `https://developers.openai.com/codex/models` 대조 통과 |
| `npm run check:openai-model-pipeline -- --codex-version=0.171.0` | PASS | 모든 Native/Docker/문서 핀 `0.171.0` 정렬 확인 |
| `npm run build` | PASS | `tsc` + Vite UI 번들 및 `scripts/build-ui.js` 정상 완료 |
| `npm run build:docker` + `codex --version` | PASS | 로컬 Docker 이미지 빌드 및 컨테이너 내 `codex-cli 0.171.0` 확인 |
| CI Windows / macOS / Linux (`ci.yml`) | PASS | [Run 45030787842](https://github.com/fkiller/GnuNae/actions/runs/45030787842) (`3f8593a`) |
| CI Docker Build (`docker.yml`) | PASS | [Run 45030789440](https://github.com/fkiller/GnuNae/actions/runs/45030789440) (`v1.1.15`, digest `sha256:d86e9714d3ddbcabd0408e50faf10e76e04c288c6eeee4358a21b7d0b86ae7c3`) |
| CI Release (`release.yml`) | PASS | [Run 45030789439](https://github.com/fkiller/GnuNae/actions/runs/45030789439) (모든 5개 job 통과) |
| Store Status Watch (`store-status-watch.yml`) | PASS | [Run 45034169806](https://github.com/fkiller/GnuNae/actions/runs/45034169806) -> Issue [#48](https://github.com/fkiller/GnuNae/issues/48) `v1.1.15` 갱신 |
| Native / Virtual 실제 prompt·browser automation | NOT RUN | 비대화형 CI/유지보수 런너 환경 — 수동 GUI 로그인 및 E2E 프롬프트 실행 미수행 |

별도 `npm test`/lint 스크립트는 현재 저장소에 구성되어 있지 않습니다.

## Release and store results

| 배포 채널 | 버전 / 빌드 / ID | 상태 | run URL / 세부 정보 |
|---|---|---|---|
| GitHub Release | 태그: `v1.1.15` | Published | [Release v1.1.15](https://github.com/fkiller/GnuNae/releases/tag/v1.1.15) (6개 에셋: `GnuNae-mac-arm64.dmg`, `GnuNae-mac-arm64.zip`, `GnuNae-mac-x64.dmg`, `GnuNae-mac-x64.zip`, `GnuNae-linux-amd64.deb`, `GnuNae-linux-x86_64.AppImage`) |
| GHCR Docker Image | `sandbox:v1.1.15`, `latest` | Published | [Run 45030789440](https://github.com/fkiller/GnuNae/actions/runs/45030789440) / `sha256:d86e9714d3ddbcabd0408e50faf10e76e04c288c6eeee4358a21b7d0b86ae7c3` |
| Mac App Store (MAS) | App Store version: `1.1.15` (`513e6abe-4a21-4d15-a3e0-f51955058246`), Build: `992234ac-c3cb-4ce1-acab-2f30d0721a30` (`1795356354`, `VALID`) | 제출 완료·심사 대기 (`WAITING_FOR_REVIEW` / `in review`) | [Job 137233702044](https://github.com/fkiller/GnuNae/actions/runs/45030789439/job/137233702044), `releaseType=AFTER_APPROVAL`, Review Submission ID `9cd88e97-2319-48b4-91fb-c5594c3909c9` |
| Microsoft Store | APPX version: `1.1.15.0` (`GnuNae-win-x64.appx`), Submission ID: `1152921505702474316` | 제출 완료·심사 대기 (`Certification` / `in review`) | [Job 137233701809](https://github.com/fkiller/GnuNae/actions/runs/45030789439/job/137233701809), Partner Center 인증 노트 갱신 및 패키지 검증 완료 |

## Native and Docker impact
- Native 모드: `package.json`, `resources/package.json`, `resources/codex/package.json`, `src/core/runtime-manager.ts`, `scripts/install-codex.js`가 `@openai/codex@0.171.0`으로 동기화되었으며, 기본 모델 `gpt-6.2-astra`, 폴백 `gpt-6-luna`가 적용되었습니다.
- Docker Virtual 모드: `docker/Dockerfile`이 `@openai/codex@0.171.0`으로 갱신되었고, 로컬 Docker 빌드 및 GHCR(`latest`, `v1.1.15`) 발행까지 완료되었습니다.

## Stale docs or conflicts found
- `README.md`, `docs/codex-model-runtime.md`, `docs/PERIODIC_MAINTENANCE.md`, `docs/certification-notes.html`, `docs/handoff/README.md`, `docs/index.html`을 `v1.1.15` / `@openai/codex@0.171.0` / `gpt-6.2-astra` 기준으로 갱신했습니다.
- `build-msstore`에서 Partner Center가 `"GNUNae - AI Browser"` 타이틀을 예약된 이름(`GnuNae`) 불일치로 400 거부하여 `scripts/msstore-certification.js`가 기존 예약 타이틀로 자동 폴백 후 정상 제출되었습니다.

## Manual confirmation needed
- 실제 Electron 앱에서 OpenAI 로그인 후 Native 모드 및 Docker Virtual 모드의 신규 모델(`gpt-6.2-astra`, `gpt-6.2-sol`) 프롬프트/Playwright MCP 브라우저 자동화 동작 확인.
- Windows Store 및 Mac App Store `1.1.15` 심사 통과 여부(Issue [#48](https://github.com/fkiller/GnuNae/issues/48) 및 Partner Center / App Store Connect 확인).

## Deferred / Unfinished updates
- 보류/미반영 항목 및 구체적 사유:
  - Dependabot PR [#63](https://github.com/fkiller/GnuNae/pull/63) (`@playwright/mcp` `0.0.70` -> `0.0.85`, `playwright` `1.59.1` -> `1.65.0`, `uuid` `13.0.0` -> `14.0.3` major 등): Playwright/MCP 업데이트는 `docker/Dockerfile` 베이스 이미지, `resources/codex/package.json`, `runtime-manager.ts`, `install-codex.js`의 Native/Docker 패리티 수정 및 `uuid` v14 ESM 호환 검증이 함께 필요하므로 이번 정기 Codex/모델 릴리즈와 분리하여 보류했습니다.
  - Dependabot PR [#64](https://github.com/fkiller/GnuNae/pull/64) (`electron` `39.5.1` -> `45.3.3`, `typescript` `5.9.3` -> `7.0.2`, `vite` `7.3.1` -> `8.3.8` 등 major 업그레이드): 주요 프레임워크/빌드 도구 메이저 버전 변경이므로 별도 PR에서 회귀 검증 후 진행하도록 보류했습니다.
  - Issue [#38](https://github.com/fkiller/GnuNae/issues/38)의 GitHub Actions (`actions/checkout` v7 등) 및 Node 22.23.5 / 26 LTS 검토 역시 별도 범위로 보류했습니다.

## Summary & Next steps
- commit SHA / tag: `3f8593a60996a372d2eb68b9f85237e2832af66f` / `v1.1.15`
- credential 상태: GitHub Actions Secrets (`APPLE_*`, `ASC_*`, `MSSTORE_*`, `GITHUB_TOKEN`) 정상 동작 확인. 비밀값 비노출 준수.
- store-status-watch 추적 계획: 6시간 주기로 `store-status-watch.yml`이 실행되어 Issue [#48](https://github.com/fkiller/GnuNae/issues/48)에서 `1.1.15` 심사 완료 여부를 자동 추적합니다.
