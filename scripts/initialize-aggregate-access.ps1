$ErrorActionPreference = 'Stop'
# Windows DPAPI encrypts this aggregate-only credential for the current operator.
# No token is printed, passed on a command line, or stored in the repository.
$credentialDirectory = Join-Path $env:LOCALAPPDATA 'LabTicker'
$credentialPath = Join-Path $credentialDirectory 'aggregate-report-token.dpapi'
New-Item -ItemType Directory -Force -Path $credentialDirectory | Out-Null
if (Test-Path -LiteralPath $credentialPath) {
    $secureToken = Get-Content -LiteralPath $credentialPath -Raw | ConvertTo-SecureString
} else {
    $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
    $initialToken = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    $secureToken = ConvertTo-SecureString $initialToken -AsPlainText -Force
    [IO.File]::WriteAllText($credentialPath, (ConvertFrom-SecureString $secureToken))
    $initialToken = $null
}
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $plainToken | gh secret set ANALYTICS_REPORT_TOKEN --env production --repo labticker/platform
    if ($LASTEXITCODE -ne 0) { throw 'Aggregate credential transfer failed' }
} finally {
    $plainToken = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secureToken.Dispose()
}
Write-Output 'Aggregate-only access initialized in protected GitHub secret and local DPAPI storage; no credential value logged.'
