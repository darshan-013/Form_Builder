# ═══════════════════════════════════════════════════════════════
# Migrate Options from JSON to Normalized Table
# ═══════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " Migrating Options: JSON → Normalized Table" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$PGHOST = "localhost"
$PGPORT = "5432"
$PGDATABASE = "formbuilder"
$PGUSER = "postgres"
$PGPASSWORD = "admin"

$PSQL = "C:\Users\darsh\.gemini\antigravity\scratch\form-builder\pg\pgsql\bin\psql.exe"
$MIGRATION_FILE = Join-Path $PSScriptRoot "migrate_options_to_normalized.sql"

Write-Host "→ Database: $PGDATABASE" -ForegroundColor Yellow
Write-Host "→ Migration file: $(Split-Path -Leaf $MIGRATION_FILE)" -ForegroundColor Yellow
Write-Host ""

# Set password
$env:PGPASSWORD = $PGPASSWORD

Write-Host "Step 1: Creating field_options table..." -ForegroundColor Green
Write-Host ""

try {
    # Run migration
    & $PSQL `
        -h $PGHOST `
        -p $PGPORT `
        -U $PGUSER `
        -d $PGDATABASE `
        -f $MIGRATION_FILE

    Write-Host ""
    Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host " Migration Complete!" -ForegroundColor Green
    Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "✓ field_options table created" -ForegroundColor Green
    Write-Host "✓ Existing JSON options migrated to normalized format" -ForegroundColor Green
    Write-Host "✓ Indexes created for performance" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor White
    Write-Host "  1. Restart your backend: mvn spring-boot:run" -ForegroundColor Gray
    Write-Host "  2. Refresh browser" -ForegroundColor Gray
    Write-Host "  3. Check backend logs for any errors" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Note: Both JSON and normalized options are supported!" -ForegroundColor Yellow
    Write-Host "  - Existing forms: continue using JSON (backward compatible)" -ForegroundColor Gray
    Write-Host "  - New forms: can use normalized table (better features)" -ForegroundColor Gray
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "✗ Migration failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
}

# Clear password
$env:PGPASSWORD = ""

