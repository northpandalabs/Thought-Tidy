; Thought Tidy -- custom installer pages
; Injected by electron-builder via nsis.include in package.json / electron-builder-test.yml.
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


; =============================================================================
; MAINTENANCE PAGE
; Shown only when already installed. Aborts (skips) on fresh install.
; =============================================================================
Function MaintenancePage
  ; Check per-user install, fall back to per-machine
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
  ${EndIf}
  ${If} $R0 == ""
    Abort  ; fresh install -- skip this page
  ${EndIf}

  StrCpy $INSTDIR $R0  ; pre-fill install dir from existing location

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
    ; Try quiet uninstall string first, fall back to regular
    ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "QuietUninstallString"
    ${If} $R1 == ""
      ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    ${EndIf}
    ${If} $R1 == ""
      ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    ${EndIf}
    ${If} $R1 != ""
      ExecWait '$R1'
    ${Else}
      MessageBox MB_ICONEXCLAMATION|MB_OK "Uninstaller not found. Please use Add/Remove Programs to remove Thought Tidy."
    ${EndIf}
    Quit
  ${EndIf}
  ; Update selected -- fall through to EULA and normal install
FunctionEnd


; =============================================================================
; SETUP OPTIONS -- desktop shortcut + auto-updater
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

  ${NSD_CreateLabel} 16u 71u 84% 24u "Runs silently in the background, downloads new versions automatically, and applies them on next launch."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function IconUpdaterLeave
  ; Desktop shortcut -- placeholder; electron-builder controls shortcut creation via nsis config.
  ${NSD_GetState} $hDesktopShortcut $0

  ; Auto-updater -- write preference to registry; main.js reads it on first launch.
  ${NSD_GetState} $hAutoUpdater $1
  WriteRegDWORD HKCU "Software\NorthPandaLabs\ThoughtTidy" "autoUpdater" $1
FunctionEnd

!endif ; BUILD_UNINSTALLER
