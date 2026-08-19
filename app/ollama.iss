; Inno Setup Installer for Ollama
;
; To build the installer use the build script invoked from the top of the source tree
; 
; powershell -ExecutionPolicy Bypass -File .\scripts\build_windows.ps


#define MyAppName "Ollama"
#if GetEnv("PKG_VERSION") != ""
  #define MyAppVersion GetEnv("PKG_VERSION")
#else
  #define MyAppVersion "0.0.0"
#endif
#define MyAppPublisher "Ollama"
#define MyAppURL "https://ollama.com/"
#define MyAppExeName "ollama app.exe"
#define LlamaServerExeName "llama-server.exe"
#define MyIcon ".\assets\app.ico"

[Setup]
; NOTE: The value of AppId uniquely identifies this application. Do not use the same AppId value in installers for other applications.
; (To generate a new GUID, click Tools | Generate GUID inside the IDE.)
; NOTE: AppId stays fixed even though this script now supports both a
; per-user and a machine-wide install (see PrivilegesRequiredOverridesAllowed
; below). A machine-wide install run on top of an existing per-user one would
; otherwise become a second, parallel copy under this same AppId - two
; ollama.exe, two tray apps, two PATH entries. InitializeSetup() in [Code]
; detects that case up front and handles it before any files are touched.
AppId={{44E83376-CE68-45EB-8FC1-393500EB558C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
VersionInfoVersion={#MyAppVersion}
;AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
ArchitecturesAllowed=x64compatible arm64
ArchitecturesInstallIn64BitMode=x64compatible arm64
; -----------------------------------------------------------------------
; Install scope / elevation
; -----------------------------------------------------------------------
; Historically this installer was per-user only (PrivilegesRequired=lowest,
; installing under {localappdata}\Programs, no UAC prompt ever). Adding an
; entry to the SYSTEM PATH requires an elevated process - HKLM's environment
; key is not writable otherwise. That's a Windows property, not a choice
; this script gets to make. Two ways to get there:
;
;   (a) PrivilegesRequired=admin - always elevate. Simplest, but turns this
;       from a per-user install into a machine-wide install for EVERYONE,
;       breaking the no-UAC-prompt experience every current user has, and
;       moving DefaultDirName out from under the user's own profile.
;
;   (b) PrivilegesRequiredOverridesAllowed=dialog (+ commandline) - keep the
;       declared default at PrivilegesRequired=lowest, so a plain double
;       click still installs per-user with no prompt exactly as today, and
;       let Inno show its own built-in "install for me only / install for
;       all users" dialog. Only a user who explicitly picks "all users" sees
;       the normal UAC prompt, and only then does Setup gain HKLM access.
;       "commandline" additionally lets an unattended install opt in via
;       /ALLUSERS or /CURRENTUSER, which this project's silent build/release
;       tooling needs since there is no dialog to answer under /VERYSILENT.
;
; (b) is implemented below: it is strictly additive for every existing
; user (nothing changes unless they opt in), and it is Inno's own supported
; mechanism for exactly this situation - see the {auto*} constants used for
; DefaultDirName/[Icons] and the HKA registry root used in [Registry],
; rather than this script hand-rolling elevation logic.
; -----------------------------------------------------------------------
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline
OutputBaseFilename="OllamaSetup"
SetupIconFile={#MyIcon}
UninstallDisplayIcon={uninstallexe}
Compression=lzma2/ultra64
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=8
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes
OutputDir=..\dist\

; Disable logging once everything's battle tested
; Filename will be %TEMP%\Setup Log*.txt
SetupLogging=yes
CloseApplications=no
RestartApplications=no
RestartIfNeededByRun=no

; https://jrsoftware.org/ishelp/index.php?topic=setup_wizardimagefile
WizardSmallImageFile=.\assets\setup.bmp

; Ollama requires Windows 10 22H2 or newer for proper unicode rendering
; TODO: consider setting this to 10.0.19045
MinVersion=10.0.10240

; First release that supports WinRT UI Composition for win32 apps
; MinVersion=10.0.17134
; First release with XAML Islands - possible UI path forward
; MinVersion=10.0.18362

; quiet...
DisableDirPage=yes
DisableFinishedPage=yes
DisableReadyMemo=yes
DisableReadyPage=yes
DisableStartupPrompt=yes

; TODO - percentage can't be set less than 100, so how to make it shorter?
; WizardSizePercent=100,80

SetupMutex=OllamaSetupMutex

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[LangOptions]
DialogFontSize=12

[Files]
#if FileExists("..\dist\windows-ollama-app-amd64.exe")
Source: "..\dist\windows-ollama-app-amd64.exe"; DestDir: "{app}"; DestName: "{#MyAppExeName}" ;Check: not IsArm64();  Flags: ignoreversion 64bit; BeforeInstall: TaskKill('{#MyAppExeName}')
Source: "..\dist\windows-amd64\ollama.exe"; DestDir: "{app}"; Check: not IsArm64(); Flags: ignoreversion 64bit; BeforeInstall: TaskKill('ollama.exe')
Source: "..\dist\windows-amd64\lib\ollama\*"; Excludes: "\mlx_*\*"; DestDir: "{app}\lib\ollama\"; Check: not IsArm64(); Flags: ignoreversion 64bit recursesubdirs
#endif

; For local development, rely on binary compatibility at runtime since we can't cross compile
#if FileExists("..\dist\windows-ollama-app-arm64.exe")
Source: "..\dist\windows-ollama-app-arm64.exe"; DestDir: "{app}"; DestName: "{#MyAppExeName}" ;Check: IsArm64();  Flags: ignoreversion 64bit; BeforeInstall: TaskKill('{#MyAppExeName}')
#else 
Source: "..\dist\windows-ollama-app-amd64.exe"; DestDir: "{app}"; DestName: "{#MyAppExeName}" ;Check: IsArm64();  Flags: ignoreversion 64bit; BeforeInstall: TaskKill('{#MyAppExeName}')
#endif

#if FileExists("..\dist\windows-arm64\ollama.exe")
Source: "..\dist\windows-arm64\ollama.exe"; DestDir: "{app}"; Check: IsArm64(); Flags: ignoreversion 64bit; BeforeInstall: TaskKill('ollama.exe')
#endif
#if DirExists("..\dist\windows-arm64\lib\ollama")
Source: "..\dist\windows-arm64\lib\ollama\*"; DestDir: "{app}\lib\ollama\"; Check: IsArm64(); Flags: ignoreversion 64bit recursesubdirs
#endif

Source: ".\assets\app.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"
Name: "{app}\lib\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"
; {autoprograms}: user Start Menu Programs folder for a per-user install,
; the common (all-users) one for a machine-wide install - stays consistent
; with whichever scope was chosen, instead of always landing in the
; installing user's own per-user Start Menu regardless of scope.
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"

[InstallDelete]
Type: files; Name: "{%LOCALAPPDATA}\Ollama\updates"

[Run]
Filename: "{cmd}"; Parameters: "/C set PATH={app};%PATH% & ""{app}\{#MyAppExeName}"""; Flags: postinstall nowait runhidden

[UninstallRun]
; Filename: "{cmd}"; Parameters: "/C ""taskkill /im ''{#MyAppExeName}'' /f /t"; Flags: runhidden
; Filename: "{cmd}"; Parameters: "/C ""taskkill /im ollama.exe /f /t"; Flags: runhidden
Filename: "taskkill"; Parameters: "/im ""{#MyAppExeName}"" /f /t"; Flags: runhidden
Filename: "taskkill"; Parameters: "/im ""ollama.exe"" /f /t"; Flags: runhidden
Filename: "taskkill"; Parameters: "/im ""{#LlamaServerExeName}"" /f /t"; Flags: runhidden
; HACK!  need to give the server and app enough time to exit
; TODO - convert this to a Pascal code script so it waits until they're no longer running, then completes
Filename: "{cmd}"; Parameters: "/c timeout 5"; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{%TEMP}\ollama*"
Type: filesandordirs; Name: "{%LOCALAPPDATA}\Ollama"
Type: filesandordirs; Name: "{%LOCALAPPDATA}\Programs\Ollama"
Type: filesandordirs; Name: "{%USERPROFILE}\.ollama\history"
Type: filesandordirs; Name: "{userstartup}\{#MyAppName}.lnk"
; NOTE: if the user has a custom OLLAMA_MODELS it will be preserved

[InstallDelete]
Type: filesandordirs; Name: "{%TEMP}\ollama*"
Type: filesandordirs; Name: "{app}\lib\ollama"

[Messages]
WizardReady=Ollama
ReadyLabel1=%nLet's get you up and running with your own large language models.
SetupAppRunningError=Another Ollama installer is running.%n%nPlease cancel or finish the other installer, then click OK to continue with this install, or Cancel to exit.


;FinishedHeadingLabel=Run your first model
;FinishedLabel=%nRun this command in a PowerShell or cmd terminal.%n%n%n    ollama run llama3.2
;ClickFinish=%n

[Registry]
; -----------------------------------------------------------------------
; PATH entry for {app}. Root uses Inno's built-in "auto" HKA root, which
; resolves to HKLM when this copy is running elevated/machine-wide
; (IsAdminInstallMode) and HKCU otherwise - it automatically follows
; whichever scope the PrivilegesRequiredOverridesAllowed dialog above
; resulted in, no extra code needed for the root itself. The *subkey text*
; genuinely differs between the two hives (HKCU's is just "Environment";
; HKLM's system one lives under Session Manager), so that part still goes
; through GetPathRegSubkey() in [Code]. ValueData goes through
; GetPathValueData() instead of the old "{olddata};{app}" so a machine with
; no existing Path value doesn't get a leading ";" written into it.
; -----------------------------------------------------------------------
Root: HKA; Subkey: "{code:GetPathRegSubkey}"; \
    ValueType: expandsz; ValueName: "Path"; ValueData: "{code:GetPathValueData}"; \
    Check: NeedsAddPath('{app}')
; Register ollama:// URL protocol. HKA (see above) so a machine-wide install
; registers the protocol for every user on the box instead of leaving it
; parked in just the installing user's HKCU.
Root: HKA; Subkey: "Software\Classes\ollama"; ValueType: string; ValueName: ""; ValueData: "URL:Ollama Protocol"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\ollama"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\ollama\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Flags: uninsdeletekey

[Code]

const
  { Must stay in sync with [Setup] AppId above. Hardcoded (rather than
    derived via {#SetupSetting("AppId")}) so the preprocessor's escaping of
    the literal '{' in AppId can never silently drift from this string -
    this way there's exactly one place a mismatch could hide, and it's
    visible by inspection next to AppId itself. }
  PerUserUninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{44E83376-CE68-45EB-8FC1-393500EB558C}_is1';

{ Resolves where the PATH entry for *this* copy belongs: HKLM's system
  environment when running machine-wide/elevated, HKCU's per-user one
  otherwise. Every PATH read/write in this script goes through this, so the
  install-time Registry entry, the install-time NeedsAddPath() check, and
  the uninstall-time removal can never disagree about which hive they mean. }
procedure GetPathRegLocation(var RootKey: Integer; var SubKeyName: string);
begin
  if IsAdminInstallMode() then begin
    RootKey := HKEY_LOCAL_MACHINE;
    SubKeyName := 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment';
  end else begin
    RootKey := HKEY_CURRENT_USER;
    SubKeyName := 'Environment';
  end;
end;

{ [Registry]'s Root: HKA already picks the right hive on its own; this just
  supplies the subkey text for that same line, which HKA cannot do since the
  two hives use different subkey paths for their environment key. }
function GetPathRegSubkey(Param: string): string;
var
  UnusedRootKey: Integer;
begin
  GetPathRegLocation(UnusedRootKey, Result);
end;

function NeedsAddPath(Param: string): boolean;
var
  RootKey: Integer;
  SubKeyName: string;
  OrigPath: string;
begin
  GetPathRegLocation(RootKey, SubKeyName);
  if not RegQueryStringValue(RootKey, SubKeyName, 'Path', OrigPath)
  then begin
    Result := True;
    exit;
  end;
  { look for the path with leading and trailing semicolon }
  { Pos() returns 0 if not found }
  Result := Pos(';' + ExpandConstant(Param) + ';', ';' + OrigPath + ';') = 0;
end;

{ Builds the new Path value for the [Registry] entry above. Deliberately not
  just "{olddata};{app}": when there is no existing Path value at all (fresh
  machine, or a fresh HKLM environment key), {olddata} expands to an empty
  string and that naive form would write a stray leading ";{app}" into the
  registry. This only appends a separating ";" when there is something to
  separate from. }
function GetPathValueData(Param: string): string;
var
  RootKey: Integer;
  SubKeyName: string;
  OrigPath: string;
  NewEntry: string;
begin
  GetPathRegLocation(RootKey, SubKeyName);
  NewEntry := ExpandConstant('{app}');
  if not RegQueryStringValue(RootKey, SubKeyName, 'Path', OrigPath) then
    OrigPath := '';
  if (OrigPath = '') then begin
    Result := NewEntry;
  end else if (OrigPath[Length(OrigPath)] = ';') then begin
    Result := OrigPath + NewEntry;
  end else begin
    Result := OrigPath + ';' + NewEntry;
  end;
end;

{ Removes exactly PathToRemove from the Path value at RootKey\SubKeyName, if
  present - never a blind overwrite of the whole value. Splits on ';',
  drops the one matching element, rejoins, and writes back as REG_EXPAND_SZ
  (matching how [Registry] declared it) so any %VARS% elsewhere on PATH keep
  expanding correctly. If the value is absent, or present but doesn't
  contain PathToRemove, this does nothing - quietly, on purpose. }
procedure RemovePathEntry(RootKey: Integer; SubKeyName, PathToRemove: string);
var
  OrigPath: string;
  Parts: TArrayOfString;
  NewPath: string;
  I: Integer;
begin
  if not RegQueryStringValue(RootKey, SubKeyName, 'Path', OrigPath) then
    exit;
  if Pos(';' + PathToRemove + ';', ';' + OrigPath + ';') = 0 then
    exit;

  Parts := StringSplit(OrigPath, [';'], stExcludeEmpty);
  NewPath := '';
  for I := 0 to GetArrayLength(Parts) - 1 do begin
    if Parts[I] <> PathToRemove then begin
      if NewPath = '' then
        NewPath := Parts[I]
      else
        NewPath := NewPath + ';' + Parts[I];
    end;
  end;

  if NewPath = '' then
    RegDeleteValue(RootKey, SubKeyName, 'Path')
  else
    RegWriteExpandStringValue(RootKey, SubKeyName, 'Path', NewPath);
end;

function InitializeSetup(): Boolean;
var
  UninstallString: string;
  ResultCode: Integer;
begin
  Result := True;

  { Migration hazard (see the AppId comment in [Setup]): only meaningful
    when THIS run is going machine-wide. A per-user install proceeding as
    per-user is unaffected, and a machine-wide install on a machine that
    never had a per-user copy finds no key here and is unaffected too. }
  if IsAdminInstallMode() then begin
    if RegKeyExists(HKEY_CURRENT_USER, PerUserUninstallKey) then begin
      UninstallString := '';
      RegQueryStringValue(HKEY_CURRENT_USER, PerUserUninstallKey, 'UninstallString', UninstallString);
      if UninstallString = '' then begin
        SuppressibleMsgBox(
          'An existing per-user installation of Ollama was found, but its uninstaller could not be located.' + #13#10 + #13#10 +
          'Please remove the existing per-user Ollama install manually (Settings > Apps), then run this setup again to install for all users.',
          mbError, MB_OK, IDOK);
        Result := False;
        exit;
      end;
      if SuppressibleMsgBox(
           'An existing per-user installation of Ollama was found.' + #13#10 + #13#10 +
           'Installing for all users on top of it would leave two separate copies of Ollama installed side by side (two apps, two PATH entries).' + #13#10 + #13#10 +
           'Click Yes to remove the existing per-user installation now and continue installing for all users, or No to cancel this setup.',
           mbConfirmation, MB_YESNO, IDYES) = IDYES
      then begin
        Log('Migration: removing existing per-user install before machine-wide install: ' + UninstallString);
        if (not Exec(RemoveQuotes(UninstallString), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '',
             SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then begin
          SuppressibleMsgBox(
            'Removing the existing per-user installation failed. Please uninstall it manually and run this setup again.',
            mbError, MB_OK, IDOK);
          Result := False;
          exit;
        end;
        { Belt and suspenders: the per-user copy just removed may have
          predated this installer's own uninstall-time PATH cleanup (see
          CurUninstallStepChanged below), so its uninstaller might not have
          stripped its HKCU PATH entry itself. Strip it explicitly here so a
          stale entry pointing at a now-deleted directory doesn't linger
          after migrating to the machine-wide copy. Uses the fixed per-user
          location directly (not GetPathRegLocation, which now reflects THIS
          machine-wide run) since it's deliberately cleaning up the OTHER
          scope. }
        RemovePathEntry(HKEY_CURRENT_USER, 'Environment', ExpandConstant('{localappdata}\Programs\{#MyAppName}'));
      end else begin
        Result := False;
        exit;
      end;
    end;
  end;
end;

function GetDirSize(Path: String): Int64;
var
  FindRec: TFindRec;
  FilePath: string;
  Size: Int64;
begin
  if FindFirst(Path + '\*', FindRec) then begin
    Result := 0;
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then begin
          FilePath := Path + '\' + FindRec.Name;
          if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then begin
            Size := GetDirSize(FilePath);
          end else begin
            Size := Int64(FindRec.SizeHigh) shl 32 + FindRec.SizeLow;
          end;
          Result := Result + Size;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end else begin
    Log(Format('Failed to list %s', [Path]));
    Result := -1;
  end;
end;

var
  DeleteModelsChecked: Boolean;
  ModelsDir: string;

procedure InitializeUninstallProgressForm();
var
  UninstallPage: TNewNotebookPage;
  UninstallButton: TNewButton;
  DeleteModelsCheckbox: TNewCheckBox;
  OriginalPageNameLabel: string;
  OriginalPageDescriptionLabel: string;
  OriginalCancelButtonEnabled: Boolean;
  OriginalCancelButtonModalResult: Integer;
  ctrl: TWinControl;
  ModelDirA: AnsiString;
  ModelsSize: Int64;
begin
  if not UninstallSilent then begin
    ctrl := UninstallProgressForm.CancelButton;
    UninstallButton := TNewButton.Create(UninstallProgressForm);
    UninstallButton.Parent := UninstallProgressForm;
    UninstallButton.Left := ctrl.Left - ctrl.Width - ScaleX(10);
    UninstallButton.Top := ctrl.Top;
    UninstallButton.Width := ctrl.Width;
    UninstallButton.Height := ctrl.Height;
    UninstallButton.TabOrder := ctrl.TabOrder;
    UninstallButton.Caption := 'Uninstall';
    UninstallButton.ModalResult := mrOK;    
    UninstallProgressForm.CancelButton.TabOrder := UninstallButton.TabOrder + 1;
    UninstallPage := TNewNotebookPage.Create(UninstallProgressForm);
    UninstallPage.Notebook := UninstallProgressForm.InnerNotebook;
    UninstallPage.Parent := UninstallProgressForm.InnerNotebook;
    UninstallPage.Align := alClient;
    UninstallProgressForm.InnerNotebook.ActivePage := UninstallPage;

    ctrl := UninstallProgressForm.StatusLabel;
    with TNewStaticText.Create(UninstallProgressForm) do begin
      Parent := UninstallPage;
      Top := ctrl.Top;
      Left := ctrl.Left;
      Width := ctrl.Width;
      Height := ctrl.Height;
      AutoSize := False;
      ShowAccelChar := False;
      Caption := '';
    end;

    if (DirExists(GetEnv('USERPROFILE') + '\.ollama\models\blobs')) then begin
      ModelsDir := GetEnv('USERPROFILE') + '\.ollama\models';
      ModelsSize := GetDirSize(ModelsDir);
    end;

    DeleteModelsCheckbox := TNewCheckBox.Create(UninstallProgressForm);
    DeleteModelsCheckbox.Parent := UninstallPage;
    DeleteModelsCheckbox.Top := ctrl.Top + ScaleY(30);
    DeleteModelsCheckbox.Left := ctrl.Left;
    DeleteModelsCheckbox.Width := ScaleX(300);
    if ModelsSize > 1024*1024*1024 then begin
      DeleteModelsCheckbox.Caption := 'Remove models (' + IntToStr(ModelsSize/(1024*1024*1024)) + ' GB) ' + ModelsDir;
    end else if ModelsSize > 1024*1024 then begin
      DeleteModelsCheckbox.Caption := 'Remove models (' + IntToStr(ModelsSize/(1024*1024)) + ' MB) ' + ModelsDir;
    end else begin
      DeleteModelsCheckbox.Caption := 'Remove models ' + ModelsDir;
    end;
    DeleteModelsCheckbox.Checked := True;

    OriginalPageNameLabel := UninstallProgressForm.PageNameLabel.Caption;
    OriginalPageDescriptionLabel := UninstallProgressForm.PageDescriptionLabel.Caption;
    OriginalCancelButtonEnabled := UninstallProgressForm.CancelButton.Enabled;
    OriginalCancelButtonModalResult := UninstallProgressForm.CancelButton.ModalResult;

    UninstallProgressForm.PageNameLabel.Caption := '';
    UninstallProgressForm.PageDescriptionLabel.Caption := '';
    UninstallProgressForm.CancelButton.Enabled := True;
    UninstallProgressForm.CancelButton.ModalResult := mrCancel;

    if UninstallProgressForm.ShowModal = mrCancel then Abort;

    UninstallButton.Visible := False;   
    UninstallProgressForm.PageNameLabel.Caption := OriginalPageNameLabel;
    UninstallProgressForm.PageDescriptionLabel.Caption := OriginalPageDescriptionLabel;
    UninstallProgressForm.CancelButton.Enabled := OriginalCancelButtonEnabled;
    UninstallProgressForm.CancelButton.ModalResult := OriginalCancelButtonModalResult;

    UninstallProgressForm.InnerNotebook.ActivePage := UninstallProgressForm.InstallingPage;

    if DeleteModelsCheckbox.Checked then begin
      DeleteModelsChecked:=True;
    end else begin
      DeleteModelsChecked:=False;
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  PathRootKey: Integer;
  PathSubKeyName: string;
begin
  if CurUninstallStep = usDone then begin
    { Undo the [Registry] PATH entry this installer added at install time.
      This was previously missing entirely, so every uninstall quietly left
      a dangling PATH entry pointing at a directory that no longer existed.
      Scope (HKCU vs HKLM) mirrors however *this* copy was installed - see
      GetPathRegLocation. RemovePathEntry only ever touches its own exact
      element, never the whole value, so anything else on PATH is left
      exactly as it was. }
    GetPathRegLocation(PathRootKey, PathSubKeyName);
    RemovePathEntry(PathRootKey, PathSubKeyName, ExpandConstant('{app}'));

    if DeleteModelsChecked then begin
      Log('user requested model cleanup');
      if (VarIsEmpty(ModelsDir)) then begin
        Log('cleaning up home directory models')
        DelTree(GetEnv('USERPROFILE') + '\.ollama\models', True, True, True);
      end else begin
        Log('cleaning up custom directory models ' + ModelsDir)
        DelTree(ModelsDir + '\blobs', True, True, True);
        DelTree(ModelsDir + '\manifests', True, True, True);
      end;
    end else begin
      Log('user requested to preserve model dir');
    end;
  end;
end;

procedure TaskKill(FileName: String);
var
  ResultCode: Integer;
begin
    Exec('taskkill.exe', '/f /t /im ' + '"' + FileName + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    if FileName <> '{#LlamaServerExeName}' then begin
      Exec('taskkill.exe', '/f /t /im "{#LlamaServerExeName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
end;
