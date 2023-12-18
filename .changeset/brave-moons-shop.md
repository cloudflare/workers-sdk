---
"wrangler": patch
---

fix: Use Windows SYSTEMROOT env var for finding netstat

Currently, the drive letter of os.homedir() (the user's home directory) is used to build the path to netstat.exe. However, user directories are not always on the same drive as the Windows installation, in which case the path to netstat will be incorrect. Now we use the %SYSTEMROOT% environment variable which correctly points to the installation path of Windows.
