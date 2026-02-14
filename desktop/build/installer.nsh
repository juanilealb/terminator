!macro customInstall
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Terminator" "" "Open in Terminator"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Terminator" "Icon" "$INSTDIR\Terminator.exe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Terminator\command" "" '$\"$INSTDIR\Terminator.exe$\" $\"%V$\"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\Terminator" "" "Open in Terminator"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Terminator" "Icon" "$INSTDIR\Terminator.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Terminator\command" "" '$\"$INSTDIR\Terminator.exe$\" $\"%V$\"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Terminator"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Terminator"
!macroend
