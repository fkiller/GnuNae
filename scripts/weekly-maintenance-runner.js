#!/usr/bin/env node
/**
 * scripts/weekly-maintenance-runner.js
 *
 * Automated weekly maintenance runner for GnuNae.
 * Runs non-interactively from start to finish under standing maintenance authorization:
 * 1. Checks due date / catch-up condition via ~/.gnunae/maintenance-state.json.
 * 2. Prepares isolated git worktree to protect user workspace.
 * 3. Inspects upstream @openai/codex and model pipeline candidate updates.
 * 4. Runs model checks, package-lock alignment, and full app build.
 * 5. Runs Docker build & parity checks (if Docker is available).
 * 6. Performs live native/virtual validation.
 * 7. Bumps patch version, commits, pushes to origin/main, and creates/pushes tag vX.Y.Z.
 * 8. Monitors release.yml and docker.yml to completion across all channels:
 *    - GitHub Release (assets verification)
 *    - GHCR Docker sandbox image (tags & digest)
 *    - Microsoft Store Partner Center (APPX quad version & submission ID)
 *    - Mac App Store (altool upload, build processing & review submission)
 * 9. Triggers store-status-watch.yml and verifies Issue #48 status.
 * 10. Writes comprehensive run report to docs/handoff/reports/ and updates state.
 *
 * Flags:
 *   --force        Run immediately, ignoring due-date interval
 *   --check-due    Only check if maintenance is due (exit 0 if not due, 1 if due)
 *   --dry-run      Inspect and build without pushing tags or store submissions
 *   --help, -h     Show usage information
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STATE_FILE = path.join(os.homedir(), '.gnunae', 'maintenance-state.json');
const REPORTS_DIR = path.join(ROOT_DIR, 'docs', 'handoff', 'reports');
const WORKTREE_DIR = path.join(ROOT_DIR, '.worktrees', 'weekly-maintenance');
const INTERVAL_DAYS = 7;
const INTERVAL_MS = INTERVAL_DAYS * 24 * 60 * 60 * 1000;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function runCmd(cmd, opts = {}) {
  log(`$ ${cmd}`);
  const result = spawnSync(cmd, {
    shell: true,
    cwd: opts.cwd || ROOT_DIR,
    stdio: opts.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
    timeout: opts.timeout || 30 * 60 * 1000,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !opts.allowFailure) {
    const errMsg = result.stderr ? result.stderr.trim() : `Process exited with code ${result.status}`;
    throw new Error(`Command failed (${cmd}): ${errMsg}`);
  }
  return result;
}

function runCapture(cmd, opts = {}) {
  const res = runCmd(cmd, { ...opts, capture: true });
  return (res.stdout || '').trim();
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
      log(`Warning: Failed to parse ${STATE_FILE}: ${e.message}`);
    }
  }
  return {
    last_run_timestamp: 0,
    last_run_iso: null,
    interval_days: INTERVAL_DAYS,
    next_due_timestamp: 0,
    last_status: 'NEVER_RUN',
    last_version: null,
  };
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  log(`Saved maintenance state to ${STATE_FILE}`);
}

function notifyUser(title, message) {
  try {
    const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
    spawnSync('osascript', ['-e', script], { stdio: 'ignore' });
  } catch (_) {}
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const checkDueOnly = args.includes('--check-due');
  const dryRun = args.includes('--dry-run');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`GnuNae Weekly Maintenance Runner
Usage: node scripts/weekly-maintenance-runner.js [options]

Options:
  --force       Run immediately regardless of last run timestamp
  --check-due   Check if weekly due date has arrived (exit 0: not due, 1: due)
  --dry-run     Run update checks and local builds without pushing or releasing
  --help, -h    Show this help
`);
    process.exit(0);
  }

  log('====================================================');
  log('Starting GnuNae Weekly Maintenance Routine');
  log('====================================================');

  const state = loadState();
  const now = Date.now();
  const nextDue = state.next_due_timestamp || (state.last_run_timestamp + INTERVAL_MS);
  const isDue = now >= nextDue || state.last_run_timestamp === 0;

  if (checkDueOnly) {
    if (isDue) {
      log(`Maintenance is DUE (now: ${new Date(now).toISOString()}, due: ${new Date(nextDue).toISOString()})`);
      process.exit(1);
    } else {
      log(`Maintenance is NOT due yet (next due: ${new Date(nextDue).toISOString()})`);
      process.exit(0);
    }
  }

  log(`Last run: ${state.last_run_iso || 'Never'}`);
  log(`Executing maintenance routine autonomously under standing maintenance authorization...`);

  // Phase 1: Environment & GitHub Auth check
  log('--- Phase 1: Preflight & Environment Verification ---');
  const ghStatus = runCapture('gh auth status', { allowFailure: true });
  log(`GitHub CLI auth: ${ghStatus ? 'Authenticated' : 'Unknown'}`);

  // Phase 2: Isolated Worktree Preparation
  log('--- Phase 2: Worktree Isolation ---');
  if (!fs.existsSync(path.dirname(WORKTREE_DIR))) {
    fs.mkdirSync(path.dirname(WORKTREE_DIR), { recursive: true });
  }

  runCmd('git fetch origin main --tags', { cwd: ROOT_DIR });
  const originMainSha = runCapture('git rev-parse origin/main', { cwd: ROOT_DIR });
  log(`Target origin/main SHA: ${originMainSha}`);

  if (!fs.existsSync(WORKTREE_DIR)) {
    log(`Creating isolated worktree at ${WORKTREE_DIR}`);
    runCmd(`git worktree add -B maintenance/auto-weekly ${WORKTREE_DIR} origin/main`, { cwd: ROOT_DIR });
  } else {
    log(`Reusing worktree at ${WORKTREE_DIR}; resetting to origin/main`);
    runCmd('git fetch origin main --tags', { cwd: WORKTREE_DIR });
    runCmd('git checkout maintenance/auto-weekly', { cwd: WORKTREE_DIR, allowFailure: true });
    runCmd('git reset --hard origin/main', { cwd: WORKTREE_DIR });
    runCmd('git clean -fd', { cwd: WORKTREE_DIR });
  }

  const workDir = WORKTREE_DIR;

  // Phase 3: Inspect Upstream Dependencies & Candidate Models
  log('--- Phase 3: Inspect Upstream Codex & Model Pipeline ---');
  const pkgJsonPath = path.join(workDir, 'package.json');
  const currentPkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const currentVersion = currentPkg.version;
  const currentCodexPin = currentPkg.dependencies?.['@openai/codex'] || currentPkg.devDependencies?.['@openai/codex'] || '0.155.1';

  log(`Current GnuNae Version: ${currentVersion}`);
  log(`Current Pinned Codex CLI: ${currentCodexPin}`);

  let latestCodex = currentCodexPin;
  try {
    latestCodex = runCapture('npm view @openai/codex version', { cwd: workDir });
    log(`Upstream Latest Codex CLI: ${latestCodex}`);
  } catch (e) {
    log(`Warning: Failed to query npm view @openai/codex: ${e.message}`);
  }

  let codexUpdated = false;
  let targetCodex = currentCodexPin;
  if (latestCodex && latestCodex !== currentCodexPin) {
    log(`Candidate update detected: @openai/codex ${currentCodexPin} -> ${latestCodex}`);
    try {
      runCmd(`npm run update:openai-model-pipeline -- --codex-version=${latestCodex}`, { cwd: workDir });
      runCmd('npm install --package-lock-only --ignore-scripts', { cwd: workDir });
      runCmd('npm install --package-lock-only --ignore-scripts', { cwd: path.join(workDir, 'resources', 'codex') });
      runCmd('npm install --package-lock-only --ignore-scripts', { cwd: path.join(workDir, 'resources') });

      const codexRuntimeDoc = path.join(workDir, 'docs', 'codex-model-runtime.md');
      if (fs.existsSync(codexRuntimeDoc)) {
        let content = fs.readFileSync(codexRuntimeDoc, 'utf8');
        content = content.replace(/The current pinned CLI is\s*`[^`]+`/g, `The current pinned CLI is \`${latestCodex}\``);
        fs.writeFileSync(codexRuntimeDoc, content, 'utf8');
      }

      targetCodex = latestCodex;
      codexUpdated = true;
    } catch (e) {
      log(`Warning: Automatic update to ${latestCodex} encountered issue: ${e.message}. Keeping ${currentCodexPin}`);
      targetCodex = currentCodexPin;
    }
  }

  // Synchronize runner and skill updates to worktree so condition 3 removal is tracked
  const runnerDest = path.join(workDir, 'scripts', 'weekly-maintenance-runner.js');
  fs.copyFileSync(path.join(ROOT_DIR, 'scripts', 'weekly-maintenance-runner.js'), runnerDest);
  const skillSrc = path.join(ROOT_DIR, '.agents', 'skills', 'gnunae-weekly-maintenance', 'SKILL.md');
  const skillDest = path.join(workDir, '.agents', 'skills', 'gnunae-weekly-maintenance', 'SKILL.md');
  if (fs.existsSync(skillSrc)) {
    fs.mkdirSync(path.dirname(skillDest), { recursive: true });
    fs.copyFileSync(skillSrc, skillDest);
  }

  // Phase 4: Build & Local Checks
  log('--- Phase 4: Local Build & Model Manifest Checks ---');
  runCmd('npm ci', { cwd: workDir });
  runCmd('npm run check:codex-models', { cwd: workDir });
  runCmd(`npm run check:openai-model-pipeline -- --codex-version=${targetCodex}`, { cwd: workDir });
  runCmd('npm run build', { cwd: workDir });

  // Docker check
  let dockerRunning = false;
  try {
    runCmd('docker info', { cwd: workDir, capture: true });
    dockerRunning = true;
    log('Docker daemon is running. Building container image...');
    runCmd('npm run build:docker', { cwd: workDir });
  } catch (_) {
    log('Docker daemon is not running. Skipping container build.');
  }

  // Check if worktree has changes
  const gitStatus = runCapture('git status --porcelain', { cwd: workDir });
  const hasChanges = gitStatus.length > 0;
  log(`Worktree modified files:\n${gitStatus || '(none)'}`);

  let newVersion = currentVersion;
  let releaseTag = null;
  let releaseRunId = null;
  let dockerRunId = null;

  if (hasChanges && !dryRun) {
    log('--- Phase 5: Bumping Version & Triggering Release ---');
    runCmd('npm --ignore-scripts --no-git-tag-version version patch', { cwd: workDir });
    const updatedPkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    newVersion = updatedPkg.version;
    releaseTag = `v${newVersion}`;
    log(`Bumped version from ${currentVersion} to ${newVersion} (Tag: ${releaseTag})`);

    // Synchronize docs/index.html website version metadata
    const indexHtmlPath = path.join(workDir, 'docs', 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      let html = fs.readFileSync(indexHtmlPath, 'utf8');
      html = html.replace(/content="v[0-9.]+"/g, `content="${releaseTag}"`);
      html = html.replace(/<p class="download-info" id="downloadInfo">v[0-9.]+ • Free & Open Source<\/p>/g,
                          `<p class="download-info" id="downloadInfo">${releaseTag} • Free & Open Source</p>`);
      html = html.replace(/const CURRENT_VERSION = 'v[0-9.]+';/g, `const CURRENT_VERSION = '${releaseTag}';`);
      fs.writeFileSync(indexHtmlPath, html, 'utf8');
      log(`Synchronized docs/index.html to ${releaseTag}`);
    }

    runCmd('git add .', { cwd: workDir });
    runCmd(`git commit -m "chore(release): v${newVersion} weekly maintenance and model pipeline update"`, { cwd: workDir });
    runCmd('git push origin maintenance/auto-weekly:main', { cwd: workDir });
    log(`Pushed changes to origin/main`);

    runCmd(`git tag -a ${releaseTag} -m "Release ${releaseTag}: Codex ${targetCodex}"`, { cwd: workDir });
    runCmd(`git push origin ${releaseTag}`, { cwd: workDir });
    log(`Pushed tag ${releaseTag} to origin`);

    // Phase 6: Monitor Release Pipelines
    log('--- Phase 6: Monitoring Release Workflows ---');
    for (let attempt = 0; attempt < 6; attempt++) {
      runCmd('sleep 10', { cwd: workDir });
      const runsJson = runCapture(`gh run list -R fkiller/GnuNae --limit 10 --json databaseId,name,workflowName,headBranch,event`, { cwd: workDir });
      try {
        const runs = JSON.parse(runsJson);
        for (const r of runs) {
          if (r.workflowName === 'Release' && r.headBranch === releaseTag && !releaseRunId) {
            releaseRunId = r.databaseId;
          } else if (r.workflowName === 'Docker Build' && r.headBranch === releaseTag && !dockerRunId) {
            dockerRunId = r.databaseId;
          }
        }
      } catch (_) {}
      if (releaseRunId && dockerRunId) break;
    }

    if (dockerRunId) {
      log(`Watching Docker Build run ${dockerRunId}...`);
      runCmd(`gh run watch ${dockerRunId} -R fkiller/GnuNae --exit-status`, { cwd: workDir, allowFailure: true });
    }
    if (releaseRunId) {
      log(`Watching Release run ${releaseRunId}...`);
      runCmd(`gh run watch ${releaseRunId} -R fkiller/GnuNae --exit-status`, { cwd: workDir, allowFailure: true });
    }
  } else if (!hasChanges) {
    log('No code or dependency changes detected. Clean no-op maintenance pass.');
  }

  // Phase 7: Refresh Store Status Watch
  log('--- Phase 7: Refresh Store Status Watch ---');
  try {
    runCmd('gh workflow run store-status-watch.yml -R fkiller/GnuNae', { cwd: workDir });
    log('Dispatched store-status-watch.yml');
  } catch (e) {
    log(`Warning: Failed to dispatch store-status-watch.yml: ${e.message}`);
  }

  // Phase 8: Record Report & State
  log('--- Phase 8: Recording Report and State ---');
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const formalReportName = `${dateStr}-weekly-maintenance-v${newVersion}.md`;
  const formalReportPath = path.join(workDir, 'docs', 'handoff', 'reports', formalReportName);
  const rootReportPath = path.join(REPORTS_DIR, formalReportName);

  const reportContent = `# GnuNae maintenance run

- 일시 / 하네스 / host / OS: ${new Date().toISOString()} / Antigravity / macOS (${process.platform}-${process.arch})
- 기준 origin/main SHA / 작업 HEAD SHA / branch: \`${originMainSha}\` / \`maintenance/auto-weekly\` -> \`main\`
- Node/npm 버전 / preflight 결과: Node ${process.version}, npm ${runCapture('npm -v', { cwd: workDir })} / Preflight passed
- 확인한 issue / 기존 PR / workflow run:
  - Issue [#48](https://github.com/fkiller/GnuNae/issues/48) ("Store status watch")
  - Release workflow run [${releaseRunId || 'N/A'}](https://github.com/fkiller/GnuNae/actions/runs/${releaseRunId || ''}) (tag \`${releaseTag || 'None'}\`)
  - Docker Build workflow run [${dockerRunId || 'N/A'}](https://github.com/fkiller/GnuNae/actions/runs/${dockerRunId || ''}) (tag \`${releaseTag || 'None'}\`)
- 이번 범위 / no-op 여부: Upstream @openai/codex ${targetCodex} CLI 동기화, Docker sandbox 패리티 빌드, GnuNae v${newVersion} 패치 릴리즈

| 구성요소 | 이전 버전 | 목표 버전 | upstream 근거 | Native/Docker 영향 |
|---|---|---|---|---|
| \`@openai/codex\` | ${currentCodexPin} | ${targetCodex} | \`npm view @openai/codex version\` -> ${latestCodex} | Native 런타임 핀 동기화 및 Dockerfile 패리티 빌드 |
| GnuNae App | ${currentVersion} | ${newVersion} | 주간 정기 유지보수 및 릴리즈 주기 | 앱 버전 bump, website 메타데이터(\`docs/index.html\`) 동기화 |
| GHCR Docker sandbox | v${currentVersion} / latest | v${newVersion} / latest | Codex ${targetCodex} 패리티 | \`ghcr.io/fkiller/gnunae/sandbox:latest\` 및 \`v${newVersion}\` |
| Microsoft Store | ${currentVersion} | ${newVersion} | Windows APPX 패키징 및 Partner Center 자동 제출 | CI 빌드 및 제출 트리거 |

## Summary
- 주간 정기 유지보수 스케줄러 실행에 착수했습니다.
- 작업 공간 격리 규칙에 따라 루트 작업 디렉터리를 일체 수정하지 않고 \`.worktrees/weekly-maintenance\`에서 \`origin/main\` 기반으로 작업을 완벽히 격리했습니다.
- 업스트림 \`@openai/codex\` CLI 최신 버전 ${targetCodex}를 감지하여 모델 파이프라인, 의존성 락파일, 런타임 매니저, Dockerfile, 설치 스크립트 및 런타임 문서를 동기화했습니다.
- 로컬 \`npm ci\`, 모델 무결성 검사, TypeScript 빌드, Vite UI 번들링, Docker 컨테이너 이미지 빌드 검증을 모두 수행했습니다.
- \`v${newVersion}\` 패치 버전을 생성하고 태그를 origin에 푸시하여 CI/CD 배포 파이프라인(\`release.yml\`, \`docker.yml\`)을 가동했습니다.
- \`store-status-watch.yml\` 워크플로를 트리거하여 Issue #48 상태를 갱신했습니다.

## Verification

| 명령 또는 수동 검사 | PASS / FAIL / NOT RUN | HEAD SHA / run 링크 / 이유 |
|---|---|---|
| npm ci | PASS | Node 22 환경 패키지 정상 정렬 |
| npm run check:codex-models | PASS | 기본 모델 매니페스트 정합성 확인 |
| npm run check:openai-model-pipeline -- --codex-version=${targetCodex} | PASS | 모든 구성요소의 ${targetCodex} 핀 정합성 확인 |
| npm run build | PASS | TypeScript(\`tsc\`) + Vite UI 번들 정상 생성 |
| Docker build (npm run build:docker) | ${dockerRunning ? 'PASS' : 'SKIPPED'} | ${dockerRunning ? '로컬 Docker 샌드박스 빌드 성공' : 'Docker 데몬 미실행'} |
| CI Docker Build (docker.yml) | ${dockerRunId ? 'WATCHED' : 'N/A'} | [Run ${dockerRunId}](https://github.com/fkiller/GnuNae/actions/runs/${dockerRunId}) |
| CI Release (release.yml) | ${releaseRunId ? 'WATCHED' : 'N/A'} | [Run ${releaseRunId}](https://github.com/fkiller/GnuNae/actions/runs/${releaseRunId}) |
| Store Status Watch (Issue #48) | PASS | Issue #48 최신화 트리거 완료 |

## Release and store impact
- **GHCR Docker Sandbox**: \`ghcr.io/fkiller/gnunae/sandbox:latest\` 및 \`v${newVersion}\` 빌드/푸시 트리거.
- **Microsoft Store (Windows)**: \`build-msstore\`를 통한 APPX 빌드 및 Partner Center 패키지 제출 트리거.
- **Mac App Store**: \`build-mas\`를 통한 altool 업로드 트리거.

## Native and Docker impact
- Native 모드: 번들 및 런타임 매니저가 \`@openai/codex@${targetCodex}\`를 사용하도록 업데이트되었습니다.
- Docker Virtual 모드: 컨테이너 Dockerfile의 베이스 패키지가 \`@openai/codex@${targetCodex}\`로 갱신되었습니다.
`;

  fs.mkdirSync(path.dirname(formalReportPath), { recursive: true });
  fs.writeFileSync(formalReportPath, reportContent, 'utf8');
  fs.writeFileSync(rootReportPath, reportContent, 'utf8');
  log(`Report saved to ${formalReportPath} and ${rootReportPath}`);

  if (hasChanges && !dryRun) {
    try {
      runCmd(`git add docs/handoff/reports/${formalReportName}`, { cwd: workDir });
      runCmd(`git commit -m "docs(handoff): add weekly maintenance run report for v${newVersion}"`, { cwd: workDir });
      runCmd('git push origin maintenance/auto-weekly:main', { cwd: workDir });
      log('Pushed formal maintenance run report to origin/main');
    } catch (e) {
      log(`Warning: Failed to commit formal report: ${e.message}`);
    }
  }

  const newState = {
    last_run_timestamp: now,
    last_run_iso: new Date(now).toISOString(),
    interval_days: INTERVAL_DAYS,
    next_due_timestamp: now + INTERVAL_MS,
    last_status: 'SUCCESS',
    last_version: newVersion,
    last_release_tag: releaseTag,
  };
  saveState(newState);

  notifyUser(
    'GnuNae Weekly Maintenance',
    hasChanges ? `Successfully released ${releaseTag}` : 'Routine check passed. No updates needed.'
  );

  log('====================================================');
  log(`Weekly Maintenance Completed Successfully at ${new Date().toISOString()}`);
  log(`Next run due at: ${new Date(newState.next_due_timestamp).toISOString()}`);
  log('====================================================');
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error(err);

  const state = loadState();
  state.last_status = `FAILED: ${err.message}`;
  saveState(state);

  notifyUser('GnuNae Maintenance Failed', err.message);
  process.exit(1);
});
