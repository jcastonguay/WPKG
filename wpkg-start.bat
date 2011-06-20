:: This is a recommended way of starting WPKG.

:: Use WPKGROOT variable to define where wpkg.js script is.

:: Use PACKAGES variable to define where all your software/installers are.
:: You can later use the PACKAGES variable (and all other variables) in your xml files.

set WPKGROOT="c:\program files\wpkg"
set SOFTWARE=%WPKGROOT%\software
set PACKAGES=%WPKGROOT%\packages

REM Called to update the files WPKG uses
cscript %WPKGROOT%\wpkg.js /base:"c:\program files\wpkg\self" /install:wpkg


REM Running WPKG as normal
cscript %WPKGROOT%\wpkg.js /synchronize /quiet /nonotify /noreboot



REM Easy place to put stuff for every run.

copy /y "c:\documents and settings\all users\local settings\application data\Wallpaper1.bmp"  "c:\windows\Dell.bmp"
del "C:\documents and settings\all users\start menu\Webdrive.lnk"

REM fix stupid little bugs of mine
del "C:\documents and settings\all users\desktop\Mozilla Firefox.lnk"
del "C:\documents and settings\all users\start menu\programs\startup\setupwebdrive.lnk.lnk"
del "c:\documents and settings\all users\start menu\setupchicago.lnk"
