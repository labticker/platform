param(
    [Parameter(Mandatory)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$From,
    [Parameter(Mandatory)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$To
)
$ErrorActionPreference = 'Stop'
$credentialPath = Join-Path $env:LOCALAPPDATA 'LabTicker/aggregate-report-token.dpapi'
$secureToken = Get-Content -LiteralPath $credentialPath -Raw | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    # Fixed assigned origin: the operator token cannot be forwarded to caller hosts.
    $uri = "https://labticker.fly.dev/api/admin/analytics/summary?from=$From&to=$To&limit=100"
    try { $report = Invoke-RestMethod -Uri $uri -Headers @{Authorization="Bearer $plainToken"} -MaximumRedirection 0 -TimeoutSec 20 }
    catch { throw 'Restricted aggregate report unavailable; no request credentials logged.' }
    $report | ConvertTo-Json -Depth 30
} finally {
    $plainToken = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secureToken.Dispose()
}
