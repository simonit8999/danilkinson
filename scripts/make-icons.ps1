$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root 'public\icons'
New-Item -ItemType Directory -Force -Path $icons | Out-Null

$tmp = Join-Path $env:TEMP 'ua-logo.png'
Invoke-WebRequest -Uri 'https://i.postimg.cc/0NDs9xDf/u-a-top-Photoroom.png' -OutFile $tmp

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

New-Icon $tmp 192 (Join-Path $icons 'icon-192.png') 0.08
New-Icon $tmp 512 (Join-Path $icons 'icon-512.png') 0.08
New-Icon $tmp 512 (Join-Path $icons 'maskable-512.png') 0.20
New-Icon $tmp 180 (Join-Path $icons 'apple-touch-icon.png') 0.12

Remove-Item -LiteralPath $tmp -Force
Write-Output 'ICONS_OK'
