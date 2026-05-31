; Thought Tidy — Optional Features installer page
; Injected by electron-builder via nsis.include in package.json.
;
; This page appears before the "Choose Install Location" screen.
; Currently a UI placeholder — checkboxes are displayed but no feature
; installation logic runs yet. Wired up in AIP R-021 (installer-preflight).

!macro customInstallPage
  Page custom FeatureSelectPage FeatureSelectLeave
!macroend

Var hDialog
Var hLocalAI
Var hAutoUpdater

Function FeatureSelectPage
  nsDialogs::Create 1018
  Pop $hDialog
  ${If} $hDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 14u "Optional Features"
  Pop $0

  ${NSD_CreateLabel} 0 18u 100% 12u "Select which optional components to install:"
  Pop $0

  ${NSD_CreateCheckbox} 0 36u 100% 13u "Local AI  (~2-7 GB)"
  Pop $hLocalAI

  ${NSD_CreateLabel} 16u 51u 84% 18u "Run AI on your machine -- no internet, no API key required. Ollama setup guide launches after install."
  Pop $0

  ${NSD_CreateCheckbox} 0 74u 100% 13u "Auto-updater background service  (~5 MB)"
  Pop $hAutoUpdater

  ${NSD_CreateLabel} 16u 89u 84% 18u "Runs silently in the background, downloads new versions automatically, and applies them on next launch."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function FeatureSelectLeave
  ; Local AI -- placeholder, value not acted upon yet (AIP R-021).
  ${NSD_GetState} $hLocalAI $0

  ; Auto-updater -- write preference to registry; main.js reads it on first launch.
  ${NSD_GetState} $hAutoUpdater $1
  WriteRegDWORD HKCU "Software\NorthPandaLabs\ThoughtTidy" "autoUpdater" $1
FunctionEnd
