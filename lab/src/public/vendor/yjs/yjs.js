/* Placeholder local Yjs build.
 * To enable offline loading, replace this file with the real distribution build.
 * Recommended: copy from node_modules/yjs/dist/yjs.js
 */
console.warn('[collab] Using placeholder local yjs.js. Real-time editing is disabled until replaced.');
console.warn('[collab] The server now serves the real library at /vendor-dist/yjs.js. Ensure collab-dock attempts that path first (already implemented).');
window.Y = window.Y || { Doc: function(){ console.warn('Placeholder Y.Doc used (no real-time sync)'); this.getText=()=>({ toString:()=>'', observe:()=>{}, insert:()=>{}, delete:()=>{}, length:0 }); }, applyUpdate:()=>{}, encodeStateAsUpdate:()=>new Uint8Array() };
