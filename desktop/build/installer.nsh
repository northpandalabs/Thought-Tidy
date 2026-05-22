; installer.nsh — Blur-to-Clear custom NSIS installer logic
;
; Maintenance page:
;   Fresh install  → page is skipped (Abort in btcMaintCreate)
;   Same version   → Repair (default) / Modify / Uninstall
;   Newer version  → Upgrade (default) / Repair / Modify / Uninstall
;
; Optional feature: "AI Quick Commands" preset pack (add/remove demo)

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

  ; ── Page: Create ───────────────────────────────────────────────
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
        "Upgrade to ${VERSION}  —  install the latest version"
      Pop $BTC_RB_UPDATE
      ${NSD_SetState} $BTC_RB_UPDATE ${BST_CHECKED}

      ${NSD_CreateRadioButton} 0 56u 100% 14u \
        "Repair  —  reinstall files, keep your settings"
      Pop $BTC_RB_REPAIR

      ${NSD_CreateRadioButton} 0 74u 100% 14u \
        "Modify  —  add or remove optional features"
      Pop $BTC_RB_MODIFY

      ${NSD_CreateRadioButton} 0 92u 100% 14u \
        "Uninstall  —  remove $(^Name) from this computer"
      Pop $BTC_RB_UNINSTALL
    ${Else}
      ; ── Same version scenario ─────────────────────────────────
      StrCpy $BTC_RB_UPDATE ""   ; no upgrade option

      ${NSD_CreateRadioButton} 0 36u 100% 14u \
        "Repair  —  reinstall files, keep your settings"
      Pop $BTC_RB_REPAIR
      ${NSD_SetState} $BTC_RB_REPAIR ${BST_CHECKED}

      ${NSD_CreateRadioButton} 0 54u 100% 14u \
        "Modify  —  add or remove optional features"
      Pop $BTC_RB_MODIFY

      ${NSD_CreateRadioButton} 0 72u 100% 14u \
        "Uninstall  —  remove $(^Name) from this computer"
      Pop $BTC_RB_UNINSTALL
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  ; ── Page: Leave (user clicked Next) ────────────────────────────
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
      Return     ; proceed — customInstall will prompt for features
    ${EndIf}

    ; Uninstall selected?
    ${NSD_GetState} $BTC_RB_UNINSTALL $R0
    ${If} $R0 == ${BST_CHECKED}
      ExecWait '"$BTC_UNINST_STR" /S'
      Quit
    ${EndIf}
  FunctionEnd

  ; Insert the maintenance page before the normal installer pages
  Page Custom btcMaintCreate btcMaintLeave

  !endif  ; BUILD_UNINSTALLER
!macroend

; ── customInit: nothing needed (maintenance handled by the custom page) ───────

!macro customInit
!macroend

; ── Optional feature: AI Quick Commands ──────────────────────────────────────
; Runs after files are installed. Asks Yes/No per feature.
; Remembers current state via registry so re-running shows the right default.

!macro customInstall
  ReadRegStr $R8 HKCU "Software\${APP_ID}\Features" "QuickCommands"

  ${If} $R8 == "1"
    StrCpy $R6 "Optional Feature: AI Quick Commands$\n$\n\
This feature is already installed.$\n\
It adds sample prompt presets to your tray Quick Fix menu:$\n\
  - Email Reply$\n\
  - Slack Message$\n\
  - LinkedIn Post$\n$\n\
Keep this feature?"
  ${Else}
    StrCpy $R6 "Optional Feature: AI Quick Commands$\n$\n\
Adds sample prompt presets to your tray Quick Fix menu:$\n\
  - Email Reply$\n\
  - Slack Message$\n\
  - LinkedIn Post$\n$\n\
Install this feature?"
  ${EndIf}

  MessageBox MB_YESNO|MB_ICONQUESTION "$R6" /SD IDYES IDYES btc_qc_install IDNO btc_qc_remove

  btc_qc_install:
    WriteRegStr HKCU "Software\${APP_ID}\Features" "QuickCommands" "1"
    CreateDirectory "$APPDATA\Blur-to-Clear"
    FileOpen $R7 "$APPDATA\Blur-to-Clear\quick-commands.json" w
    FileWrite $R7 '[$\r$\n'
    FileWrite $R7 '  { "name": "Email Reply",   "prompt": "Write a professional, concise reply to this email." },$\r$\n'
    FileWrite $R7 '  { "name": "Slack Message", "prompt": "Rewrite this as a short, casual Slack message." },$\r$\n'
    FileWrite $R7 '  { "name": "LinkedIn Post", "prompt": "Turn this into a polished LinkedIn post." }$\r$\n'
    FileWrite $R7 ']'
    FileClose $R7
    Goto btc_qc_done

  btc_qc_remove:
    DeleteRegValue HKCU "Software\${APP_ID}\Features" "QuickCommands"
    Delete "$APPDATA\Blur-to-Clear\quick-commands.json"

  btc_qc_done:
!macroend

; ── Clean up feature data on uninstall ───────────────────────────────────────

!macro customUnInstall
  DeleteRegKey HKCU "Software\${APP_ID}\Features"
  Delete "$APPDATA\Blur-to-Clear\quick-commands.json"
  RMDir  "$APPDATA\Blur-to-Clear"
!macroend
