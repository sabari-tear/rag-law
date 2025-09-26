# Download Base Papers for Legal RAG Project
Write-Host "📚 Downloading Base Papers for IEEE Publication..." -ForegroundColor Green

# Create references directory
$refDir = "D:\final project\code\references"
if (!(Test-Path $refDir)) {
    New-Item -ItemType Directory -Path $refDir
}

Set-Location $refDir

# Download base papers
Write-Host "⬇️ Downloading RAG Foundation Paper..." -ForegroundColor Yellow
Invoke-WebRequest -Uri "https://arxiv.org/pdf/2005.11401.pdf" -OutFile "01_Lewis2020_RAG_Foundation.pdf"

Write-Host "⬇️ Downloading Legal AI Survey Paper..." -ForegroundColor Yellow  
Invoke-WebRequest -Uri "https://arxiv.org/pdf/2004.12158.pdf" -OutFile "02_Zhong2020_LegalAI_Survey.pdf"

Write-Host "⬇️ Downloading LexGLUE Benchmark Paper..." -ForegroundColor Yellow
Invoke-WebRequest -Uri "https://arxiv.org/pdf/2110.00976.pdf" -OutFile "03_Chalkidis2021_LexGLUE.pdf"

Write-Host "⬇️ Downloading Dense Passage Retrieval Paper..." -ForegroundColor Yellow
Invoke-WebRequest -Uri "https://arxiv.org/pdf/2004.04906.pdf" -OutFile "04_Karpukhin2020_DensePassageRetrieval.pdf"

Write-Host "⬇️ Downloading Sentence-BERT Paper..." -ForegroundColor Yellow
Invoke-WebRequest -Uri "https://arxiv.org/pdf/1908.10084.pdf" -OutFile "05_Reimers2019_SentenceBERT.pdf"

Write-Host "✅ Downloaded 5 key reference papers!" -ForegroundColor Green
Write-Host "📁 Papers saved to: $refDir" -ForegroundColor Cyan

Get-ChildItem $refDir | Select-Object Name, @{Name='Size(KB)';Expression={[math]::Round($_.Length/1KB,1)}} | Format-Table -AutoSize