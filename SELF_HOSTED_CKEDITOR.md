# Self-Hosting CKEditor 5 (Classic) in This Lab

This project now looks for a local build before falling back to the public CDN.

Load order attempted by `collab-dock-simple.js`:
1. /vendor/ckeditor/ckeditor.js (local)  
2. https://cdn.ckeditor.com/ckeditor5/41.2.1/classic/ckeditor.js (CDN)  
3. Quill (CDN fallback)  
4. Plain contentEditable fallback

## Why You Still See Basic Editor
If the local file is only the placeholder (the one in `vendor/ckeditor/ckeditor.js` that logs a warning) and the CDN is blocked or offline, the script never finds `window.ClassicEditor` and drops to Quill or plain mode.

## Getting a Real Build
1. Go to https://ckeditor.com/ckeditor-5/online-builder/
2. Choose a base: Classic Editor
3. Recommended plugins for “Word-like” experience:
   - Essentials, Paragraph, Heading, Bold, Italic, Underline, Strikethrough
   - List, Indent, Outdent
   - Alignment, Link, BlockQuote
   - Table, TableToolbar
   - CodeBlock, HorizontalLine
   - RemoveFormat, Undo, Redo
   - (Optional) PasteFromOffice, Autosave, WordCount (if available in your plan)
4. Build & Download ZIP.
5. Extract ZIP contents. Inside you will typically have:
   - `build/ckeditor.js`
   - `build/translations/*`
   - `sample/` (can ignore)  
6. Copy everything inside the `build/` folder into:  
   `lab/src/public/vendor/ckeditor/`
7. Overwrite the placeholder `ckeditor.js`.
8. (Optional) If there’s a `translations/` directory, keep its structure:  
   `vendor/ckeditor/translations/<lang>.js`

## Verify
After copying:
- Hard refresh a task page (Ctrl+F5).
- Open DevTools Console and run: `!!window.ClassicEditor` (should be true).
- The dock on open should load CKEditor with the richer toolbar.

## Customizing Toolbar
The toolbar items are defined in `collab-dock-simple.js` inside the `ClassicEditor.create` call. Adjust the `items` array as needed. Make sure the plugins you add correspond to installed plugins in the build, otherwise they will be ignored or cause warnings.

## Updating Version
If you replace the local build later, bump the cache bust query in HTML script tag if necessary (currently `?v=2`). You can change to `?v=3` and optionally increment the `SCRIPT_VERSION` constant.

## Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| Still seeing fallback note | Placeholder file not replaced | Ensure real `ckeditor.js` present and not minified away by a build step |
| Console error: plugin missing | Toolbar requested plugin not included | Rebuild CKEditor with that plugin enabled |
| Works on one page but not others | Cache or partial load | Hard reload all tabs or clear browser cache |
| Word stats not updating | CKEditor change event not firing | Ensure `ClassicEditor` actually initialized (check console) |

## Next Enhancements (Optional)
- Add `WordCount` plugin and remove custom stats logic if you prefer.
- Add Track Changes & Comments (requires commercial build & plugins).
- Integrate Autosave plugin to complement localStorage.

---
If you provide the ZIP details or list of included plugins, we can tune the toolbar automatically.
