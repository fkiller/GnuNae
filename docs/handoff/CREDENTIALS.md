# Credential 인수인계

## 원칙과 권한 경계

이 handoff는 비밀값 복제본이 아니라 기존 credential의 사용 계약이다. 같은 Mac·같은 OS 사용자에서 실행되는 OpenCode/Antigravity는 기존 `gh`, 파일 및 Keychain 접근을 사용할 수 있다. 하네스 sandbox/GUI 프로세스가 별도 HOME/PATH를 쓰면 접근이 달라지므로 **하네스 내부 터미널에서** preflight를 다시 실행한다. 실패하면 필요한 경로/권한만 해결하고 전체 credential 폴더를 prompt에 첨부하지 않는다.

GitHub Actions secret은 repository 설정에 남는다. 하네스 교체나 같은 repo의 새 clone으로 재등록할 필요가 없다. GitHub API/`gh secret list`는 이름·갱신 시점 확인용이며 기존 비밀값을 역으로 다운로드하는 수단이 아니다. `credential-inventory.json`에는 이름·위치·존재 여부만 기록했다. 조직 secret은 별도 조사하지 않았고 현재 성공 경로를 제공하는 repository secret과 github-pages environment만 확인했다.

## 현재 위치와 실제 확인 범위

| 용도 | 위치 / 이름 | 새 하네스의 사용법 / 확인 결과 |
|---|---|---|
| GitHub 작업 | `gh` 인증 저장소, `~/.config/gh/hosts.yml` 설정 존재 | 같은 사용자로 `gh api repos/fkiller/GnuNae`; 2026-09-22 성공. token 저장 방식/값은 읽지 않음 |
| 로컬 설정 | `/Users/wondong/Projects/GnuNae/.env.local` | 변수명 17개 populated. 기존 deploy/load-env 스크립트가 읽음. 일반 build에는 주입 불필요 |
| Apple 인증서/profile | checkout `certs/application.p12`, `installer.p12`, `notappstore.p12`, `GnuNae.provisionprofile` | 존재 확인. 각 파일과 GitHub secret의 내용 동일성/유효기간은 미검증 |
| Apple signing identity | macOS Keychain | 이번 `security find-identity -v -p codesigning` 조회에서 유효 identity 0개. 잠금/접근권한/설치/만료 확인 필요; 로컬 signing 준비 완료로 간주하지 않음 |
| ASC API 개인키 | `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` | `.p8` 1개 존재. preflight는 로컬 key ID와 일치하는 파일 존재 여부만 확인 |
| GnuNae Codex 로그인 | `~/.codex/auth.json` | 존재만 확인. 앱 Native/Virtual 인증용이며 OpenCode/Antigravity provider 인증과 별개 |
| 빌드/스토어 | repository Actions secrets | 아래 mapping. store-status 실제 API 조회 성공; 모든 인증서의 향후 유효성을 보장하지 않음 |

`.env.local`의 `AZURE_*`를 `MSSTORE_*`로 이름만 바꿔 재사용하지 않는다. 이 Mac에는 `MSSTORE_TENANT_ID`, `MSSTORE_CLIENT_ID`, `MSSTORE_CLIENT_SECRET`가 .env.local에 없지만 GitHub에는 있다. 일반 업데이트는 이 로컬 결손과 무관하며 Store 조회/배포는 기존 Actions 경로를 쓴다. 현재 Windows 배포는 MS Store APPX이고 Azure signing secrets는 workflow에서 참조되지 않는 잔존 설정이다.

## GitHub secret → 소비자 mapping

| Secret 이름 | 소비 경로 | 상태 / 형태 |
|---|---|---|
| `BUILD_AUTHOR_NAME`, `BUILD_AUTHOR_EMAIL`, `BUILD_PUBLISHER_NAME` | release build config injection | 모두 등록 |
| `APPLE_DEVELOPER_ID_APPLICATION_P12` | release mac DMG/ZIP signing | 등록; workflow가 base64 decode |
| `APPLE_CERTIFICATE_APPLICATION_P12`, `APPLE_CERTIFICATE_INSTALLER_P12`, `APPLE_PROVISIONING_PROFILE` | release MAS signing | 모두 등록; base64 자료 |
| `APPLE_CERTIFICATE_PASSWORD` | Apple cert import; 현재 Linux GPG passphrase에도 연결 | 등록; 이름만으로 Apple 전용이라 가정하지 말 것 |
| `APPLE_TEAM_ID`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` | release Apple signing/notarization | 모두 등록 |
| `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`, `ASC_API_PRIVATE_KEY_BASE64` | MAS upload/review, store-status | 모두 등록; 개인키 base64 대안 사용 |
| `ASC_API_PRIVATE_KEY` | 위 소비자의 plain PEM 대안 | 미등록; base64 대안이 있으므로 결손 아님 |
| `APP_STORE_CONNECT_APP_ID`, `APP_STORE_CONNECT_BUNDLE_ID` | MAS submit/status 선택적 lookup | 미등록; 코드의 bundle ID/lookup fallback 확인 |
| `APP_STORE_USES_NON_EXEMPT_ENCRYPTION` | MAS review 제출 설정 | 미등록; 해당 release 실행 때 코드 기본값과 앱 요구 확인 |
| `MSSTORE_TENANT_ID`, `MSSTORE_CLIENT_ID`, `MSSTORE_CLIENT_SECRET`, `MSSTORE_SELLER_ID`, `MSSTORE_PRODUCT_ID` | release, store-status, certification dry-run | 모두 등록; 상태 조회 성공 |
| `MSSTORE_PUBLISHER_CN` | APPX manifest/package identity | 등록; 변경하지 않음 |
| `MSSTORE_CERTIFICATION_TEST_ACCOUNT_NOTE` | 선택적 certification notes | 미등록; 필요한 경우 별도 준비 |
| `GPG_PRIVATE_KEY` | Linux release packaging | 등록; 정확한 처리 경로는 release.yml 기준 |
| `MS365_TENANT_ID`, `MS365_CLIENT_ID`, `MS365_CLIENT_SECRET`, `MS365_SENDER_USER` | 수동 store appeal 메일 | 모두 등록; 정기 유지보수는 send 불가. 별도 명시적 발송 요청 필요 |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_CODE_SIGNING_NAME`, `AZURE_CERT_PROFILE_NAME` | 현재 workflows에서 참조 없음 | 등록 유지; handoff 중 삭제/회전 안 함 |
| `GITHUB_TOKEN` | Actions의 GHCR / PR / release 권한 | GitHub가 job에 제공; 저장된 repo secret 목록에 없어도 정상 |

총 repository secret 30개. `github-pages` environment secret 0개. 등록 여부와 실제 권한·만료·scope는 별개다. preflight는 최신 workflow 참조와 목록을 비교하지만 모든 absent 항목을 실패로 취급하지 않는다.

## 같은 Mac에서 이어받기

1. 기존 checkout과 같은 OS 계정으로 실행하고 repo 접근 및 `gh` API 성공을 확인한다. GUI PATH에 nvm/homebrew가 누락되면 해당 터미널의 PATH/Node를 설정한다. shell init 파일 전체를 출력할 필요는 없다.
2. 일반 의존성/모델 PR에는 `.env.local`, Apple key, Codex auth를 모델 입력이나 npm install 환경에 전달하지 않는다.
3. 승인된 로컬 MAS 작업만 기존 `scripts/deploy-mas.js`를 사용한다. 이 스크립트가 .env.local 및 표준 ASC key 경로를 처리한다. `scripts/load-env.js`를 환경 로더로 실행하면 electron-builder가 시작되므로 단순 preflight용으로 실행하지 않는다. 이 파일은 publisher CN debug 출력도 포함하므로 raw 로그 공유에 주의한다.
4. 새 worktree/clone에 ignored credential은 따라오지 않는다. 기존 Mac checkout에서 signing하거나, 승인된 signing 전용 checkout에 필요한 파일만 안전하게 연결한다. 일반 유지보수 worktree에는 secret을 복사할 필요가 없다.
5. `.env.local` 및 private cert 파일은 소유자 전용 권한을 권장한다. 발견한 p12 파일들은 0644였다. 이번 handoff는 기존 파일 권한을 변경하지 않았다. 파일 권한 강화는 소유자와 다른 실제 사용 프로세스를 확인해 수행한다.

## 다른 컴퓨터로 옮길 때

유지보수/Actions 방식: repo clone → Node 22 및 gh 설치 → `gh auth login` → 같은 repo 권한 확인 → preflight. **GitHub secret을 새 하네스의 secret store로 export하지 않는다.** 로컬 `auth.json`이나 gh 저장소를 통째로 복사하는 대신 새 장치에서 로그인한다.

로컬 signing까지 반드시 이전해야 하는 경우에만:

- 소유자가 관리하는 암호화 전송/비밀 관리 채널로 필요한 p12, profile, ASC p8와 필요한 .env.local 항목을 전달한다. 평문 zip, git, 채팅, 로그를 사용하지 않는다. 이 handoff에는 전송 대상 장치가 지정되지 않아 실제 파일 전송은 수행하지 않았다.
- 목적지 Mac의 Keychain으로 signing certificate/private key를 설치하고 identity와 인증서 만료, team/profile/bundle ID 일치를 검증한다. p12 파일 존재만으로 준비 완료가 아니다.
- ASC p8는 key ID와 맞는 표준 경로에 두고 restrictive permissions를 적용한다. private key를 조회/출력하는 검증을 하지 않는다.
- 원본을 삭제하거나 secret을 회전하지 않는다. 먼저 승인된 대상에서 검증을 마친다. 키를 잃어버린 경우 GitHub의 기존 값 복구를 시도하지 말고 소유자가 Apple/Microsoft에서 재발급·회전하는 별도 작업으로 다룬다.

## 검증 명령

```bash
python3 docs/handoff/preflight.py --repo . --github
gh secret list -R fkiller/GnuNae
gh run list -R fkiller/GnuNae --workflow store-status-watch.yml -L 3
gh issue view 48 -R fkiller/GnuNae
```

기존 report가 오래되었다면 허용된 read-only store-status 경로만 사용한다. `appeal_mode=send`, release dispatch, secret set/delete는 credential 검증 명령이 아니다. `gh auth token`, `env`, `printenv`, `cat .env.local`, `cat auth.json`, Keychain secret dump, shell tracing(`set -x`)를 실행하거나 보고서에 넣지 않는다.
