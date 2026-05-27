; installer.nsh — Thought Tidy custom NSIS installer logic
;
; Maintenance page:
;   Fresh install  → page is skipped (Abort in btcMaintCreate)
;   Same version   → Repair (default) / Modify / Uninstall
;   Newer version  → Upgrade (default) / Repair / Modify / Uninstall
;
; Features page (inline checkbox, no popup):
;   Shown before install on both fresh install and upgrade/modify.
;   Replaces the old MessageBox prompt that appeared after files were written.

; ── customHeader ─────────────────────────────────────────────────────────────
; Guards with !ifndef BUILD_UNINSTALLER so Var/Function/Page declarations are
; only emitted in the installer pass (electron-builder defines BUILD_UNINSTALLER
; when compiling the uninstaller).

!macro customHeader
  !ifndef BUILD_UNINSTALLER

  Var BTC_INST_VER      ; display version that is currently installed
  Var BTC_UNINST_STR    ; existing UninstallString from the registry
  Var BTC_RB_UPDATE     ; HWND of "Upgrade" radio (empty string when same ver)
  Var BTC_RB_REPAIR     ; HWND of "Repair" radio
  Var BTC_RB_MODIFY     ; HWND of "Modify" radio
  Var BTC_RB_UNINSTALL  ; HWND of "Uninstall" radio

  Var BTC_CB_QUICKCMDS  ; HWND of the AI Quick Commands checkbox
  Var BTC_QC_ENABLED    ; "1" if the feature should be installed, "0" if not

  ; ── Maintenance page: Create ───────────────────────────────────
  Function btcMaintCreate
    ; Look for per-user install first, then per-machine
    ReadRegStr $BTC_UNINST_STR HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
      "UninstallString"
    ${If} $BTC_UNINST_STR == ""
      ReadRegStr $BTC_UNINST_STR HKLM \
        "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
        "UninstallString"
    ${EndIf}

    ; Not installed — skip this page, go straight to normal install
    ${If} $BTC_UNINST_STR == ""
      Abort
    ${EndIf}

    ; Read installed version for display and comparison
    ReadRegStr $BTC_INST_VER HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
      "DisplayVersion"
    ${If} $BTC_INST_VER == ""
      ReadRegStr $BTC_INST_VER HKLM \
        "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
        "DisplayVersion"
    ${EndIf}
    ${If} $BTC_INST_VER == ""
      StrCpy $BTC_INST_VER "an earlier version"
    ${EndIf}

    ; Build the custom page
    nsDialogs::Create 1018
    Pop $0

    ${NSD_CreateLabel} 0 0 100% 30u \
      "$(^Name) $BTC_INST_VER is already installed. Choose an action:"
    Pop $0

    ${If} $BTC_INST_VER != "${VERSION}"
      ; ── Upgrade scenario ──────────────────────────────────────
      ${NSD_CreateRadioButton} 0 36u 100% 14u \
        "Upgrade to ${VERSION}: install the latest version"
      Pop $BTC_RB_UPDATE
      ${NSD_SetState} $BTC_RB_UPDATE ${BST_CHECKED}

      ${NSD_CreateRadioButton} 0 56u 100% 14u \
        "Repair: reinstall files, keep your settings"
      Pop $BTC_RB_REPAIR

      ${NSD_CreateRadioButton} 0 74u 100% 14u \
        "Modify: add or remove optional features"
      Pop $BTC_RB_MODIFY

      ${NSD_CreateRadioButton} 0 92u 100% 14u \
        "Uninstall: remove $(^Name) from this computer"
      Pop $BTC_RB_UNINSTALL
    ${Else}
      ; ── Same version scenario ─────────────────────────────────
      StrCpy $BTC_RB_UPDATE ""   ; no upgrade option

      ${NSD_CreateRadioButton} 0 36u 100% 14u \
        "Repair: reinstall files, keep your settings"
      Pop $BTC_RB_REPAIR
      ${NSD_SetState} $BTC_RB_REPAIR ${BST_CHECKED}

      ${NSD_CreateRadioButton} 0 54u 100% 14u \
        "Modify: add or remove optional features"
      Pop $BTC_RB_MODIFY

      ${NSD_CreateRadioButton} 0 72u 100% 14u \
        "Uninstall: remove $(^Name) from this computer"
      Pop $BTC_RB_UNINSTALL
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  ; ── Maintenance page: Leave (user clicked Next) ────────────────
  Function btcMaintLeave
    ; Upgrade selected?
    ${If} $BTC_RB_UPDATE != ""
      ${NSD_GetState} $BTC_RB_UPDATE $R0
      ${If} $R0 == ${BST_CHECKED}
        Return   ; proceed — files will be overwritten (upgrade)
      ${EndIf}
    ${EndIf}

    ; Repair selected?
    ${NSD_GetState} $BTC_RB_REPAIR $R0
    ${If} $R0 == ${BST_CHECKED}
      Return     ; proceed — files will be reinstalled (repair)
    ${EndIf}

    ; Modify selected?
    ${NSD_GetState} $BTC_RB_MODIFY $R0
    ${If} $R0 == ${BST_CHECKED}
      Return     ; proceed — feature checkboxes shown on next page
    ${EndIf}

    ; Uninstall selected?
    ${NSD_GetState} $BTC_RB_UNINSTALL $R0
    ${If} $R0 == ${BST_CHECKED}
      ExecWait '"$BTC_UNINST_STR" /S'
      Quit
    ${EndIf}
  FunctionEnd

  ; ── Features page: Create ──────────────────────────────────────
  ; Shown inline in the installer — no popup. Runs before files are written.
  Function btcFeaturesCreate
    nsDialogs::Create 1018
    Pop $0

    ${NSD_CreateLabel} 0 0 100% 24u \
      "Select optional features to install with Thought Tidy:"
    Pop $0

    ; Default the checkbox from the existing registry value (for upgrades/modifies)
    ReadRegStr $R9 HKCU "Software\${APP_ID}\Features" "QuickCommands"
    ${If} $R9 == "1"
      StrCpy $R9 ${BST_CHECKED}
    ${Else}
      StrCpy $R9 ${BST_UNCHECKED}
    ${EndIf}

    ${NSD_CreateCheckbox} 10u 30u 100% 14u \
      "AI Quick Commands — adds Email Reply, Slack, and LinkedIn Post prompt presets"
    Pop $BTC_CB_QUICKCMDS
    ${NSD_SetState} $BTC_CB_QUICKCMDS $R9

    nsDialogs::Show
  FunctionEnd

  ; ── Features page: Leave (user clicked Next) ───────────────────
  ; Saves checkbox state into BTC_QC_ENABLED so customInstall can read it.
  Function btcFeaturesLeave
    ${NSD_GetState} $BTC_CB_QUICKCMDS $R0
    ${If} $R0 == ${BST_CHECKED}
      StrCpy $BTC_QC_ENABLED "1"
    ${Else}
      StrCpy $BTC_QC_ENABLED "0"
    ${EndIf}
  FunctionEnd

  ; Insert the maintenance page first, then the features page.
  ; Both come before the standard installer pages (directory, install, finish).
  Page Custom btcMaintCreate btcMaintLeave
  Page Custom btcFeaturesCreate btcFeaturesLeave

  !endif  ; BUILD_UNINSTALLER
!macroend

; ── customInit: nothing needed (maintenance handled by the custom page) ───────

!macro customInit
!macroend

; ── Optional feature: AI Quick Commands ──────────────────────────────────────
; Reads BTC_QC_ENABLED set by the features page (no popup).
; Falls back to "install" on silent installs (/S flag) where pages are skipped.

!macro customInstall
  ; On silent install BTC_QC_ENABLED is empty — default to installing the feature
  ${If} $BTC_QC_ENABLED == ""
    StrCpy $BTC_QC_ENABLED "1"
  ${EndIf}

  ${If} $BTC_QC_ENABLED == "1"
    WriteRegStr HKCU "Software\${APP_ID}\Features" "QuickCommands" "1"
    CreateDirectory "$APPDATA\Thought Tidy"
    FileOpen $R7 "$APPDATA\Thought Tidy\quick-commands.json" w
    FileWrite $R7 '[$\r$\n'
    FileWrite $R7 '  { "name": "Email Reply",   "prompt": "Write a professional, concise reply to this email." },$\r$\n'
    FileWrite $R7 '  { "name": "Slack Message", "prompt": "Rewrite this as a short, casual Slack message." },$\r$\n'
    FileWrite $R7 '  { "name": "LinkedIn Post", "prompt": "Turn this into a polished LinkedIn post." }$\r$\n'
    FileWrite $R7 ']'
    FileClose $R7
  ${Else}
    DeleteRegValue HKCU "Software\${APP_ID}\Features" "QuickCommands"
    Delete "$APPDATA\Thought Tidy\quick-commands.json"
  ${EndIf}
!macroend

; ── Clean up feature data on uninstall ───────────────────────────────────────

!macro customUnInstall
  DeleteRegKey HKCU "Software\${APP_ID}\Features"
  Delete "$APPDATA\Thought Tidy\quick-commands.json"
  Delete "$APPDATA\Thought Tidy\thought-tidy-settings.json"
  RMDir  "$APPDATA\Thought Tidy"
!macroend
