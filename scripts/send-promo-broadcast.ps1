# Рассылка promo-broadcast: POST на сервер (не открывать URL в браузере).
# Пример из корня репозитория:
#   .\scripts\send-promo-broadcast.ps1
#   .\scripts\send-promo-broadcast.ps1 -JsonPath ".\scripts\promo-potok989-rassylka.example.json"
#   .\scripts\send-promo-broadcast.ps1 -Secret "ваш_секрет"
#
# Нужен ADMIN_STATS_SECRET (тот же, что на сервере в переменных окружения).
# ADMIN_STATS_EMAIL — только для входа в админку в браузере; для этого скрипта секрет обязателен.

param(
    [string] $BaseUrl = "https://karto.pro",
    [string] $JsonPath = "$PSScriptRoot\promo-potok989-rassylka.example.json",
    [string] $Secret = $env:ADMIN_STATS_SECRET
)

$ErrorActionPreference = "Stop"
$uri = "$($BaseUrl.TrimEnd('/'))/api/admin/promo-broadcast"

if (-not (Test-Path -LiteralPath $JsonPath)) {
    Write-Error "Файл не найден: $JsonPath. Укажите путь от корня проекта, например: .\scripts\promo-potok989-rassylka.example.json"
}

# Нельзя класть SecureString в [string] $Secret — PowerShell приведёт тип и сломает SecureStringToBSTR.
$plainSecret = if ([string]::IsNullOrWhiteSpace($Secret)) { $null } else { $Secret }
if ([string]::IsNullOrWhiteSpace($plainSecret)) {
    $secure = Read-Host "Введите ADMIN_STATS_SECRET (символы не показываются)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plainSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

if ([string]::IsNullOrWhiteSpace($plainSecret)) {
    Write-Error "Секрет пустой. Задайте ADMIN_STATS_SECRET в .env / на сервере или введите при запросе."
}

# Кавычки/пробелы, если скопировали значение из панели как "секрет"
$plainSecret = $plainSecret.Trim().Trim([char]0x201C).Trim([char]0x201D).Trim('"').Trim("'")

$body = Get-Content -Raw -LiteralPath $JsonPath -Encoding UTF8

Write-Host "POST $uri" -ForegroundColor Cyan
Write-Host "(длина секрета: $($plainSecret.Length) символов — сравните с тем, что без пробелов в Timeweb)" -ForegroundColor DarkGray

# Явный словарь заголовков (надёжнее, чем hashtable в старых PS)
$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add("x-admin-stats-secret", $plainSecret)

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -ContentType "application/json; charset=utf-8" `
        -Headers $headers -Body $body
}
catch {
    $err = $_.ErrorDetails.Message
    if ($err) { Write-Host $err -ForegroundColor Red }
    throw
}

$response | ConvertTo-Json -Depth 5
Write-Host "Готово." -ForegroundColor Green
