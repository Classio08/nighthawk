# Local asset intake: ZIP archives and generated catalogue

The local asset-ingestion pass described by the project owner used:

- Repository workspace: `C:\\Dev\\nighthawk`
- Source archives: `raw-zips/`
- Extracted and sorted files: `sorted-assets/`
- Generator entry point: `scripts/unpack-and-catalog.mjs`
- Generated index: `sorted-assets/CATALOG.json` and `sorted-assets/CATALOG.md`
- Reported source count: 41 ZIP archives successfully unpacked.

The source archives and extracted working directory are intentionally ignored by Git. The ZIPs and generated catalog are local working data, not approved game assets and not automatically licensed for redistribution.

## Before an asset enters the game

1. Inspect the generated catalogue and identify a specific asset rather than copying an entire archive into the game.
2. Record its original source URL, creator, licence name/version, attribution requirement, download date, archive filename and any modifications.
3. Verify that the licence permits the intended commercial game use and redistribution. A public download is not proof of an open licence.
4. Keep the asset's paths relative to the repository. Remove local absolute paths, personal usernames and machine-specific directory names from generated metadata before sharing it.
5. Check model scale/orientation, PBR map roles, color space, texture dimensions, alpha mode, polygon count and file size. Keep a visual fallback so missing assets cannot prevent a match from starting.
6. Do not commit `raw-zips/` or the full `sorted-assets/` extraction. Commit only reviewed, optimized assets and their provenance/licence records.

## Windows environment noted by the owner

The local PowerShell session reported Node.js 26.4.0, npm 11.17.0 and Git 2.54.0. `npm install` completed and reported zero vulnerabilities. npm also warned that the optional `msgpackr-extract` install script had not been approved; this was not an install failure. The local extraction command reported 41 ZIPs unpacked and wrote both catalogue files.

This is a recorded local outcome, not a CI result. No tests, build or browser run are implied.
