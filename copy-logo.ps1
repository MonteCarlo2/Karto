$files = Get-ChildItem -File
$target = $files | Where-Object { $_.Name -like '*лого*' -and $_.Name -like '*потока*' -and $_.Extension -eq '.png' }
if ($target) {
    Copy-Item $target[0].FullName -Destination "public\logo-flow.png" -Force
    Write-Host "Copied: $($target[0].Name)"
} else {
    Write-Host "File not found"
}
