# dev.ps1 — lance les trois services de Local Signal en une commande.
#
#   .\dev.ps1            API + web + mobile
#   .\dev.ps1 -SansMobile  API + web seulement
#
# Chaque service part dans sa propre fenêtre : les journaux restent lisibles et
# on peut en arrêter un sans tuer les autres. Tout se lance depuis la racine du
# dépôt, conformément à CLAUDE.md §11.

param(
    [switch]$SansMobile
)

$ErrorActionPreference = "Stop"
$racine = $PSScriptRoot

# L'app mobile appelle l'API par cette adresse. Sur un téléphone réel, Expo Go
# ne peut pas joindre « localhost » : il faut l'IP de la machine sur le réseau
# local. On la détecte, sinon on retombe sur localhost pour le navigateur.
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and
                      $_.IPAddress -notmatch '^169\.254\.' } |
       Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "localhost" }

function Demarrer($titre, $commande) {
    Write-Host "  -> $titre" -ForegroundColor Cyan
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "`$host.UI.RawUI.WindowTitle = '$titre'; Set-Location '$racine'; $commande"
    )
}

Write-Host ""
Write-Host "Local Signal — demarrage" -ForegroundColor Green
Write-Host ""

Demarrer "API"    "python -m uvicorn backend.main:app --reload --port 8000 --host 0.0.0.0"
Demarrer "Web"    "npm run dev --prefix apps/web"

if (-not $SansMobile) {
    Demarrer "Mobile" "`$env:EXPO_PUBLIC_API_BASE = 'http://${ip}:8000'; npm start --prefix apps/mobile"
}

Write-Host ""
Write-Host "  API      http://localhost:8000/docs"
Write-Host "  Web      http://localhost:5173"
if (-not $SansMobile) {
    Write-Host "  Mobile   scannez le QR code dans la fenetre 'Mobile'"
    Write-Host "           (l'app appellera l'API sur http://${ip}:8000)"
}
Write-Host ""
Write-Host "Chaque service a sa fenetre. Ctrl+C dans une fenetre arrete ce service la."
Write-Host ""
