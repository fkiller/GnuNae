# GnuNae maintenance run

- 일시 / 하네스 / host / OS: 2026-11-01T14:53:10.397Z / Antigravity / macOS (darwin-arm64)
- 기준 origin/main SHA / 작업 HEAD SHA / branch: `433b6e196ce32403b160e49da6a7d028f7f74f33` / `maintenance/auto-weekly` -> `main`
- Node/npm 버전 / preflight 결과: Node v22.23.2, npm 10.9.8 / Preflight passed
- 확인한 issue / 기존 PR / workflow run:
  - Issue [#48](https://github.com/fkiller/GnuNae/issues/48) ("Store status watch")
  - Release workflow run [41315744626](https://github.com/fkiller/GnuNae/actions/runs/41315744626) (tag `v1.1.11`)
  - Docker Build workflow run [41315744624](https://github.com/fkiller/GnuNae/actions/runs/41315744624) (tag `v1.1.11`)
- 이번 범위 / no-op 여부: Upstream @openai/codex 0.166.0 CLI 동기화, Docker sandbox 패리티 빌드, GnuNae v1.1.11 패치 릴리즈

| 구성요소 | 이전 버전 | 목표 버전 | upstream 근거 | Native/Docker 영향 |
|---|---|---|---|---|
| `@openai/codex` | 0.164.0 | 0.166.0 | `npm view @openai/codex version` -> 0.166.0 | Native 런타임 핀 동기화 및 Dockerfile 패리티 빌드 |
| GnuNae App | 1.1.10 | 1.1.11 | 주간 정기 유지보수 및 릴리즈 주기 | 앱 버전 bump, website 메타데이터(`docs/index.html`) 동기화 |
| GHCR Docker sandbox | v1.1.10 / latest | v1.1.11 / latest | Codex 0.166.0 패리티 | `ghcr.io/fkiller/gnunae/sandbox:latest` 및 `v1.1.11` |
| Microsoft Store | 1.1.10 | 1.1.11 | Windows APPX 패키징 및 Partner Center 자동 제출 | CI 빌드 및 제출 트리거 |

## Summary
- 주간 정기 유지보수 스케줄러 실행에 착수했습니다.
- 작업 공간 격리 규칙에 따라 루트 작업 디렉터리를 일체 수정하지 않고 `.worktrees/weekly-maintenance`에서 `origin/main` 기반으로 작업을 완벽히 격리했습니다.
- 업스트림 `@openai/codex` CLI 최신 버전 0.166.0를 감지하여 모델 파이프라인, 의존성 락파일, 런타임 매니저, Dockerfile, 설치 스크립트 및 런타임 문서를 동기화했습니다.
- 로컬 `npm ci`, 모델 무결성 검사, TypeScript 빌드, Vite UI 번들링, Docker 컨테이너 이미지 빌드 검증을 모두 수행했습니다.
- `v1.1.11` 패치 버전을 생성하고 태그를 origin에 푸시하여 CI/CD 배포 파이프라인(`release.yml`, `docker.yml`)을 가동했습니다.
- `store-status-watch.yml` 워크플로를 트리거하여 Issue #48 상태를 갱신했습니다.

## Verification

| 명령 또는 수동 검사 | PASS / FAIL / NOT RUN | HEAD SHA / run 링크 / 이유 |
|---|---|---|
| npm ci | PASS | Node 22 환경 패키지 정상 정렬 |
| npm run check:codex-models | PASS | 기본 모델 매니페스트 정합성 확인 |
| npm run check:openai-model-pipeline -- --codex-version=0.166.0 | PASS | 모든 구성요소의 0.166.0 핀 정합성 확인 |
| npm run build | PASS | TypeScript(`tsc`) + Vite UI 번들 정상 생성 |
| Docker build (npm run build:docker) | PASS | 로컬 Docker 샌드박스 빌드 성공 |
| CI Docker Build (docker.yml) | WATCHED | [Run 41315744624](https://github.com/fkiller/GnuNae/actions/runs/41315744624) |
| CI Release (release.yml) | WATCHED | [Run 41315744626](https://github.com/fkiller/GnuNae/actions/runs/41315744626) |
| Store Status Watch (Issue #48) | PASS | Issue #48 최신화 트리거 완료 |

## Release and store impact
- **GHCR Docker Sandbox**: `ghcr.io/fkiller/gnunae/sandbox:latest` 및 `v1.1.11` 빌드/푸시 트리거.
- **Microsoft Store (Windows)**: `build-msstore`를 통한 APPX 빌드 및 Partner Center 패키지 제출 트리거.
- **Mac App Store**: `build-mas`를 통한 altool 업로드 트리거.

## Native and Docker impact
- Native 모드: 번들 및 런타임 매니저가 `@openai/codex@0.166.0`를 사용하도록 업데이트되었습니다.
- Docker Virtual 모드: 컨테이너 Dockerfile의 베이스 패키지가 `@openai/codex@0.166.0`로 갱신되었습니다.
