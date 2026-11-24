$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
  throw '存在未提交的已跟踪改动。请先提交或 stash，再同步上游。'
}

$remotes = [ordered]@{
  'upstream-genshin'  = 'https://github.com/biuuu/genshin-wish-export.git'
  'upstream-starrail' = 'https://github.com/biuuu/star-rail-warp-export.git'
}

$existingRemotes = git remote
foreach ($name in $remotes.Keys) {
  if ($existingRemotes -notcontains $name) {
    git remote add $name $remotes[$name]
    if ($LASTEXITCODE -ne 0) { throw "添加远程 $name 失败" }
  }
}

function Invoke-SubtreePull {
  param([string]$Prefix, [string]$Remote, [string]$Message)

  Write-Host "[sync] 同步 $Remote ..."
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = (git subtree pull --prefix=$Prefix $Remote main --squash -m $Message 2>&1 | Out-String)
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous

  if ($output.Trim()) { Write-Host $output.TrimEnd() }

  $unmerged = git ls-files -u
  if ($unmerged) {
    throw "$Remote 同步出现未解决冲突。请按 docs/upstream-sync.md 处理冲突后重新运行。"
  }
  if ($output -match 'fatal:|CONFLICT|unable to access|Could not read from remote') {
    throw "$Remote 同步失败（exit=$code）。请检查上方 git 输出。"
  }
  if ($code -ne 0) {
    Write-Host "[sync] 提示：git subtree 返回 $code，但未检测到冲突或致命错误，按成功处理。"
  }
}

Invoke-SubtreePull -Prefix 'vendor/genshin' -Remote 'upstream-genshin' -Message 'chore(sync): genshin upstream'
Invoke-SubtreePull -Prefix 'vendor/starrail' -Remote 'upstream-starrail' -Message 'chore(sync): starrail upstream'

Write-Host '[sync] 重新校验 vendor 补丁...'
node scripts/apply-vendor-patches.js
if ($LASTEXITCODE -ne 0) {
  throw 'vendor 补丁应用失败，通常是上游改写了被补丁的代码。请阅读 docs/upstream-sync.md。'
}

Write-Host '[sync] 运行契约测试...'
node --test tests/contracts
if ($LASTEXITCODE -ne 0) {
  throw '契约测试失败，请检查上游接口或数据格式是否变化。'
}

Write-Host ''
Write-Host '[sync] 完成。请检查 git diff 与测试结果后提交。'
