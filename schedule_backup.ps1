# Registers the nightly POS backup at 11:00 PM Pakistan time (UTC+5),
# whatever time zone this PC is set to (the trigger is synchronized across time zones).
# Run once on each PC:  powershell -ExecutionPolicy Bypass -File D:\POS_Production\schedule_backup.ps1

$ErrorActionPreference = "Stop"
$taskName = "POS Daily Backup"
$script   = Join-Path $PSScriptRoot "backup_db.bat"
$user     = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

# Today's date, 23:00 at +05:00 (Pakistan has no daylight saving)
$start = (Get-Date).ToString("yyyy-MM-dd") + "T23:00:00+05:00"

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Nightly backup of the POS database (11 PM Pakistan time). Keeps 30 days in backups\.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$start</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$user</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$script</Command>
      <WorkingDirectory>$PSScriptRoot</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

Register-ScheduledTask -TaskName $taskName -Xml $xml -Force | Out-Null
$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Host "Scheduled '$taskName' at 11:00 PM Pakistan time."
Write-Host "Next run (this PC's clock): $($info.NextRunTime)"
