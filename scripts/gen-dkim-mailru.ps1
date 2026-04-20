# Генерация пары ключей DKIM по сценарию из справки Mail.ru (OpenSSL).
# Публичный ключ — в DNS TXT для {selector}._domainkey (по умолчанию mailru._domainkey).
# Приватный — только на сервере: SMTP_DKIM_PRIVATE_KEY или файл + SMTP_DKIM_PRIVATE_KEY_PATH.
#
# Требуется openssl в PATH (Git for Windows, OpenSSL для Windows).
# Запуск:  .\scripts\gen-dkim-mailru.ps1

$ErrorActionPreference = "Stop"
$selector = if ($env:SMTP_DKIM_KEY_SELECTOR) { $env:SMTP_DKIM_KEY_SELECTOR.Trim() } else { "mailru" }

$null = Get-Command openssl -ErrorAction Stop

$out = Join-Path $PSScriptRoot "dkim-out"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$priv = Join-Path $out "dkim-private.pem"
$pub = Join-Path $out "dkim-public.pem"

Push-Location $out
try {
    Write-Host "Генерация RSA 2048..." -ForegroundColor Cyan
    & openssl genrsa -out $priv 2048
    if ($LASTEXITCODE -ne 0) { throw "openssl genrsa exit $LASTEXITCODE" }
    & openssl rsa -in $priv -pubout -out $pub
    if ($LASTEXITCODE -ne 0) { throw "openssl rsa -pubout exit $LASTEXITCODE" }

    $der = & openssl rsa -in $priv -pubout -outform DER 2>$null
    if ($LASTEXITCODE -ne 0) { throw "openssl rsa -outform DER exit $LASTEXITCODE" }
    $pB64 = [Convert]::ToBase64String($der)
    $txtValue = "v=DKIM1; k=rsa; p=$pB64"

    Write-Host ""
    Write-Host "=== DNS (у регистратора / Timeweb → DNS зона karto.pro) ===" -ForegroundColor Green
    Write-Host "Тип: TXT"
    Write-Host "Имя / поддомен:  ${selector}._domainkey"
    Write-Host "Значение (одна строка; кавычки — по подсказке панели DNS):"
    Write-Host $txtValue
    Write-Host ""
    Write-Host "=== Сервер (Timeweb) — НЕ коммитить ключ в git ===" -ForegroundColor Yellow
    Write-Host "Файл приватного ключа: $priv"
    Write-Host "Задайте SMTP_DKIM_PRIVATE_KEY_PATH (путь на сервере) или содержимое PEM в SMTP_DKIM_PRIVATE_KEY."
    Write-Host "SMTP_DKIM_DOMAIN=karto.pro"
    Write-Host "SMTP_DKIM_KEY_SELECTOR=$selector"
    Write-Host "SMTP_FROM / SMTP_USER: адрес @karto.pro (d= в подписи = домен для Postmaster)."
    Write-Host ""
}
finally {
    Pop-Location
}
