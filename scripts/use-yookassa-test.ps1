# Переключение .env.local на тестовый магазин ЮKassa (shopId 1280166)
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) { Write-Error ".env.local not found"; exit 1 }

$content = Get-Content $envFile -Raw
$content = $content -replace '(?m)^YOOKASSA_SHOP_ID=.*$', 'YOOKASSA_SHOP_ID=1280166'
# Секретный ключ НЕ подставляем автоматически — скопируйте из кабинета Test, karto.pro → Ключи API
if ($content -notmatch '(?m)^YOOKASSA_SECRET_KEY=test_') {
  Write-Host "ВНИМАНИЕ: вставьте в .env.local строку YOOKASSA_SECRET_KEY=test_... из кабинета (Интеграция → Ключи API)."
}
$content = $content -replace '(?m)^NEXT_PUBLIC_APP_URL=.*$', 'NEXT_PUBLIC_APP_URL=http://localhost:3000'
if ($content -notmatch 'YOOKASSA_TEST_MODE=') {
  $content += "`nYOOKASSA_TEST_MODE=1`n"
} else {
  $content = $content -replace '(?m)^YOOKASSA_TEST_MODE=.*$', 'YOOKASSA_TEST_MODE=1'
}
Set-Content -Path $envFile -Value $content.TrimEnd() -NoNewline
Add-Content -Path $envFile -Value "`n"
Write-Host "OK: test shop (1280166). Restart npm run dev. See YOOKASSA_TEST_LOCAL.md"
