# Local CKEditor 5 Custom Build

This folder contains a minimal ClassicEditor custom build used by the dock script.

After building, copy (or let the postbuild step copy) the output `build/ckeditor.js` to one of the watched locations:

1. `lab/src/public/vendor/ckeditor/ckeditor.js` (primary flat path)
2. `lab/src/public/vendor/ckeditor5-react-master/build/ckeditor.js`

The asset loader already checks both.

## Build Steps

From repository root (or from `lab/editor-build`):

```
npm run build-editor
```

Outputs:
- `lab/editor-build/build/ckeditor.js`
- `lab/editor-build/build/translations/*` (if any)

Automatically copies to `lab/src/public/vendor/ckeditor/`.

## Modify Plugins
Edit `src/editor.js` to add/remove plugins. Re-run the build.
