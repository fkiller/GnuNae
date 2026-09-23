# GnuNae maintenance run

- 일시 / 하네스 / host / OS:
- 기준 origin/main SHA / 작업 HEAD SHA / branch:
- Node/npm 버전 / preflight 결과:
- 확인한 issue / 기존 PR / workflow run:
- 이번 범위 / no-op 여부:

| 구성요소 | 이전 버전 | 목표 버전 | upstream 근거 | Native/Docker 영향 |
|---|---|---|---|---|
| | | | | |

## Summary
## What I inspected
## Files changed
## Verification

| 명령 또는 수동 검사 | PASS / FAIL / NOT RUN | HEAD SHA / run 링크 / 이유 |
|---|---|---|
| npm ci | | |
| npm run check:codex-models | | |
| 명시한 target 버전의 pipeline check | | |
| npm run check:codex-models-source | | |
| npm run build | | |
| Docker build | | |
| CI Windows / macOS / Linux | | |
| Native / Virtual 실제 prompt·browser automation | | |

별도 npm test/lint는 현재 없다. 적용하지 않은 검사는 이유를 적는다.

## Release and store results

| 배포 채널 | 버전 / 빌드 / ID | 상태 | run URL / 세부 정보 |
|---|---|---|---|
| GitHub Release | 태그: `vX.Y.Z` | | release assets (.dmg, .zip, .AppImage, .deb) |
| GHCR Docker Image | `sandbox:vX.Y.Z`, `latest` | | digest / pull 확인 |
| Mac App Store (MAS) | App Store version: `X.Y.Z`, Build: `...` | | `releaseType=AFTER_APPROVAL` / 제출 상태 |
| Microsoft Store | APPX version: `X.Y.Z.0`, Submission ID: `...` | | Partner Center 심사 대기 상태 |

> 과거 버전의 Published 상태가 아닌, 이번 실행에서 새로 생성된 버전/빌드/제출 ID를 기록합니다. 심사 대기 중인 스토어 항목은 "제출 완료·심사 대기"로 명시합니다.

## Native and Docker impact
## Stale docs or conflicts found
## Manual confirmation needed
## Deferred / Unfinished updates
- 보류/미반영 항목 및 구체적 사유:

## Summary & Next steps
- commit SHA / tag:
- credential 상태: 필요한 **이름과 저장 위치, 검증 여부만**. 값 금지.
- store-status-watch 추적 계획:
