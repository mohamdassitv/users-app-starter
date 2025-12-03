#!/usr/bin/env node
/**
 * Bastion GW helper: establish SSH to bastion then search for gateways (GW/RV) and optionally restart services.
 * Usage:
 *   node scripts/bastion-gw.js --host 100.66.63.122 --user newcliproxy \
 *     --password-env BASTION_PASS --search vc-gw --restart svc1,svc2 --otp-env OTP_CODE --dry-run
 *
 * Env variables can be used for secrets: BASTION_PASS, OTP_CODE.
 * If --otp-env provided the script will send the OTP as first input when prompted.
 *
 * Notes:
 *  - This script uses ssh2. It assumes the bastion exposes a shell where you can run internal commands.
 *  - Replace search command logic with the actual tool (e.g. grep, proprietary cli) your environment uses.
 */
const { Client } = require('ssh2');
const readline = require('readline');
const HOST_ALIASES={
  'cloudia-prod-eu-bastion-1':'ssh.eu-4.checkpoint.security',
  'cloudia-eu-bastion':'ssh.eu-4.checkpoint.security'
};

function parseArgs(){
  const args = process.argv.slice(2);
  const out = { restart:[], search:null, dry:false };
  for(let i=0;i<args.length;i++){
    const a=args[i];
  if(a==='--host') { const h=args[++i]; out.host=HOST_ALIASES[h]||h; }
    else if(a==='--user') out.username=args[++i];
    else if(a==='--password') out.password=args[++i];
    else if(a==='--password-env') out.password=process.env[args[++i]];
    else if(a==='--otp-env') out.otp=process.env[args[++i]];
    else if(a==='--otp') out.otp=args[++i];
    else if(a==='--search') out.search=args[++i];
    else if(a==='--restart') out.restart=args[++i].split(',').filter(Boolean);
    else if(a==='--port') out.port=parseInt(args[++i],10)||22;
    else if(a==='--dry-run') out.dry=true;
    else if(a==='--timeout') out.timeout=parseInt(args[++i],10)||30000;
    else if(a==='--ask-pass') out.askPass=true;
  }
  return out;
}

function validate(cfg){
  const missing=[];
  if(!cfg.host) missing.push('host');
  if(!cfg.username) missing.push('user');
  // Allow skipping password for dry-run output
  if(!cfg.password && !cfg.dry) missing.push('password/password-env');
  if(missing.length){
    console.error('Missing required args: '+missing.join(', '));
    process.exit(2);
  }
}

async function main(){
  const cfg=parseArgs();
  validate(cfg);
  if(cfg.dry){
    console.log('[DRY] Would connect to', cfg.host, 'as', cfg.username);
    if(cfg.search) console.log('[DRY] Would run search for term:', cfg.search);
    if(cfg.restart.length) console.log('[DRY] Would restart services:', cfg.restart.join(','));
    if(cfg.otp) console.log('[DRY] OTP provided:', cfg.otp.replace(/./g,'*'));
    process.exit(0);
  }
  if(cfg.askPass && !cfg.password){
    cfg.password = await promptHidden('Bastion password (OTP or static): ');
  }
  const conn=new Client();
  let timer=null;
  const done=(code=0)=>{ if(timer) clearTimeout(timer); conn.end(); process.exit(code); };
  timer=setTimeout(()=>{ console.error('Timeout'); done(3); }, cfg.timeout||30000);

  conn.on('ready',()=>{
    console.log('SSH connected to bastion');
    conn.shell((err,stream)=>{
      if(err){ console.error('Shell error',err); return done(4); }
      stream.on('close',()=>{ console.log('Shell closed'); done(0); });
      stream.on('data',data=> handleData(data.toString(), stream, cfg));
      // If OTP required, send once after slight delay
      if(cfg.otp){ setTimeout(()=> stream.write(cfg.otp+'\n'), 400); }
      // Kick off search once shell prompt expected
      setTimeout(()=>{
        if(cfg.search){
          const cmd = buildSearchCommand(cfg.search);
          console.log('> '+cmd);
          stream.write(cmd+'\n');
        }
      }, 1000);
    });
  }).on('error',e=>{ console.error('SSH error',e); done(5); }).connect({
    host:cfg.host,
    port:cfg.port||22,
    username:cfg.username,
    password:cfg.password
  });
}

function buildSearchCommand(term){
  // Replace with the actual discovery mechanism (example: list gateways | grep term)
  return 'list_gateways | grep -i '+JSON.stringify(term);
}

let pendingRestart=[];
function handleData(chunk, stream, cfg){
  process.stdout.write(chunk);
  if(cfg.search && chunk.includes('GATEWAY_ID=')){
    // Example extraction logic - adapt to real output
    const ids=[...chunk.matchAll(/GATEWAY_ID=(\S+)/g)].map(m=>m[1]);
    if(ids.length){ console.log('Discovered gateway IDs:', ids.join(',')); }
    pendingRestart = ids.slice(0,1); // only first for safety
    if(cfg.restart.length && pendingRestart.length){
      cfg.restart.forEach(svc=>{
        const cmd='gwctl --id '+pendingRestart[0]+' restart '+svc;
        console.log('> '+cmd);
        stream.write(cmd+'\n');
      });
    }
  }
  // Basic prompt detection to maybe issue extra commands
}

function promptHidden(query){
  return new Promise(res=>{
    const rl=readline.createInterface({input:process.stdin,output:process.stdout});
    const stdin=process.stdin;
    const onData=char=>{ char=char+''; switch(char){ case '\n': case '\r': case '\u0004': stdin.pause(); break; default: process.stdout.write('\x1B[2K\x1B[200D'+query+'*'.repeat(buf.length)); } };
    let buf='';
    process.stdout.write(query);
    stdin.on('data',c=>{ c=c.toString(); if(c==='\n' || c==='\r'){ stdin.removeListener('data',onData); rl.close(); process.stdout.write('\n'); res(buf); } else if(c==='\u0003'){ process.exit(1); } else { buf+=c; process.stdout.write('\x1B[2K\x1B[200D'+query+'*'.repeat(buf.length)); } });
  });
}

if(require.main===module){
  main();
}
