; Atlas Helper installer for Windows. Built by .github/workflows/updater.yml with Inno Setup 6.
; It installs for the current user only, so no administrator password is asked for. The helper runs from the folder
; it is installed in, and its settings and language packs are kept in %LOCALAPPDATA%\AtlasTranslation.

#ifndef MyAppVersion
  #define MyAppVersion "0.0.2.5"
#endif
#ifndef SourceExe
  #define SourceExe "..\target\release\atlas-updater.exe"
#endif

[Setup]
AppId={{EDBD6038-BA8A-4970-8ED3-8B43B3FE1F42}
AppName=Atlas Helper
AppVersion={#MyAppVersion}
AppVerName=Atlas Helper {#MyAppVersion}
AppPublisher=Atlas Translation
AppPublisherURL=https://github.com/loxdpsy/AT
AppSupportURL=https://github.com/loxdpsy/AT/issues
DefaultDirName={localappdata}\Programs\Atlas Helper
DefaultGroupName=Atlas Helper
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=atlas-updater-windows-setup
SetupIconFile=..\assets\atlas-helper.ico
UninstallDisplayIcon={app}\atlas-updater.exe
UninstallDisplayName=Atlas Helper
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
CloseApplicationsFilter=atlas-updater.exe
RestartApplications=no
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany=Atlas Translation
VersionInfoProductName=Atlas Helper

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "autostart"; Description: "Start Atlas Helper in the tray when I sign in to Windows"; GroupDescription: "Start:"; Flags: checkedonce

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "atlas-updater.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\Atlas Helper"; Filename: "{app}\atlas-updater.exe"; IconFilename: "{app}\atlas-updater.exe"
Name: "{group}\Uninstall Atlas Helper"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Atlas Helper"; Filename: "{app}\atlas-updater.exe"; Tasks: desktopicon

[Registry]
; The same value the helper's Settings switch writes. --serve starts it in the tray with no window.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AtlasTranslationHelper"; ValueData: """{app}\atlas-updater.exe"" --serve"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Opens the window once, so the welcome page explains the browser steps. Skipped in silent installs.
Filename: "{app}\atlas-updater.exe"; Description: "Open Atlas Helper"; Flags: nowait postinstall skipifsilent
