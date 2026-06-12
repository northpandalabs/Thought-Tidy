; Thought Tidy -- custom installer pages
; Injected by electron-builder via nsis.include in package.json / electron-builder-test.yml.
;
; Suppress default "Nullsoft Install System vX.X" branding in the installer caption bar.
BrandingText "NorthPanda Labs"
;
; Page flow -- fresh install:
;   licensePage              -> full EULA (legal/eula.txt, via license config)
;   MUI_PAGE_DIRECTORY       -> location
;   customPageAfterChangeDir -> IconUpdaterPage
;   MUI_PAGE_INSTFILES       -> install
;   MUI_PAGE_FINISH          -> run after close
;
; Page flow -- already installed (customWelcomePage detects via registry):
;   MaintenancePage          -> Update or Remove
;     Update -> continues to EULA + normal install flow
;     Remove -> runs uninstaller silently, then quits

!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"

; -- Hook: maintenance check (shown before EULA, skips itself on fresh install)
!macro customWelcomePage
  Page custom MaintenancePage MaintenanceLeave
!macroend

; -- Hook: setup options after directory ---------------------------------------
!macro customPageAfterChangeDir
  Page custom IconUpdaterPage IconUpdaterLeave
!macroend

; Vars and functions are installer-only -- skip during uninstaller compilation pass.
!ifndef BUILD_UNINSTALLER

Var hDialog
Var hOptUpdate
Var hOptRemove
Var hDesktopShortcut
Var hAutoUpdater
Var hStartWithWindows
Var UninstallStr


; =============================================================================
; MAINTENANCE PAGE
; Shown only when already installed. Aborts (skips) on fresh install.
; =============================================================================
Function MaintenancePage
  ; electron-builder does not write InstallLocation -- use UninstallString instead.
  ; Check per-user (HKCU) first, then per-machine (HKLM).
  ReadRegStr $UninstallStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${If} $UninstallStr == ""
    ReadRegStr $UninstallStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${EndIf}
  ${If} $UninstallStr == ""
    Abort  ; fresh install -- skip this page
  ${EndIf}

  ; Derive $INSTDIR from the uninstaller path (strip quotes then get parent folder)
  StrCpy $R0 $UninstallStr
  StrCpy $R0 $R0 "" 1        ; strip leading quote
  ${GetParent} $R0 $R1
  StrCpy $INSTDIR $R1

  nsDialogs::Create 1018
  Pop $hDialog
  ${If} $hDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 14u "Thought Tidy is already installed"
  Pop $0

  ${NSD_CreateLabel} 0 18u 100% 12u "What would you like to do?"
  Pop $0

  ${NSD_CreateRadioButton} 0 36u 100% 14u "Update or repair the current installation"
  Pop $hOptUpdate
  ${NSD_SetState} $hOptUpdate ${BST_CHECKED}

  ${NSD_CreateLabel} 16u 52u 84% 18u "Reinstalls the latest version, keeping your settings and data."
  Pop $0

  ${NSD_CreateRadioButton} 0 76u 100% 14u "Remove Thought Tidy from this computer"
  Pop $hOptRemove

  ${NSD_CreateLabel} 16u 92u 84% 18u "Uninstalls the application. Your saved settings will be deleted."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function MaintenanceLeave
  ${NSD_GetState} $hOptRemove $R0
  ${If} $R0 == ${BST_CHECKED}
    ; $UninstallStr was captured in MaintenancePage
    ${If} $UninstallStr != ""
      ExecWait '$UninstallStr'
    ${Else}
      MessageBox MB_ICONEXCLAMATION|MB_OK "Uninstaller not found. Please use Add/Remove Programs to remove Thought Tidy."
    ${EndIf}
    Quit
  ${EndIf}
  ; Update selected -- fall through to EULA and normal install
FunctionEnd


; =============================================================================
; SETUP OPTIONS -- desktop shortcut + auto-updater + start with Windows
; =============================================================================
Function IconUpdaterPage
  nsDialogs::Create 1018
  Pop $hDialog
  ${If} $hDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 14u "Setup Options"
  Pop $0

  ${NSD_CreateCheckbox} 0 18u 100% 13u "Create desktop shortcut"
  Pop $hDesktopShortcut
  ${NSD_SetState} $hDesktopShortcut ${BST_CHECKED}

  ${NSD_CreateLabel} 16u 33u 84% 18u "Add a Thought Tidy icon to your desktop."
  Pop $0

  ${NSD_CreateCheckbox} 0 56u 100% 13u "Auto-updater background service  (~5 MB)"
  Pop $hAutoUpdater
  ${NSD_SetState} $hAutoUpdater ${BST_CHECKED}

  ${NSD_CreateLabel} 16u 71u 84% 20u "Runs silently in the background, downloads new versions automatically, and applies them on next launch."
  Pop $0

  ${NSD_CreateCheckbox} 0 96u 100% 13u "Start with Windows"
  Pop $hStartWithWindows
  ${NSD_SetState} $hStartWithWindows ${BST_CHECKED}

  ${NSD_CreateLabel} 16u 111u 84% 18u "Automatically launch Thought Tidy when you log in."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function IconUpdaterLeave
  ; Desktop shortcut -- placeholder; electron-builder controls shortcut creation via nsis config.
  ${NSD_GetState} $hDesktopShortcut $0

  ; Auto-updater -- write preference to registry; main.js reads it on first launch.
  ${NSD_GetState} $hAutoUpdater $1
  WriteRegDWORD HKCU "Software\NorthPandaLabs\ThoughtTidy" "autoUpdater" $1

  ; Start with Windows -- create or skip startup folder shortcut directly.
  ${NSD_GetState} $hStartWithWindows $2
  ${If} $2 == ${BST_CHECKED}
    CreateShortcut "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Thought Tidy.lnk" "$INSTDIR\Thought Tidy.exe"
  ${Else}
    Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Thought Tidy.lnk"
  ${EndIf}
FunctionEnd

!endif ; BUILD_UNINSTALLER

; Remove startup shortcut on uninstall.
!macro customUnInstall
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Thought Tidy.lnk"
!macroend
