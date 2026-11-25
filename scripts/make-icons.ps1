param(
  [string]$Source = '',
  [string]$Url = 'https://i.postimg.cc/0NDs9xDf/u-a-top-Photoroom.png'
)

# Иконки PWA/Apple генерируются из одной картинки: вписываем по пропорциям
# в белый квадрат с отступами (padding).
#
# Запуск с локальным файлом (новый логотип/аватарка):
#   powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1 -Source public\icons\avatar.png
# Без -Source берётся public\icons\avatar.png | avatar.jpg, иначе скачивается логотип по умолчанию.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root 'public\icons'
New-Item -ItemType Directory -Force -Path $icons | Out-Null

$tmp = Join-Path $env:TEMP 'ua-logo.png'
$downloaded = $false

if (-not $Source) {
  foreach ($name in 'avatar.png', 'avatar.jpg', 'avatar.jpeg', 'source.png', 'source.jpg') {
    $candidate = Join-Path $icons $name
    if (Test-Path -LiteralPath $candidate) {
      $Source = $candidate
      break
    }
  }
}

if ($Source) {
  $Source = (Resolve-Path -LiteralPath $Source).Path
} else {
  Invoke-WebRequest -Uri $Url -OutFile $tmp
  $Source = $tmp
  $downloaded = $true
}

Write-Output "ICONS_SOURCE: $Source"

function New-Icon([string]$Source, [int]$Size, [string]$Out, [double]$Padding) {
  $image = [System.Drawing.Image]::FromFile($Source)
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::White)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  $max = [int]($Size * (1 - 2 * $Padding))
  $ratio = [Math]::Min($max / $image.Width, $max / $image.Height)
  $w = [int]($image.Width * $ratio)
  $h = [int]($image.Height * $ratio)
  $x = [int](($Size - $w) / 2)
  $y = [int](($Size - $h) / 2)

  $graphics.DrawImage($image, $x, $y, $w, $h)
  $bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)

  $graphics.Dispose()
  $bitmap.Dispose()
  $image.Dispose()
}

New-Icon $Source 192 (Join-Path $icons 'icon-192.png') 0.08
New-Icon $Source 512 (Join-Path $icons 'icon-512.png') 0.08
New-Icon $Source 512 (Join-Path $icons 'maskable-512.png') 0.20
New-Icon $Source 180 (Join-Path $icons 'apple-touch-icon.png') 0.12

if ($downloaded) {
  Remove-Item -LiteralPath $tmp -Force
}

Write-Output 'ICONS_OK'

