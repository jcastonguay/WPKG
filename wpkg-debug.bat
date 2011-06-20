:: This is a recommended way of starting WPKG.

:: Use WPKGROOT variable to define where wpkg.js script is.

:: Use PACKAGES variable to define where all your software/installers are.
:: You can later use the PACKAGES variable (and all other variables) in your xml files.

set WPKGROOT="c:\program files\wpkg"
set SOFTWARE=%WPKGROOT%\software
set PACKAGES=%WPKGROOT%\packages

REM Called to update the files WPKG uses
cscript %WPKGROOT%\wpkg.js /base:"c:\program files\wpkg\self" /install:wpkg

REM Running WPKG with DEBUG 
cscript %WPKGROOT%\wpkg.js /synchronize /debug /nonotify /noreboot

