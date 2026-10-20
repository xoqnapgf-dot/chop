# Local preview server for the built site. Uses only what Windows already has (PowerShell), nothing to install.
# Serves the folder this file is in, at http://localhost:8080/ (or the next free port). Close the window to stop.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.webp' = 'image/webp'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
  '.woff2' = 'font/woff2'
  '.woff' = 'font/woff'
  '.xml'  = 'application/xml'
  '.txt'  = 'text/plain; charset=utf-8'
  '.wasm' = 'application/wasm'
}

$listener = $null
$port = 0
foreach ($p in 8080..8089) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try {
    $l.Start()
    $listener = $l
    $port = $p
    break
  } catch {
    $l.Close()
  }
}
if ($null -eq $listener) {
  Write-Host 'Could not start the local server (ports 8080-8089 are all busy).'
  exit 1
}

$url = "http://localhost:$port/"
Write-Host "Site is running at $url"
Write-Host 'Keep this window open while you browse. Close it to stop.'
Start-Process $url

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    $full = [IO.Path]::GetFullPath((Join-Path $root ($rel -replace '/', '\')))
    if (-not $full.StartsWith($root)) { throw 'path outside site folder' }
    if (Test-Path -LiteralPath $full -PathType Container) { $full = Join-Path $full 'index.html' }
    $status = 200
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $full = Join-Path $root '404.html'
      $status = 404
    }
    $bytes = [IO.File]::ReadAllBytes($full)
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $ctx.Response.StatusCode = $status
    if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    try { $ctx.Response.StatusCode = 500 } catch { }
  } finally {
    try { $ctx.Response.Close() } catch { }
  }
}
