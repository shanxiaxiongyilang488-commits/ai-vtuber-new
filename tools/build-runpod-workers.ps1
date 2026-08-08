param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Registry,

    [switch]$Push
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$voiceImage = "$Registry/ai-vtuber-irodori:v4"
$videoImage = "$Registry/ai-vtuber-hunyuan:1.5"
$reflectionImage = "$Registry/ai-vtuber-reflection:qwen3"

docker build --platform linux/amd64 --tag $voiceImage (Join-Path $projectRoot 'runpod\voice')
if ($LASTEXITCODE -ne 0) { throw 'Voice worker image build failed.' }

docker build --platform linux/amd64 --tag $videoImage (Join-Path $projectRoot 'runpod\video')
if ($LASTEXITCODE -ne 0) { throw 'Video worker image build failed.' }

docker build --platform linux/amd64 --tag $reflectionImage (Join-Path $projectRoot 'runpod\reflection')
if ($LASTEXITCODE -ne 0) { throw 'Reflection worker image build failed.' }

if ($Push) {
    docker push $voiceImage
    if ($LASTEXITCODE -ne 0) { throw 'Voice worker image push failed.' }
    docker push $videoImage
    if ($LASTEXITCODE -ne 0) { throw 'Video worker image push failed.' }
    docker push $reflectionImage
    if ($LASTEXITCODE -ne 0) { throw 'Reflection worker image push failed.' }
}

Write-Host "Voice image: $voiceImage"
Write-Host "Video image: $videoImage"
Write-Host "Reflection image: $reflectionImage"
if (-not $Push) {
    Write-Host 'Images were built locally only. Add -Push after docker login to publish them.'
}
