param(
  [string]$Source = '',
  [int]$Width = 3200,
  [int]$Height = 180,
  [ValidateSet('frame', 'border')] [string]$Layout = 'border',
  [int]$MobileWidth = 1220,
  [string]$OutWide = '',
  [string]$OutMobile = '',
  [string]$PreviewDir = ''
)

# Плашка сайта собирается из ГОТОВОГО фото (public/images/site/header-banner.png).
# Пиксели не перерисовываются: скрипт раскладывает исходник шире и ниже.
#
#   header-wide.png   — ПК/планшет: углы по краям, анк с надписью по центру,
#                       между ними нижняя лоза (фрагмент уложен зеркально —
#                       растягивать лозу нельзя, она смазывается).
#   header-mobile.png — телефон: только анк с надписью, без обрывков орнамента.
#
# Размеры исходника (1900x274), по которым идёт резка:
#   надпись x 502..1358, y 105..172; левый орнамент до x 526 (внизу);
#   правый орнамент от x 1359; нижняя лоза y >= 196.
#
# Запуск:
#   powershell -ExecutionPolicy Bypass -File scripts\make-header.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\make-header.ps1 -PreviewDir .preview

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
if (-not $Source) { $Source = Join-Path $root 'public\images\site\header-banner.png' }
if (-not $OutWide) { $OutWide = Join-Path $root 'public\images\site\header-wide.png' }
if (-not $OutMobile) { $OutMobile = Join-Path $root 'public\images\site\header-mobile.png' }

$Source = (Resolve-Path -LiteralPath $Source).Path
Write-Output "HEADER_SOURCE: $Source"

$master = [System.Drawing.Bitmap]::FromFile($Source)
$masterW = $master.Width
$masterH = $master.Height
Write-Output "HEADER_SOURCE_SIZE: ${masterW}x${masterH}"

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  return @{ Bitmap = $bmp; Graphics = $g }
}

function Draw-Part([System.Drawing.Graphics]$g, [System.Drawing.Image]$img, [int]$dx, [int]$dy, [int]$dw, [int]$dh, [int]$sx, [int]$sy, [int]$sw, [int]$sh) {
  $dest = New-Object System.Drawing.Rectangle($dx, $dy, $dw, $dh)
  $g.DrawImage($img, $dest, $sx, $sy, $sw, $sh, [System.Drawing.GraphicsUnit]::Pixel)
}

# Сделать прямоугольник полностью прозрачным (быстро, без SetPixel).
function Clear-Rect([System.Drawing.Bitmap]$bmp, [int]$x, [int]$y, [int]$w, [int]$h) {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $g.FillRectangle($brush, $x, $y, $w, $h)
  $brush.Dispose()
  $g.Dispose()
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

# Превью на бумажном фоне: на прозрачности картинку не оценить.
function Save-Preview([System.Drawing.Bitmap]$bmp, [string]$path) {
  $copy = New-Object System.Drawing.Bitmap($bmp.Width, $bmp.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($copy)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 244, 239, 230))
  $g.DrawImage($bmp, 0, 0, $bmp.Width, $bmp.Height)
  $g.Dispose()
  Save-Png $copy $path
  $copy.Dispose()
}

# Полоса лозы: тайлы чередуются с зеркальным отражением, на стыках рисунок
# сходится без шва.
function Draw-MirrorStrip([System.Drawing.Graphics]$g, [System.Drawing.Bitmap]$tile, [int]$startX, [int]$dstY, [int]$endX, [bool]$fromLeft) {
  $tileW = $tile.Width
  $tileH = $tile.Height
  $tileFlipped = $tile.Clone()
  $tileFlipped.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)

  $x = $startX
  $index = 0
  while ($x -lt $endX) {
    $img = if (($index % 2) -eq 1) { $tileFlipped } else { $tile }
    $taken = [Math]::Min($tileW, $endX - $x)
    $srcX = if ($fromLeft) { 0 } else { $tileW - $taken }
    Draw-Part $g $img $x $dstY $taken $tileH $srcX 0 $taken $tileH
    $x += $taken
    $index += 1
  }
  $tileFlipped.Dispose()
}

# ----------------------------------------------------------- подготовка слоёв
# Левый угол без надписи "(u" (x 490..550, y 0..200 — там только буквы).
$corner = $master.Clone()
Clear-Rect $corner 490 0 60 200

# Центр (анк + надпись) без обрывков орнамента, которые попали в вырез.
$centerImg = $master.Clone()
Clear-Rect $centerImg 0 176 540 ($masterH - 176)
Clear-Rect $centerImg 1359 176 ($masterW - 1359) ($masterH - 176)

$s = $Height / $masterH
$canvas = New-Canvas $Width $Height
$g = $canvas.Graphics

$cornerW = [int][Math]::Round(540 * $s)
$centerSrcX = 470
$centerSrcW = 890
$centerW = [int][Math]::Round($centerSrcW * $s)
$centerX = [int][Math]::Round(($Width - $centerW) / 2)

# Лоза: фрагмент нижней полосы левого угла.
$vineSrcX = 200
$vineSrcW = 320
$vineSrcY = 196
$vineSrcH = 76
$vine = New-Canvas $vineSrcW $vineSrcH
Draw-Part $vine.Graphics $corner 0 0 $vineSrcW $vineSrcH $vineSrcX $vineSrcY $vineSrcW $vineSrcH
$vine.Graphics.Dispose()

$vineW = [int][Math]::Round($vineSrcW * $s)
$vineH = [int][Math]::Round($vineSrcH * $s)
$vineY = $Height - $vineH
$vineTile = New-Canvas $vineW $vineH
Draw-Part $vineTile.Graphics $vine.Bitmap 0 0 $vineW $vineH 0 0 $vineSrcW $vineSrcH
$vineTile.Graphics.Dispose()

# ------------------------------------------------------------- широкая плашка
# frame  — углы по краям, анк с надписью по центру, между ними воздух.
# border — то же + нижняя лоза до самой ножки анка.
if ($Layout -eq 'border') {
  $vineStart = [int][Math]::Round(300 * $s)
  $vineEnd = $centerX + [int][Math]::Round((905 - $centerSrcX) * $s)
  if ($vineEnd -gt $vineStart) {
    Draw-MirrorStrip $g $vineTile.Bitmap $vineStart $vineY $vineEnd $true
    Draw-MirrorStrip $g $vineTile.Bitmap ($Width - $vineEnd) $vineY ($Width - $vineStart) $false
  }
}

Draw-Part $g $corner 0 0 $cornerW $Height 0 0 540 $masterH

# Правый угол — зеркало ЛЕВОЙ полосы (0..540), а не всего исходника.
# Если отражать весь исходник и брать из него те же 0..540, в правый край
# попадает собственный правый угол фото вместе с лозой правее него: завиток
# уезжает влево от края и «висит» в воздухе. Зеркало левой полосы прижимает
# завиток к правому краю, а лозу разворачивает внутрь — как у левого угла.
$cornerSlice = $corner.Clone(
  (New-Object System.Drawing.Rectangle(0, 0, 540, $masterH)),
  $corner.PixelFormat
)
$cornerSlice.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
Draw-Part $g $cornerSlice ($Width - $cornerW) 0 $cornerW $Height 0 0 540 $masterH
$cornerSlice.Dispose()

Draw-Part $g $centerImg $centerX 0 $centerW $Height $centerSrcX 0 $centerSrcW $masterH

$g.Dispose()
Save-Png $canvas.Bitmap $OutWide
Write-Output "HEADER_WIDE: $OutWide (${Width}x${Height}, layout=$Layout)"

# ---------------------------------------- мобильная плашка: только анк + надпись
# Берём чистый центр (без орнаментов), обрезаем по ширине надписи с полем.
# Прозрачные поля по бокам ($mobilePad), чтобы надпись не липла к краю экрана.
$mobileSrcX = 470
$mobileSrcW = 890
$mobilePad = 60
$mobileW = $mobileSrcW + 2 * $mobilePad
$mobile = New-Canvas $mobileW $masterH
Draw-Part $mobile.Graphics $centerImg $mobilePad 0 $mobileSrcW $masterH $mobileSrcX 0 $mobileSrcW $masterH
$mobile.Graphics.Dispose()
Save-Png $mobile.Bitmap $OutMobile
Write-Output "HEADER_MOBILE: $OutMobile (${mobileW}x${masterH})"

if ($PreviewDir) {
  New-Item -ItemType Directory -Force -Path $PreviewDir | Out-Null
  Save-Preview $canvas.Bitmap (Join-Path $PreviewDir "wide-$Layout.png")
  Save-Preview $mobile.Bitmap (Join-Path $PreviewDir "mobile-$Layout.png")
  Write-Output "HEADER_PREVIEW: $PreviewDir"
}

$mobile.Bitmap.Dispose()
$vineTile.Bitmap.Dispose()
$vine.Bitmap.Dispose()
$canvas.Bitmap.Dispose()
$corner.Dispose()
$centerImg.Dispose()
$master.Dispose()

Write-Output 'HEADER_OK'

