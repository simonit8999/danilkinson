# Builds a seamless vertical background tile from the source PNG texture.
#
# Trick: tile = image + its vertical flip (A + vflip(A)). Pixels match at the
# seam, so the texture repeats vertically forever (background-repeat: repeat-y)
# without a visible line.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/build-bg.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/build-bg.ps1 -Source bg.png
#
# Output: public/images/site/site-bg-tile.webp
# When the size changes, update BG_TILE_RATIO in src/lib/backgroundScroll.ts.
param(
  [string]$Source = '',
  [int]$Width = 704,
  [int]$Quality = 82
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'public\images\site'
$target = Join-Path $outDir 'site-bg-tile.webp'

if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

if (-not $Source) {
  # The new texture matches *2.0* in the project root (any file name language).
  $candidate = Get-ChildItem -LiteralPath $root -Filter '*.png' |
    Where-Object { $_.Name -like '*2.0*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $candidate) { throw 'Source PNG not found in the project root (expected *2.0*.png).' }
  $Source = $candidate.FullName
} elseif (-not [System.IO.Path]::IsPathRooted($Source)) {
  $Source = Join-Path $root $Source
}

if (-not (Test-Path -LiteralPath $Source)) { throw "Source not found: $Source" }

$image = [System.Drawing.Image]::FromFile($Source)
$sourceWidth = $image.Width
$sourceHeight = $image.Height
$image.Dispose()

$scaledHeight = [int][Math]::Round($sourceHeight * ($Width / $sourceWidth) / 2) * 2

$filter = "[0:v]scale=${Width}:${scaledHeight}:flags=lanczos," +
  'eq=contrast=1.08:saturation=0.94:brightness=0.015,' +
  'split[a][b];[b]vflip[c];[a][c]vstack=inputs=2'

& ffmpeg -y -loglevel error -i $Source -filter_complex $filter -c:v libwebp -quality $Quality -compression_level 6 $target
if ($LASTEXITCODE -ne 0) { throw "ffmpeg exited with code $LASTEXITCODE" }

$tile = Get-Item -LiteralPath $target
$tileHeight = $scaledHeight * 2
$ratio = [Math]::Round($tileHeight / $Width, 6)

Write-Output ("source : {0} ({1}x{2})" -f (Split-Path -Leaf $Source), $sourceWidth, $sourceHeight)
Write-Output ("tile   : {0} ({1}x{2}, ratio {3})" -f $tile.Name, $Width, $tileHeight, $ratio)
Write-Output ("size   : {0:N0} KB" -f ($tile.Length / 1KB))
