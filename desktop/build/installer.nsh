; installer.nsh — Blur-to-Clear custom NSIS installer logic
;
; Adds:
;   1. Maintenance mode  — when already installed, prompt: Repair / Modify / Uninstall
;   2. Optional feature  — "AI Quick Commands" preset pack (fake feature demo)
;
; Uses $R5-$R9 scratch registers only (no Var declarations, safe for both
; installer and uninstaller builds which share the customHeader macro).

; ── customHeader: required by electron-builder even if empty ─────────────────

!macro customHeader
!macroend

; ── Maintenance mode (runs in .onInit, before any pages are shown) ────────────

!macro customInit
  ; $R9 = existing UninstallString (empty when not yet installed)
  ReadRegStr $R9 HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "UninstallString"

  ${If} $R9 == ""
    ReadRegStr $R9 HKLM \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
      "UninstallString"
  ${EndIf}

  ${If}     $R9 != ""
  ${AndIfNot} ${Silent}
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON1 \
      "$(^Name) is already installed on this computer.$\n$\n\
What would you like to do?$\n$\n\
  [Yes]      Repair or Modify features$\n\
  [No]       Uninstall $(^Name)$\n\
  [Cancel]   Exit this installer" \
      /SD IDYES IDYES btc_repair IDNO btc_do_uninstall

    Quit          ; Cancel — close installer

    btc_do_uninstall:
      ExecWait '"$R9" /S'
      Quit

    btc_repair:
      ; Fall through — runs the normal install to repair / overwrite files
  ${EndIf}
!macroend

; ── Optional feature: AI Quick Commands ──────────────────────────────────────
;
; $R8 = "1" if already installed, used to tailor the Yes/No prompt
; $R7 = file handle for writing the preset JSON
; $R6 = message box text

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
