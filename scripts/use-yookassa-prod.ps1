# Восстановление боевого магазина из .env.yookassa-prod.snapshot
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env.local"
$snap = Join-Path $root ".env.yookassa-prod.snapshot"
if (-not (Test-Path $snap)) { Write-Error "Missing .env.yookassa-prod.snapshot"; exit 1 }

$shop = (Select-String -Path $snap -Pattern '^YOOKASSA_SHOP_ID=(.+)$').Matches[0].Groups[1].Value
$key = (Select-String -Path $snap -Pattern '^YOOKASSA_SECRET_KEY=(.+)$').Matches[0].Groups[1].Value
$url = (Select-String -Path $snap -Pattern '^NEXT_PUBLIC_APP_URL=(.+)$').Matches[0].Groups[1].Value

$content = Get-Content $envFile -Raw
$content = $content -replace '(?m)^YOOKASSA_SHOP_ID=.*$', "YOOKASSA_SHOP_ID=$shop"
$content = $content -replace '(?m)^YOOKASSA_SECRET_KEY=.*$', "YOOKASSA_SECRET_KEY=$key"
$content = $content -replace '(?m)^NEXT_PUBLIC_APP_URL=.*$', "NEXT_PUBLIC_APP_URL=$url"
$content = $content -replace '(?m)^YOOKASSA_TEST_MODE=.*\r?\n', ''
Set-Content -Path $envFile -Value $content.TrimEnd() -NoNewline
Add-Content -Path $envFile -Value "`n"
Write-Host "OK: production YooKassa restored. Restart npm run dev."
