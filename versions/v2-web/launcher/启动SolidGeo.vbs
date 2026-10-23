' SolidGeo Web Edition launcher (Windows Script Host)
Option Explicit
Dim fso, shell, base, nodeCheck, script
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
base = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(fso.BuildPath(base, "launcher"), "start.mjs")
If Not fso.FileExists(script) Then
  MsgBox "找不到 launcher\start.mjs，请保持解压后的目录结构。", 16, "SolidGeo"
  WScript.Quit 1
End If
shell.CurrentDirectory = base
nodeCheck = shell.Run("cmd /c where node >nul 2>nul", 0, True)
If nodeCheck <> 0 Then
  MsgBox "启动 SolidGeo Web Edition 需要 Node.js（已随本机安装）。" & vbCrLf & _
         "当前系统 PATH 中找不到 node。请安装 Node.js 22+ 后重试。", 16, "SolidGeo"
  WScript.Quit 1
End If
shell.Run "node """ & script & """", 0, False
