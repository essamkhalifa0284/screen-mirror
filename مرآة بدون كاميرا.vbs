' Starts the camera-free mirror (full black screen) without a console window.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = appDir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Then
  MsgBox "Electron is not installed. Open this folder in a terminal and run: npm install", 48, "Mirror"
  WScript.Quit 1
End If
sh.CurrentDirectory = appDir
sh.Run """" & exe & """ """ & appDir & """ --black", 0, False
