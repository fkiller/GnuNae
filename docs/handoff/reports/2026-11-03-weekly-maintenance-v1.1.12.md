# GnuNae maintenance run

- 일시 / 하네스 / host / OS: 2026-11-03T18:45:00-05:00 / Antigravity / macOS (darwin-arm64)
- 기준 origin/main SHA / 작업 HEAD SHA / branch: `c7d435b` -> `111b76c` / `maintenance/auto-weekly` -> `main`
- Node/npm 버전 / preflight 결과: Node v22.21.1, npm 10.9.4 / Preflight passed (GitHub admin/push/pull verified)
- 확인한 issue / 기존 PR / workflow run:
  - Issue [#48](https://github.com/fkiller/GnuNae/issues/48) ("Store status watch")
  - Release workflow run [`41736383808`](https://github.com/fkiller/GnuNae/actions/runs/41736383808) (tag `v1.1.12`, all 5 jobs passed)
  - Docker Build workflow run [`41736384117`](https://github.com/fkiller/GnuNae/actions/runs/41736384117) (tag `v1.1.12`, passed)
  - CI workflow run [`41736377915`](https://github.com/fkiller/GnuNae/actions/runs/41736377915) (`main`, macOS/Ubuntu/Windows all passed)
- 이번 범위 / no-op 여부:
  1. `v1.1.11` 유지보수 시 누락되었던 업스트림 Codex 모델 카탈로그(`gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`) 동기화 및 주간 자동화 러너(`scripts/weekly-maintenance-runner.js`) 결함 수정
  2. 모든 스토어 표시 명칭을 **`GNUNae - AI Browser`**로 통일 (`scripts/submit-mas.js`, `scripts/msstore-certification.js`, `scripts/store-status-watch.js`, `src/core/tray-manager.ts`, `docs/index.html`, `docs/certification-notes.html`)
  3. Mac App Store `ageRatingDeclarations`(`socialMedia: false`) 편집 가능 `appInfo` 탐색 버그 수정 및 `v1.1.12` 심사 제출 완료 (`WAITING_FOR_REVIEW`)

| 구성요소 | 이전 버전 | 목표 버전 | upstream 근거 | Native/Docker 영향 |
|---|---|---|---|---|
| Codex 모델 카탈로그 (`src/core/codex-models.json`) | `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` (fallback `gpt-5.6-luna`) | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna` (fallback `gpt-6-luna`) | `https://developers.openai.com/codex/models` (`npm run update:codex-models`) | Native/Docker 모델 선택 및 fallback(`gpt-6-luna`) 동기화 |
| `@openai/codex` | `0.166.0` | `0.166.0` | `npm view @openai/codex version` -> `0.166.0` | Native 및 Docker 런타임 핀 유지 |
| GnuNae App | `1.1.11` | `1.1.12` | 모델 카탈로그 및 스토어 명칭 동기화 패치 릴리즈 | 앱 버전 bump, `docs/index.html` 및 `README.md` 동기화 |
| GHCR Docker sandbox | `v1.1.11` / `latest` | `v1.1.12` / `latest` | Codex `0.166.0` 및 모델 패리티 | `ghcr.io/fkiller/gnunae/sandbox:latest` 및 `v1.1.12` 푸시 완료 |
| Mac App Store | `1.1.11` (`PREPARE_FOR_SUBMISSION`) | `1.1.12` (`WAITING_FOR_REVIEW`) | `GnuNae-mac-universal.pkg` 업로드 및 자동 심사 제출 | 앱 명칭 `GNUNae - AI Browser` 적용, 빌드 `a0a4402c-58e9-4594-86b8-3b08ec7a01e1` (`VALID`), 심사 제출 `d0bd6b19-a00f-4d9d-95c2-cae9f1976756` (`WAITING_FOR_REVIEW`, `AFTER_APPROVAL`) |
| Microsoft Store | `1.1.11.0` (`Published`) | `1.1.12.0` (`CommitStarted` / In Review) | Windows APPX 패키징 및 Partner Center 제출 | Submission ID `1152921505702309739` (`GnuNae-win-x64.appx`, `1.1.12.0`) 커밋 완료 |

## Summary
- **원인 분석 및 반성**: 이전 `v1.1.11` 실행 시 `scripts/weekly-maintenance-runner.js`가 `npm run update:codex-models`와 `npm run check:codex-models-source`를 호출하지 않고 로컬 `src/core/codex-models.json`만 검사하는 바람에 업스트림 `https://developers.openai.com/codex/models`에 게시된 `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna` 모델을 놓쳤습니다.
- `scripts/weekly-maintenance-runner.js`와 `.agents/skills/gnunae-weekly-maintenance/SKILL.md`를 수정하여 매 실행 시 반드시 `npm run update:codex-models`, `npm run update:openai-model-pipeline`, `npm run check:codex-models-source`를 실행하도록 근본 원인을 교정했습니다.
- `src/core/codex-models.json`을 업스트림과 동기화하여 `GPT-6-Astra`(기본), `GPT-6.1-Sol`, `GPT-6.1-Terra`, `GPT-6-Luna`(fallback)를 반영했습니다.
- 스토어 표시 이름을 **`GNUNae - AI Browser`**로 설정하도록 `scripts/submit-mas.js` (`appInfoLocalizations`) 및 `scripts/msstore-certification.js` (`baseListing.title`)를 업데이트했습니다.
  - **Mac App Store**: 편집 가능한 `appInfo`(`7a3dfa04-55cc-4d8c-9f92-f7b480a95ba2`)의 `appInfoLocalization`(`94dddbf2-349c-4585-96c6-32251cc0641e`) 이름을 **`GNUNae - AI Browser`**로 업데이트(HTTP 200)하고, `ageRatingDeclaration`의 `socialMedia: false`를 패치한 뒤 빌드 `a0a4402c-58e9-4594-86b8-3b08ec7a01e1`를 심사 제출(`d0bd6b19-a00f-4d9d-95c2-cae9f1976756`, `WAITING_FOR_REVIEW`) 완료했습니다.
  - **Microsoft Store**: `scripts/msstore-certification.js`에서 `baseListing.title`을 `GNUNae - AI Browser`로 설정 시도하도록 구현했습니다. Partner Center API에서 현재 예약된 앱 이름이 `[GnuNae]`뿐이어서 `InvalidParameterValue: Invalid listing title(s): [GNUNae - AI Browser]. Please use reserved name(s): [GnuNae]`를 반환함에 따라 자동 폴백으로 제출(`1152921505702309739`, `1.1.12.0`)을 정상 완료했습니다. Partner Center 포털(`Product management -> Manage app names -> Reserve more names`)에서 `GNUNae - AI Browser`를 예약하면 차기 제출부터 즉시 자동 반영됩니다.

## Verification

| 명령 또는 수동 검사 | PASS / FAIL / NOT RUN | HEAD SHA / run 링크 / 이유 |
|---|---|---|
| `npm ci` | PASS | Node 22.21.1 환경 클린 설치 완료 |
| `npm run check:codex-models` | PASS | `gpt-6-astra, gpt-6.1-sol, gpt-6.1-terra, gpt-6-luna; default gpt-6-astra` 정합성 확인 |
| `npm run check:codex-models-source` | PASS | `https://developers.openai.com/codex/models` 업스트림 대조 통과 |
| `npm run check:openai-model-pipeline -- --codex-version=0.166.0` | PASS | 전체 파이프라인 파일 및 fallback `gpt-6-luna` 정렬 확인 |
| `npm run build` | PASS | `tsc` + Vite UI 빌드 통과 |
| `npm run build:docker` | PASS | 로컬 Docker 이미지 빌드 통과 |
| CI (`ci.yml`) | PASS | [Run 41736377915](https://github.com/fkiller/GnuNae/actions/runs/41736377915) (macOS, Ubuntu, Windows 모두 성공) |
| Docker Build (`docker.yml`) | PASS | [Run 41736384117](https://github.com/fkiller/GnuNae/actions/runs/41736384117) (`v1.1.12` & `latest` 푸시 성공) |
| Release (`release.yml`) | PASS | [Run 41736383808](https://github.com/fkiller/GnuNae/actions/runs/41736383808) (`build`, `build-mas`, `build-msstore`, `release` 전 잡 성공) |
| GitHub Release (`v1.1.12`) | PASS | 6개 아티팩트(`GnuNae-mac-arm64.dmg/zip`, `GnuNae-mac-x64.dmg/zip`, `GnuNae-linux-x86_64.AppImage`, `GnuNae-linux-amd64.deb`) 게시 확인 |

## Manual confirmation needed
- **Microsoft Partner Center 앱 이름 예약**: Microsoft Partner Center는 REST API를 통한 신규 앱 이름 예약을 지원하지 않으며 포털에서 먼저 이름을 예약해야 `baseListing.title` 변경을 허용합니다. Partner Center 대시보드(`Product management -> Manage app names -> Reserve more names`)에서 **`GNUNae - AI Browser`**를 예약해 주시면 `scripts/msstore-certification.js`가 즉시 Microsoft Store 타이틀을 `GNUNae - AI Browser`로 적용합니다.
