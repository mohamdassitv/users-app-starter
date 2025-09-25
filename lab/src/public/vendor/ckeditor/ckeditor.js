/* Placeholder self-hosted CKEditor 5 build.
 * Replace this file with your real build output (e.g. from https://ckeditor.com/ckeditor-5/online-builder/)
 * Typical build contains:
 *   build/ckeditor.js
 *   build/translations/*
 * After downloading a build ZIP:
 *   1. Extract contents into this folder (vendor/ckeditor)
 *   2. Ensure this file is overwritten by the real ckeditor.js
 *   3. Leave collab-dock-simple.js logic as-is; it will detect window.ClassicEditor
 */
console.warn('[editor] Using placeholder local CKEditor build (falling back to Quill).');
// Minimal fake so code path can proceed to fallback gracefully
window.ClassicEditor = undefined;
