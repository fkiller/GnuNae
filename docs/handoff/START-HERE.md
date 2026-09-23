# 새 하네스 시작

## 같은 Mac에서

OpenCode는 `/Users/wondong/Projects/GnuNae`에서 실행한다. Antigravity는 이 폴더를 workspace로 연다. 아래 프롬프트를 입력하고, 가장 먼저 handoff를 읽었다는 응답과 preflight 결과를 확인한다. OpenCode는 [AGENTS.md 규칙](https://opencode.ai/docs/rules/)을 지원한다. Antigravity의 자동 규칙 탐색에는 의존하지 않고 명시적으로 파일을 읽게 한다. 하네스 자체의 모델/provider 로그인은 각 제품에서 따로 설정하며 GnuNae의 Codex auth 파일을 변환해서 주입하지 않는다.

아래 경로는 저장소에 설치된 사본 기준이다. 전달본만 받았다면 `docs/handoff/`를 전달 폴더의 실제 경로로 바꾼다.

```text
GnuNae의 정기 유지보수를 수행하라. 앱 안의 Codex는 유지하고, 너는 기존 Codex 유지보수 담당자의 작업을 이어받는다.

먼저 루트 AGENTS.md와 docs/handoff/README.md, CREDENTIALS.md, RUN-REPORT-TEMPLATE.md를 읽고, python3 docs/handoff/preflight.py --repo . --github를 실행하라.
현재 main·열린 PR·maintenance/store issue·Actions 실행을 다시 확인하고, 최신 origin/main 기준 별도 브랜치에서 작업하라. 사용자 dirty 변경을 보존하라.

Codex/모델, Playwright/MCP, Electron/Node 및 기타 의존성의 변경을 공식 upstream 자료와 비교하라. 기존 자동 생성/Dependabot PR을 먼저 검토하고 중복 PR을 만들지 마라. 버전 pin과 root/resources/resources/codex lockfiles, Native/Docker를 함께 맞추고 모델 검사·빌드·필요한 Docker 검증 및 문서 갱신을 완료하라.

상시 유지보수 승인 하에서 하네스는 변경 검증부터 PR merge, 앱 버전 bump, release tag 생성/푸시, 릴리스 파이프라인(GitHub Release, GHCR Docker sandbox, Mac App Store, Microsoft Store) 실행 및 결과 확인까지의 전체 주기를 자율적으로 완수한다. 일상적인 단계마다 확인을 요청하지 말고, 실패 발생 시 이를 적극적으로 해결하라.

GitHub secret 값은 조회/복사하지 말고 기존 Actions에서 계속 사용하라. 같은 Mac의 gh 인증은 재사용하되 credential 본문을 출력하지 마라. signing credential은 dependency 업데이트에 주입하지 마라. 앱 identity/entitlement/workflow 정의는 임의로 변경하지 마라.
일반 npm version에는 자동 tag push hook이 있으므로 `npm --ignore-scripts --no-git-tag-version version patch`를 사용하여 버전을 올리고, 웹사이트(`docs/index.html`) 메타데이터를 맞춘 뒤 명시적으로 `v*` git tag를 푸시하라.

알려진 모델 pipeline PR 생성 권한 실패를 다시 확인하고, 아직 유효하면 생성 브랜치를 검토한 뒤 기존 gh 인증으로 PR을 만들어 이어가라. automation 브랜치는 다음 schedule이 덮어쓸 수 있으므로 검토한 SHA를 기록하고 필요하면 별도 유지보수 브랜치를 사용하라. CI가 없거나 approval 대기이면 통과로 처리하지 마라.

작업 끝에 기준 SHA, 새 앱 버전, 각 파이프라인(GitHub Release, GHCR, MAS, MS Store)의 실제 빌드 번호 및 제출 ID를 대조하여 단일 최종 보고서를 작성하라. 기존 버전의 Published 상태를 이번 배포의 성공으로 오인하지 말며, 심사 대기 중인 항목은 "제출 완료·심사 대기"로 명시하고 기존 감시 경로로 추적하라.
```

## 다른 컴퓨터 / 다른 OS에서

동일 GitHub repo를 clone하고 이 폴더를 전달한다. `gh auth login`으로 해당 장치에 로그인한 뒤 preflight를 다시 실행한다. GitHub Actions secrets는 원래 repository에 남으므로 개인키를 새 컴퓨터로 옮길 필요가 없다. Linux/Windows 하네스에서도 PR 작업과 Actions 관찰은 가능하다. 로컬 MAS 업로드만 macOS 전용이다. 상세 credential별 이동 조건은 `CREDENTIALS.md`에 있다.

## 반복 실행

GitHub 자동화 일정은 유지된다. 이 프롬프트는 매주 재사용할 수 있지만 OpenCode/Antigravity를 자동 호출하는 스케줄러는 이 전달본에 설치되어 있지 않다. 어느 하네스를 최종 선택하든 첫 수동 실행에서 파일 읽기·gh 접근·Node 22·PR 검증 경로를 확인한 다음 해당 실행 환경의 스케줄러에 동일 작업을 등록한다. 기존 생성 workflow를 중복 실행하는 새 updater를 만들지 않는다.
