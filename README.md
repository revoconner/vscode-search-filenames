# VScode search filenames (not inside files)
Something to search filenames and not just inside files for vscode explorer. Cannot believe the default implementations are so bad.

<img width="400" height="auto" alt="image" src="https://github.com/user-attachments/assets/a830a18d-9159-434e-b9df-7124db0d2408" />

---

## Features
- Persistent
- Option to hide files that matches but are in gitignore file pattern
- Three search options
  - Wildcard - just type as *.cpp
  - Regex - start with r:\.cpp
  - Glob - start with g:**/*.cpp
- Sort by  <br> <img width="250" height="auto" alt="image" src="https://github.com/user-attachments/assets/1034870d-4c6e-44a1-af74-798e1910fa33" />
- Right click context menu with added support to get checksum hash.

  <img width="180" height="auto" alt="image" src="https://github.com/user-attachments/assets/db3a6e10-a532-4fe1-a30b-c32b4f1296fa" />

# How to install

1. Download the vsix file.
2. Go to extensions
3. Install like this

<img width="453" height="411" alt="image" src="https://github.com/user-attachments/assets/80a7a85d-6820-4eae-935e-f046d2c27b9e" />



## How is it different from ctrl+p or ctrl+alt+f
- It's not quick open. Clicking on a name doesnt open it.
- It doesn't disappear when you click or lose focus.
- The files are right there as a list, instead of hiding behind folders and subfolders with just a highlight.
- It doesnt searches inside the file, just the name, so you filter our something like .py or .cpp file
- Supports, normal wildcard, regex and glob.


