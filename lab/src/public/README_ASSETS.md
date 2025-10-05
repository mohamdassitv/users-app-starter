# Assets & Vendor Inventory

This file documents active vs archived assets to keep the project organized.

## Active (used in pages)
- vendor/ckeditor/ckeditor5-build-classic-dna-master/build/ckeditor.js – Loaded by Task 1 page and other CKEditor instances.
- header-timer.js – Timer logic across tasks.
<!-- collab-dock-simple.js removed (deprecated inline editor dock) -->
- richify.js – Enhances textarea / simple rich features.
- styles.css – Global styling.
- task/*.html – Exam task pages.

## Archived (not directly referenced by any HTML page)
Moved under `_archive/` for cleanliness and easy restoration.
- _archive/vendor/ckeditor5-react-master/ – Source tree for React integration, not bundled/loaded.
- _archive/vendor/quill/ – Placeholder Quill build; not linked.
- _archive/vendor/yjs/ – Placeholder Yjs build; not linked.
- _archive/collab-dock.js (planned) – Heavier dynamic loader; pages use simplified version.

If later you need these, move them back to their original locations.

## How to Re-enable Archived Editors
1. Move desired folder back to `public/vendor/...`.
2. Add the appropriate <script> tag to a page (or adjust collab-dock logic).
3. Rebuild / restart the container.

## Rationale
Keeping unused heavy sources out of the active vendor path:
- Speeds Docker context build.
- Reduces cognitive load when navigating the project.
- Keeps exam environment minimal and predictable.

