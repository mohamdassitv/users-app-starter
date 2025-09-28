#!/usr/bin/env node
/**
 * Auto sync script: watches the lab directory for changes, then:
 * 1. git add
 * 2. git commit (if there are staged changes)
 * 3. git push
 * 4. docker compose build (rebuild image)
 *
 * WARNING: This will create many small commits. Use only in a throwaway or rapid prototyping environment.
 */
const { exec } = require('child_process');
const chokidar = require('chokidar');
const path = require('path');

const ROOT = path.resolve(__dirname);
let queue = false; let pending = false; let lastCommitTime=0;
const MIN_INTERVAL_MS = 4000; // debounce commit frequency

function run(cmd){
  return new Promise((resolve,reject)=>{
    exec(cmd,{cwd:ROOT},(err,stdout,stderr)=>{
      if(err) return reject(new Error(stderr||stdout||err.message));
      resolve(stdout.trim());
    });
  });
}

async function sync(){
  if(pending){ queue=true; return; }
  pending=true;
  try {
    const now=Date.now();
    if(now - lastCommitTime < MIN_INTERVAL_MS){
      setTimeout(()=>{ pending=false; sync(); }, MIN_INTERVAL_MS - (now-lastCommitTime));
      return;
    }
    lastCommitTime=now;
    await run('git add .');
    const diff = await run('git diff --cached --name-only');
    if(!diff){ pending=false; if(queue){ queue=false; sync(); } return; }
    const msg = 'auto: sync '+ new Date().toISOString();
    await run(`git commit -m "${msg}" || echo no commit`);
    await run('git push origin main || git push');
    console.log('[autoSync] Pushed commit. Rebuilding image...');
    try { await run('docker compose build || docker-compose build'); console.log('[autoSync] Build complete'); }
    catch(e){ console.error('[autoSync] Build failed:', e.message); }
  } catch(e){
    console.error('[autoSync] Error:', e.message);
  } finally {
    pending=false;
    if(queue){ queue=false; sync(); }
  }
}

console.log('[autoSync] Watching for changes... (Ctrl+C to stop)');
chokidar.watch(['src','state','logs','package.json','autoSync.js'],{ignoreInitial:true,persistent:true})
  .on('all', (event, file)=>{ console.log('[autoSync] Change detected:', event, file); sync(); });
