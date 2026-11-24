$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '[import] 检查工作区状态...'
$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
  throw '存在未提交的已跟踪改动。请先提交或 stash，再执行上游导入。'
}

$untracked = git status --porcelain --untracked-files=normal | Where-Object { $_ -match '^\?\?' }
if ($untracked) {
  Write-Host '[import] 提示：存在未跟踪文件，建议先提交当前骨架，再导入上游，便于区分变更。'
}

$remotes = [ordered]@{
  'upstream-genshin'  = 'https://github.com/biuuu/genshin-wish-export.git'
  'upstream-starrail' = 'https://github.com/biuuu/star-rail-warp-export.git'
}

$existingRemotes = git remote
foreach ($name in $remotes.Keys) {
  if ($existingRemotes -notcontains $name) {
    Write-Host "[import] 添加远程 $name"
    git remote add $name $remotes[$name]
    if ($LASTEXITCODE -ne 0) { throw "添加远程 $name 失败" }
  }
}

if (Test-Path 'vendor/genshin') {
  throw 'vendor/genshin 已存在。若需重新导入，请先移走该目录并提交后再执行。'
}
if (Test-Path 'vendor/starrail') {
  throw 'vendor/starrail 已存在。若需重新导入，请先移走该目录并提交后再执行。'
}

function Test-SubtreeImported {
  param([string]$Prefix)
  $hasFiles = Test-Path (Join-Path $Prefix 'package.json')
  $lastSubject = git log -1 --format=%s
  return $hasFiles -and ($lastSubject -match "as '$Prefix'")
}

function Invoke-SubtreeAdd {
  param([string]$Prefix, [string]$Remote)

  Write-Host "[import] 导入 $Remote 到 $Prefix ..."
  git subtree add --prefix=$Prefix $Remote main --squash
  $code = $LASTEXITCODE

  if (-not (Test-SubtreeImported -Prefix $Prefix)) {
    throw "导入 $Remote 失败（exit=$code）。请检查上方 git 输出。"
  }

  if ($code -ne 0) {
    Write-Host "[import] 提示：git subtree 返回 $code，但 $Prefix 已生成并提交，按成功处理。"
  }
}

Invoke-SubtreeAdd -Prefix 'vendor/genshin' -Remote 'upstream-genshin'
Invoke-SubtreeAdd -Prefix 'vendor/starrail' -Remote 'upstream-starrail'

Write-Host ''
Write-Host '[import] 完成。后续步骤：'
Write-Host '  1. yarn patch-vendor    # 应用 4 类最小补丁（每个上游 4 处）'
Write-Host '  2. yarn setup           # 安装两个上游的构建依赖'
Write-Host '  3. yarn test            # 运行契约测试'
Write-Host '  4. yarn build:games     # 构建两套游戏产物'
Write-Host '  5. yarn dev             # 打开统一启动器'
