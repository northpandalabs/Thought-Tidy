; installer.nsh — Thought Tidy custom NSIS installer logic

; ── customHeader ─────────────────────────────────────────────────────────────

!macro customHeader
  !ifndef BUILD_UNINSTALLER

  Var BTC_CB_QUICKCMDS  ; HWND of the AI Quick Commands checkbox
  Var BTC_QC_ENABLED    ; "1" if the feature should be installed, "0" if not

  ; ── Features page: Create ──────────────────────────────────────
  Function btcFeaturesCreate
    nsDialogs::Create 1018
    Pop $0

    ${NSD_CreateLabel} 0 0 100% 24u \
      "Select optional features to install with Thought Tidy:"
    Pop $0

    ; Default the checkbox from the existing registry value (for upgrades/repairs)
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

  ; ── Features page: Leave ───────────────────────────────────────
  Function btcFeaturesLeave
    ${NSD_GetState} $BTC_CB_QUICKCMDS $R0
    ${If} $R0 == ${BST_CHECKED}
      StrCpy $BTC_QC_ENABLED "1"
    ${Else}
      StrCpy $BTC_QC_ENABLED "0"
    ${EndIf}
  FunctionEnd

  Page Custom btcFeaturesCreate btcFeaturesLeave

  !endif  ; BUILD_UNINSTALLER
!macroend

; ── customInit: maintenance check via MessageBox (reliable on all Windows) ───
; Runs in .onInit — before any pages are shown. MessageBox works here and
; avoids the nsDialogs blank-page rendering bug on Windows 11 high-DPI.

!macro customInit
  !ifndef BUILD_UNINSTALLER

  ReadRegStr $R0 HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "UninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
      "UninstallString"
  ${EndIf}

  ${If} $R0 != ""
    ; Already installed — offer upgrade/reinstall or exit
    ReadRegStr $R1 HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
      "DisplayVersion"
    ${If} $R1 == ""
      ReadRegStr $R1 HKLM \
        "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
        "DisplayVersion"
    ${EndIf}
    ${If} $R1 == ""
      StrCpy $R1 "an earlier version"
    ${EndIf}

    MessageBox MB_YESNO|MB_ICONQUESTION \
      "$(^Name) $R1 is already installed.$\r$\n$\r$\nInstall $(^Name) ${VERSION} now (upgrade / reinstall)?" \
      IDYES done
    Quit

    done:
  ${EndIf}

  !endif  ; BUILD_UNINSTALLER
!macroend

; ── Optional feature: AI Quick Commands ──────────────────────────────────────

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
