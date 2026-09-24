# GnuNae 유지보수 handoff — OpenCode / Antigravity

이 폴더 전체를 다음 하네스에 전달하고 `START-HERE.md`의 프롬프트로 시작한다. 비밀값은 포함하지 않는다. 기존 GitHub Actions가 감시·생성·빌드·배포를 계속 담당하고, 하네스가 변경 검토·수정·검증·PR 인계를 담당한다. 앱 내부 Codex 런타임을 OpenCode/Antigravity로 교체하는 작업이 아니다.

## 확인된 기준과 현재 상태

2026-09-22 미국 동부 시간 기준으로 로컬 코드, 원격 GitHub API, 최근 Actions 결과를 확인했다. 과거 대화 전체는 제공되지 않았으므로 아래 절차는 저장소의 현재 코드와 문서로 재구성했다.

| 항목 | 확인 결과 |
|---|---|
| 저장소 | https://github.com/fkiller/GnuNae · 기본 브랜치 `main` |
| 원격 기준 | `e6ad5b4989ecc7cd3a5364434037e4fda1d90ac7` · 앱 `1.1.5` |
| 기존 로컬 | `/Users/wondong/Projects/GnuNae` · HEAD `7aafcf9` · main보다 6 commits 뒤 · 인계 파일 추가 전 clean |
| 원격 Codex pin | `0.146.0` (로컬 이전 checkout은 `0.144.3`) |
| 기타 원격 pin | MCP `0.0.70`, Playwright `1.59.1`, 내장 Node `22.21.1`; 매 실행 재확인 |
| 개발 셸 | Node `20.19.6`; CI는 Node 22. 하네스 셸에서도 Node 22 사용 |
| GitHub | 로컬 `gh` API 접근 성공; repository admin/push/pull 권한 확인 |
| 하네스 | OpenCode 실행 파일 발견; Antigravity CLI는 PATH에서 발견하지 못함. GUI 설치 여부는 미확인 |
| 최신 store report | Windows Published, MAS 1.1.5 READY_FOR_SALE, 최신 build VALID |
| 모델 자동화 | 2026-09-21 생성/검사 성공 후 **PR 생성 단계 실패** |

근거: [Store 보고서 #48](https://github.com/fkiller/GnuNae/issues/48), [모델 업데이트 실패 run](https://github.com/fkiller/GnuNae/actions/runs/35622098966), [Maintenance Watch 성공 run](https://github.com/fkiller/GnuNae/actions/runs/35629905385), [최근 Release 성공 run](https://github.com/fkiller/GnuNae/actions/runs/30839110269).

과거 “macOS가 아니며 origin/gh가 없다”는 기록은 다른 실행 환경의 한계다. 현재 Mac에는 origin, gh, 로컬 credential 파일이 있다. 다만 파일 존재가 signing 가능·유효기간 정상임을 보장하지 않는다.

## 유지할 자동화와 하네스의 주기적 업무

| 기존 자동화 | 일정(UTC) | 하네스 업무 |
|---|---|---|
| `codex-models.yml` | 월요일 09:17 | 생성 브랜치/PR 확인, Codex·모델 변경 검토, 빌드·Docker 검증 |
| `maintenance-watch.yml` | 월요일 11:23 | 의존성/Node/Electron/Actions/웹사이트 advisory issue 분류 |
| `.github/dependabot.yml` | 매주 | 기존 PR #33/#34 포함 업데이트 PR 검토; 중복 PR 방지 |
| `store-status-watch.yml` | 매 6시간 :17 | 실패·거절·credential 오류가 생길 때만 후속 조치 |
| `ci.yml` | main PR/push, 수동 | Windows/macOS/Linux build와 모델 검사 확인 |
| `docker.yml` | Docker 경로 PR/main push, 태그, 수동 | Native와 Virtual의 pin·빌드·이미지 일치 확인 |
| `release.yml` | `v*` 태그 / 수동 | 상시 유지보수 승인 하에 릴리스 태그 생성 및 배포 파이프라인 실행/모니터링 |

권장 하네스 실행 주기: 매주 1회(기본 7일 주기).
이 전 주기 유지보수는 상시 유지보수 승인 하에 무인(non-interactive) 단일 루틴으로 자동화되어 있습니다:
- 실행 스크립트: `scripts/run-weekly-maintenance.sh` (`scripts/weekly-maintenance-runner.js`)
- 스케줄러: macOS `launchd` LaunchAgent (`~/Library/LaunchAgents/com.gnunae.weekly-maintenance.plist`) 및 Antigravity daemon cron (`0 9 * * *`)
- 누락/지연 자동 실행(Catch-up): 시스템이 꺼져 있거나 잠자기 상태로 인해 주간 due date(7일)가 경과한 경우, 시스템 부팅/로그인 시(`RunAtLoad: true`) `~/.gnunae/maintenance-state.json`을 검사하여 초과된 주간 작업을 즉시 자동 수행합니다.
- 수동 즉시 실행: `./scripts/run-weekly-maintenance.sh --force`
- 일정 도래 확인만: `./scripts/run-weekly-maintenance.sh --check-due`

## 한 번의 유지보수 실행 절차

1. 루트 `AGENTS.md`, 이 문서, `CREDENTIALS.md`, 기존 `docs/PERIODIC_MAINTENANCE.md`, `docs/codex-model-runtime.md`, `docs/test-matrix.md`를 읽는다. 충돌하면 코드·CI가 우선이다.
2. `python3 docs/handoff/preflight.py --repo . --github`를 실행한다. 외부 전달본이면 해당 `preflight.py`의 절대경로를 사용한다. status, HEAD, Node, GitHub 접근과 secret **이름**만 확인한다. 실패/미확인을 성공으로 간주하지 않는다.
3. 기존 dirty 파일을 보존한다. `git fetch origin` 후 `origin/main`에서 별도 유지보수 브랜치 또는 worktree를 만든다. 기존 로컬 main은 6 commits 뒤이므로 그대로 버전 변경을 시작하지 않는다. 새 checkout에는 이 handoff도 전달한다. `.env.local`과 `certs/`는 자동 복사되지 않으며 일반 업데이트에는 필요 없다.
4. `gh pr list -R fkiller/GnuNae`, `gh issue list -R fkiller/GnuNae`, `gh run list -R fkiller/GnuNae`로 기존 작업을 먼저 확인한다. `automation/openai-model-pipeline`은 주간 workflow 소유 브랜치이므로 수동 변경을 덮어쓰지 않는다. 검토할 SHA를 고정하거나 별도 브랜치를 사용한다.
5. 공식 upstream changelog와 `npm outdated --json`로 후보를 정한다. `npm outdated`의 exit 1은 outdated 항목 존재일 수 있다. `npm update`/`npm audit fix --force` 일괄 실행은 피하고 버전·breaking change·보안 영향별로 묶는다. Electron/Node major나 signing 관련 변경은 별도 검토한다.
6. 아래 업데이트·검증 절차를 수행하고 문서 영향도를 함께 반영한다. 기존 생성 PR이 있으면 새 중복 PR 대신 그 변경을 검토한다.
7. `git diff --check`, diff, status를 확인하고 대상 파일만 stage한다. 루트 AGENTS의 PR 양식으로 변경 이유·upstream 링크·Native/Docker·검증·미확인 사항을 작성한다.
8. 상시 유지보수 승인 하의 완료 범위는 변경 검증, PR 머지, 앱 버전 패치 bump, 릴리스 태그(`v*`) 푸시, 그리고 GitHub Release·GHCR·MAS·Microsoft Store 파이프라인의 전체 실행 및 결과 확인(심사 대기 상태 추적 포함)까지다. 각 일상적인 단계마다 중단하지 않고 자율적으로 파이프라인 실패를 해결하며 최종 보고서를 작성한다.

### Codex / 모델 업데이트

Node 22를 사용하고 registry에서 후보 버전을 한 번 결정해 명시적으로 고정한다. 아래 `TARGET_CODEX`는 먼저 실제 검토 버전으로 설정한다. 조회할 때마다 latest가 달라져 check가 실패하는 것을 피한다.

```bash
npm ci
npm run update:codex-models
# 예: TARGET_CODEX=검토한_실제_버전 (placeholder 그대로 실행하지 않음)
: "${TARGET_CODEX:?Set reviewed Codex version first}"
npm run update:openai-model-pipeline -- --codex-version="$TARGET_CODEX"
npm install --package-lock-only --ignore-scripts
(cd resources/codex && npm install --package-lock-only --ignore-scripts)
(cd resources && npm install --package-lock-only --ignore-scripts)
npm ci
npm run check:codex-models
npm run check:openai-model-pipeline -- --codex-version="$TARGET_CODEX"
npm run check:codex-models-source
npm run build
```

마지막 source 검사는 공식 웹페이지 네트워크 접근이 필요하다. parser 실패를 모델 삭제/임의 하드코딩으로 숨기지 않는다. 생성기가 `src/core/settings.ts`, `scripts/msstore-certification.js`, `docs/certification-notes.html`도 변경할 수 있으므로 단순 버전 bump라고 가정하지 않는다. 모델 이름·reasoning effort·계정 접근·fallback 변화를 검토한다.

| 변경 | 함께 확인할 파일 |
|---|---|
| Codex | root/resources/resources/codex의 package + lock 3쌍, `src/core/runtime-manager.ts`, `scripts/install-codex.js`, `docker/Dockerfile` |
| Playwright MCP | 위 세 package/lock, runtime-manager/install-codex 상수, Docker 전역 pin; root 범위가 실제 다른 버전을 허용하는지 확인 |
| Playwright | root package/lock과 Docker `FROM mcr.microsoft.com/playwright:v…` 버전 일치 |
| Node 내장 runtime | `scripts/download-node.js`, `src/core/runtime-manager.ts`, 패키징 runtime 경로; CI Node와 별개 |
| 모델/default/fallback | `src/core/codex-models.json`, settings, renderer constants, main, Docker API JS/TS, certification notes |
| Electron/MCP SDK/React/Vite 등 | root package/lock, 해당 API 변경과 desktop 동작 |

Docker 영향이 있으면 `npm run build:docker` 실행 또는 PR Docker build 결과를 기록한다. Native prompt + Virtual prompt/browser automation, 로그인, stale runtime/cache, 모델 fallback을 확인한다. Windows stale runtime, macOS 파일 첨부/drag-and-drop, MAS entitlement 동작은 플랫폼별 수동 체크 대상이다. 실행하지 않은 검사는 PASS로 기록하지 않는다.

CI의 3개 OS 검사 결과가 **현재 PR HEAD SHA**와 일치해야 한다. 생성 PR은 workflow 승인을 기다릴 수 있다. check가 아예 없으면 통과가 아니다. 필요하면 비배포 `ci.yml`을 해당 브랜치로 수동 실행하고 run의 SHA를 대조한다. [`GITHUB_TOKEN` 이벤트 동작](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)을 참고한다. Docker workflow 수동 실행은 PR 빌드와 달리 push도 수행하므로 검사 대용으로 무심코 실행하지 않는다.

### 문서와 완료 조건

AGENTS의 documentation map을 따른다. Codex/runtime 변경은 `docs/codex-model-runtime.md`, `docs/PERIODIC_MAINTENANCE.md`, `docs/test-matrix.md`를 갱신하고, packaging/Docker는 `docs/CI_CD_PACKAGING.md`, 사용자 행동 변경은 README를 반영한다. 적용하지 않은 문서는 PR에 이유를 적는다. 별도의 `npm test`/lint script는 현재 없다. 모델 검사와 빌드를 일반 테스트 스위트라고 부르지 않는다.

## 배포와 credential 경계

상시 유지보수 승인 하에서는 검증 완료 후 `npm --ignore-scripts --no-git-tag-version version <patch>`로 버전을 올리고, 웹사이트 다운로드 메타데이터(`docs/index.html`) 동기화 및 빌드 검증 후 main에 반영한다. 이후 `git tag vX.Y.Z && git push origin vX.Y.Z`로 release 및 docker 파이프라인을 트리거한다.

**`npm version patch`를 그대로 실행하지 않는다.** 현재 `postversion`은 `git push && git push --tags`여서 의도치 않은 release를 시작할 수 있으므로, 반드시 `--no-git-tag-version --ignore-scripts` 플래그를 사용하고 명시적인 git tag 명령을 사용한다.

또한 Docker 경로를 main에 merge하면 workflow가 `sandbox:latest`를 갱신하고 클라이언트가 이를 pull한다. 앱 release tag가 없어도 Virtual 사용자에게 영향이 있으므로 Docker 변경은 사전에 로컬 및 CI에서 엄밀히 검증한다.

릴리스 태그 푸시 후 `release.yml`의 matrix build, `build-mas`, `build-msstore`, `release` 및 `docker.yml` 실행을 관찰한다. 기존 버전의 Published를 새 배포 성공으로 오인하지 말고, 각 파이프라인의 새 버전 번호, 빌드 번호, Partner Center 제출 ID를 직접 대조하여 검증한다. 심사 대기 중인 스토어는 "제출 완료·심사 대기" 상태로 기록하고 store-status-watch로 추적한다. 로컬 `npm run deploy:mas`는 CI에서 실패 시의 대체 업로드 수단으로 활용한다.

## 첫 담당자가 이어서 처리할 항목

1. **PR 생성 차단:** run 35622098966에서 `GitHub Actions is not permitted to create or approve pull requests` 확인. repo API는 `can_approve_pull_request_reviews=false`. 생성 브랜치 `automation/openai-model-pipeline`은 `5978aefeb74bd4488a115af1f3d7cd6b3a6fa4ce`까지 push되어 있다. 설정을 임의 변경하지 않고, 기존 브랜치를 검토해 로컬 gh 인증으로 PR 생성하는 경로를 사용할 수 있다. Actions의 PR 생성 권한을 영구 변경하려면 그 설정 변경을 별도 범위로 다룬다. 이 handoff 작업에서는 설정을 바꾸지 않았다.
2. **오래된 Dependabot PR:** #33, #34가 열려 있다. 현재 main과 비교하고 lockfile 및 Native/Docker pin을 함께 검토한다. 오래된 PR을 무조건 merge하지 않는다.
3. **개발 환경:** Mac 셸 Node 20만 확인되었다. 새 하네스에서 Node 22를 선택/준비한다. signing identities는 이번 조회에서 0개였으며 Keychain 접근/잠금/인증서 만료 여부는 미확인이다. GitHub store status credential은 실제 성공 보고서로 검증되었다.
4. **문서 불일치:** 기존 periodic 문서의 `npm version` 예제와 자동 push hook, 과거 Docker image=앱 버전 설명, 모델 데이터 설명은 현재 코드와 비교한다. 이 문서의 안전한 유지보수 절차를 우선한다.

## 이번 handoff 자체의 검증 범위

원격 main archive에서 `check-codex-models.js`, `update-openai-model-pipeline.js --check --codex-version=0.146.0` 통과. GitHub read API, repository secret 이름 30개, github-pages environment secret 목록(0개), workflow 상태 확인. preflight의 secret sentinel 비노출·잘못된 repo 실패 경로도 검증했다. 비밀값 export·secret 교체·배포·권한 설정 변경은 수행하지 않았다. 앱 dependency와 runtime 코드도 변경하지 않았으므로 전체 앱 빌드·실제 새 하네스 실행·서명/배포 인수 테스트는 이번 검증 범위에 포함되지 않는다. `PREFLIGHT-RESULT.json`은 기존 로컬 checkout의 검사 결과이며 원격 main 검사와 구분한다.
