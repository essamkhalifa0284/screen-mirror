; Extra shortcut that opens the camera-free (black screen) mirror directly.
!macro customInstall
  CreateShortCut "$DESKTOP\مرآة بدون كاميرا.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--black" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SMPROGRAMS\مرآة بدون كاميرا.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--black" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\مرآة بدون كاميرا.lnk"
  Delete "$SMPROGRAMS\مرآة بدون كاميرا.lnk"
!macroend
