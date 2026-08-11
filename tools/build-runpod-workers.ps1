param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Registry,

    [ValidateSet('voice', 'video', 'all')]
    [string]$Worker = 'voice',

    [switch]$Push
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workers = if ($Worker -eq 'all') { @('voice', 'video') } else { @($Worker) }

foreach ($selectedWorker in $workers) {
    $image = "$Registry/ai-vtuber-runpod-${selectedWorker}:latest"
    docker build --platform linux/amd64 --tag $image (Join-Path $projectRoot "runpod\$selectedWorker")
    if ($LASTEXITCODE -ne 0) { throw "$selectedWorker worker image build failed." }
    if ($Push) {
        docker push $image
        if ($LASTEXITCODE -ne 0) { throw "$selectedWorker worker image push failed." }
    }
    Write-Host "$selectedWorker image: $image"
}

if (-not $Push) {
    Write-Host 'Images were built locally only. Add -Push after docker login to publish them.'
}
