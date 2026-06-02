# Проверка YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY из .env.local (без вывода секрета)
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) { Write-Error ".env.local not found"; exit 1 }

$shop = $null
$key = $null
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^YOOKASSA_SHOP_ID=(.+)$') { $shop = $Matches[1].Trim() }
  if ($_ -match '^YOOKASSA_SECRET_KEY=(.+)$') { $key = $Matches[1].Trim() }
}
if (-not $shop -or -not $key) { Write-Error "YOOKASSA_* not set in .env.local"; exit 1 }

$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${shop}:${key}"))
$body = '{"amount":{"value":"1.00","currency":"RUB"},"confirmation":{"type":"redirect","return_url":"http://localhost:3000/profile"},"description":"karto verify"}'
try {
  Invoke-RestMethod -Uri "https://api.yookassa.ru/v3/payments" -Method POST `
    -Headers @{ Authorization = "Basic $pair"; "Idempotence-Key" = [guid]::NewGuid().ToString() } `
    -Body $body -ContentType "application/json" | Out-Null
  Write-Host "OK: shop $shop, key prefix $($key.Substring(0, [Math]::Min(12, $key.Length)))..."
  exit 0
} catch {
  Write-Host "FAIL: shop $shop"
  Write-Host $_.ErrorDetails.Message
  exit 1
}
