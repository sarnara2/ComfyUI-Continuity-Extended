$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$settings = $env:CONTINUITY_SHEET_SAVE | ConvertFrom-Json
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$owner = New-Object System.Windows.Forms.Form
try {
    $owner.FormBorderStyle = 'None'
    $owner.ShowInTaskbar = $false
    $owner.Opacity = 0
    $owner.TopMost = $true
    $owner.StartPosition = 'CenterScreen'
    $owner.Size = New-Object System.Drawing.Size(1, 1)
    $dialog.Title = $settings.title
    $dialog.FileName = $settings.filename
    $dialog.Filter = 'PNG (*.png)|*.png'
    $dialog.DefaultExt = 'png'
    $dialog.AddExtension = $true
    $dialog.CheckPathExists = $true
    $dialog.OverwritePrompt = $false
    $dialog.RestoreDirectory = $true
    $owner.Show()
    if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::Write($dialog.FileName)
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    $dialog.Dispose()
    $owner.Close()
    $owner.Dispose()
}
