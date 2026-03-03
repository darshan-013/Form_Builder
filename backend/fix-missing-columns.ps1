# ═══════════════════════════════════════════════════════════════
# Fix Missing options_json and validation_json Columns
# ═══════════════════════════════════════════════════════════════

Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " Fixing Missing Database Columns" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Database connection details
$PGHOST = "localhost"
$PGPORT = "5432"
$PGDATABASE = "formbuilder"
$PGUSER = "postgres"
$PGPASSWORD = "admin"

# SQL file path
$SQL_FILE = Join-Path $PSScriptRoot "add_missing_columns.sql"

Write-Host "→ Database: $PGDATABASE" -ForegroundColor Yellow
Write-Host "→ User: $PGUSER" -ForegroundColor Yellow
Write-Host ""

# Set environment variable for password
$env:PGPASSWORD = $PGPASSWORD

Write-Host "→ Running SQL migration..." -ForegroundColor Green

try {
    # Run the SQL file
    & "C:\Users\darsh\.gemini\antigravity\scratch\form-builder\pg\pgsql\bin\psql.exe" `
        -h $PGHOST `
        -p $PGPORT `
        -U $PGUSER `
        -d $PGDATABASE `
        -f $SQL_FILE

    Write-Host ""
    Write-Host "✓ Migration completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "→ Verifying columns..." -ForegroundColor Yellow

    # Verify columns exist
    & "C:\Users\darsh\.gemini\antigravity\scratch\form-builder\pg\pgsql\bin\psql.exe" `
        -h $PGHOST `
        -p $PGPORT `
        -U $PGUSER `
        -d $PGDATABASE `
        -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'form_fields' AND column_name IN ('options_json', 'validation_json');"

    Write-Host ""
    Write-Host "✓ All done! Restart your backend now." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Restart backend (Ctrl+C in backend terminal, then run again)" -ForegroundColor White
    Write-Host "  2. Refresh your browser" -ForegroundColor White
    Write-Host "  3. Dropdown/radio options should now appear!" -ForegroundColor White
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "✗ Error running migration:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
}

# Clear password from environment
$env:PGPASSWORD = ""

