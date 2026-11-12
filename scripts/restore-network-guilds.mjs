#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import mysql from "../services/fbrp-bot/node_modules/mysql2/promise.js";

const API="https://discord.com/api/v10", BACKUP=58, ROOT="/home/ubuntu/fbrp", OWNER="1090083387638812755";
const SPECS=[
  ["iaa","IAA","1558227271641210912","1570213212320833627","services/fbrp-bot/.env","IAA_BOT_TOKEN","1559312455996280927"],
  ["departments","Department Hub","1558235113295315004","1570217077669757069","services/deptmanager/.env","DISCORD_TOKEN","1560421786808492203"],
  ["gangs","Gangs","1558950044042797169","1570217330124923040","services/gangsmanager/.env","DISCORD_TOKEN","1559692049337552946"],
  ["devops","DevOps","1559599608479354992","1570218405171036250","services/fbrp-bot/.env","DEVOPS_BOT_TOKEN","1559601046249021491"],
  ["businesses","Businesses","1559682840411635813","1570219683137716254","services/businessmanager/.env","DISCORD_TOKEN","1559701759880859700"],
].map(([key,label,source,target,file,tokenKey,bot])=>({key,label,source,target,file:`${ROOT}/${file}`,tokenKey,bot}));
const env=p=>Object.fromEntries(readFileSync(p,"utf8").split(/\r?\n/).filter(x=>/^[A-Za-z_][A-Za-z0-9_]*=/.test(x)).map(x=>{const i=x.indexOf("=");let v=x.slice(i+1).trim();if((v[0]==='"'&&v.at(-1)==='"')||(v[0]==="'"&&v.at(-1)==="'"))v=v.slice(1,-1);return[x.slice(0,i),v]}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function api(token,path,{method="GET",body,reason}={}){
  for(let n=0;;n++){const r=await fetch(API+path,{method,headers:{Authorization:`Bot ${token}`,...(body===undefined?{}:{"content-type":"application/json"}),...(reason?{"x-audit-log-reason":encodeURIComponent(reason)}:{})},body:body===undefined?undefined:JSON.stringify(body)}),out=r.status===204?null:await r.json().catch(()=>null);
    if(r.ok)return out;if(r.status===429&&n<8){const ms=Math.ceil(Number(out?.retry_after||1)*1000)+300;console.log(`rate limit: waiting ${ms}ms before retrying the same request`);await wait(ms);continue}if(r.status>=500&&n<6){await wait(Math.min(30000,1000*2**n));continue}throw new Error(`${method} ${path} failed ${r.status}: ${out?.message||JSON.stringify(out)}`)}
}
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const save=(p,x)=>{const t=p+".tmp";writeFileSync(t,JSON.stringify(x,null,2)+"\n",{mode:0o600});renameSync(t,p)};
const load=p=>JSON.parse(readFileSync(p,"utf8"));
async function openDb(){const e=env(`${ROOT}/services/fbrp-bot/.env`);return mysql.createConnection({host:e.MARIADB_HOST||"127.0.0.1",port:Number(e.MARIADB_PORT||13307),user:e.MARIADB_USER,password:e.MARIADB_PASSWORD,database:e.MARIADB_DATABASE})}
async function source(db,id){const[r]=await db.query("SELECT data FROM discord_server_backup_guilds WHERE backup_id=? AND guild_id=?",[BACKUP,id]);if(r.length!==1)throw new Error(`missing backup ${id}`);return JSON.parse(gunzipSync(r[0].data))}
async function snapshot(token,id){const[g,roles,channels,bans]=await Promise.all([api(token,`/guilds/${id}?with_counts=true`),api(token,`/guilds/${id}/roles`),api(token,`/guilds/${id}/channels`),api(token,`/guilds/${id}/bans?limit=1000`).catch(()=>[])]),sort=a=>[...a].sort((x,y)=>String(x.id).localeCompare(String(y.id)));return{guild:{id:g.id,name:g.name,description:g.description??null,features:[...(g.features||[])].sort(),verification_level:g.verification_level,default_message_notifications:g.default_message_notifications,explicit_content_filter:g.explicit_content_filter,afk_timeout:g.afk_timeout,preferred_locale:g.preferred_locale},roles:sort(roles),channels:sort(channels),bans:sort(bans)}}
function validate(s,saved,target,bot){
  if(bot.id!==s.bot)throw new Error(`${s.label}: wrong bot token`);if(target.guild.id!==s.target)throw new Error(`${s.label}: wrong target`);
  if(target.guild.name!==saved.guild.name&&!(s.key==="businesses"&&target.guild.name==="FBRP | Businesses"))throw new Error(`${s.label}: name mismatch`);
  if(target.roles.some(r=>r.id!==s.target&&!r.managed))throw new Error(`${s.label}: ordinary roles already exist`);if(target.channels.length>10)throw new Error(`${s.label}: too many starter channels`);
  if(saved.roles.filter(r=>!r.managed).length+target.roles.filter(r=>r.managed).length>250||saved.channels.length>500)throw new Error(`${s.label}: Discord object limit exceeded`);
}
async function prepare(){
  const dir=`/home/ubuntu/backups/discord-network-restore-${new Date().toISOString().replace(/[:.]/g,"")}`;mkdirSync(dir,{mode:0o700});const db=await openDb(),manifest={version:1,backupId:BACKUP,preparedAt:new Date().toISOString(),restores:[]};
  try{for(const s of SPECS){const token=env(s.file)[s.tokenKey],[bot,saved,target]=await Promise.all([api(token,"/users/@me"),source(db,s.source),snapshot(token,s.target)]);validate(s,saved,target,bot);const names=new Set(target.roles.filter(r=>r.managed).map(r=>r.name)),entry={key:s.key,source:s.source,target:s.target,targetHash:hash(target),ordinaryRoles:saved.roles.filter(r=>!r.everyone&&!r.managed).length,channels:saved.channels.length,missingManagedRoles:saved.roles.filter(r=>r.managed&&!names.has(r.name)).map(r=>r.name)};writeFileSync(`${dir}/${s.key}-before.json.gz`,gzipSync(JSON.stringify(target)),{mode:0o600});save(`${dir}/${s.key}-state.json`,{phase:"prepared",roleMap:{[s.source]:s.target},channelMap:{},pending:null});manifest.restores.push(entry);console.log(JSON.stringify(entry))}save(`${dir}/manifest.json`,manifest);console.log(`PREPARED_RUN_DIR=${dir}`)}finally{await db.end()}
}
const rolePrint=r=>JSON.stringify({name:r.name,color:Number(r.color||0),hoist:!!r.hoist,mentionable:!!r.mentionable,permissions:String(r.permissions||0)});
const channelPrint=(c,parent)=>JSON.stringify({name:c.name,type:Number(c.type),parent:parent||null});
async function adopt(token,s,saved,state,path){
  if(!state.pending)return;
  if(state.pending.kind==="role"){const all=await api(token,`/guilds/${s.target}/roles`),used=new Set(Object.values(state.roleMap)),old=saved.roles.find(x=>x.id===state.pending.id),found=all.filter(x=>!x.managed&&x.id!==s.target&&!used.has(x.id)&&rolePrint(x)===rolePrint(old));if(found.length!==1)throw new Error(`${s.label}: cannot safely adopt pending role ${old.name}`);state.roleMap[old.id]=found[0].id}
  else{const all=await api(token,`/guilds/${s.target}/channels`),used=new Set(Object.values(state.channelMap)),old=saved.channels.find(x=>x.id===state.pending.id),parent=old.parentId?state.channelMap[old.parentId]:null,found=all.filter(x=>!used.has(x.id)&&channelPrint(x,x.parent_id)===channelPrint(old,parent));if(found.length!==1)throw new Error(`${s.label}: cannot safely adopt pending channel ${old.name}`);state.channelMap[old.id]=found[0].id}
  state.pending=null;save(path,state);
}
async function restoreOne(s,entry,dir,db){
  const token=env(s.file)[s.tokenKey],saved=await source(db,s.source),path=`${dir}/${s.key}-state.json`,state=load(path),reason=`Florida Bay ${s.label} restore from backup #${BACKUP} by ${OWNER}`;
  if(state.phase==="prepared"){if(hash(await snapshot(token,s.target))!==entry.targetHash)throw new Error(`${s.label}: changed after preflight`);state.phase="delete";save(path,state)}
  if(state.phase==="delete"){for(const c of await api(token,`/guilds/${s.target}/channels`))await api(token,`/channels/${c.id}`,{method:"DELETE",reason});for(const r of (await api(token,`/guilds/${s.target}/roles`)).filter(x=>x.id!==s.target&&!x.managed))await api(token,`/guilds/${s.target}/roles/${r.id}`,{method:"DELETE",reason});state.phase="roles";save(path,state)}
  await adopt(token,s,saved,state,path);
  if(state.phase==="roles"){
    const current=await api(token,`/guilds/${s.target}/roles`);for(const old of saved.roles.filter(x=>x.managed)){const match=current.find(x=>x.managed&&x.name===old.name);if(match)state.roleMap[old.id]=match.id}
    const everyone=saved.roles.find(x=>x.everyone);await api(token,`/guilds/${s.target}/roles/${s.target}`,{method:"PATCH",body:{permissions:String(everyone.permissions)},reason});
    for(const r of saved.roles.filter(x=>!x.everyone&&!x.managed).sort((a,b)=>b.position-a.position)){if(state.roleMap[r.id])continue;state.pending={kind:"role",id:r.id};save(path,state);const made=await api(token,`/guilds/${s.target}/roles`,{method:"POST",body:{name:r.name,color:Number(r.color||0),hoist:!!r.hoist,mentionable:!!r.mentionable,permissions:String(r.permissions||0)},reason});state.roleMap[r.id]=made.id;state.pending=null;save(path,state)}state.phase="channels";save(path,state)
  }
  await adopt(token,s,saved,state,path);
  if(state.phase==="channels"){
    for(const c of [...saved.channels].sort((a,b)=>(a.type===4?0:1)-(b.type===4?0:1)||a.position-b.position)){if(state.channelMap[c.id])continue;const parent=c.parentId?state.channelMap[c.parentId]:null,overwrites=c.overwrites.map(o=>({id:o.type===0?state.roleMap[o.id]:o.id,type:o.type,allow:String(o.allow),deny:String(o.deny)})).filter(o=>o.id&&(o.type===0||o.id===OWNER));state.pending={kind:"channel",id:c.id};save(path,state);const made=await api(token,`/guilds/${s.target}/channels`,{method:"POST",body:{name:c.name,type:c.type,topic:c.topic??undefined,nsfw:c.nsfw??undefined,bitrate:c.bitrate?Math.min(Number(c.bitrate),96000):undefined,user_limit:c.userLimit??undefined,rate_limit_per_user:c.rateLimitPerUser??undefined,parent_id:parent||undefined,position:Number(c.position||0),permission_overwrites:overwrites},reason});state.channelMap[c.id]=made.id;state.pending=null;save(path,state)}state.phase="settings";save(path,state)
  }
  if(state.phase==="settings"){const m=id=>id?state.channelMap[id]||null:null;await api(token,`/guilds/${s.target}`,{method:"PATCH",body:{name:saved.guild.name,description:saved.guild.description??null,verification_level:saved.guild.verificationLevel,default_message_notifications:saved.guild.defaultMessageNotifications,explicit_content_filter:saved.guild.explicitContentFilter,afk_timeout:saved.guild.afkTimeout,afk_channel_id:m(saved.guild.afkChannelId),system_channel_id:m(saved.guild.systemChannelId),rules_channel_id:m(saved.guild.rulesChannelId),preferred_locale:saved.guild.preferredLocale},reason});state.phase="members";save(path,state)}
  if(state.phase==="members"){for(const[id,roles]of Object.entries(saved.members||{})){const member=await api(token,`/guilds/${s.target}/members/${id}`).catch(()=>null);if(!member||member.user?.bot)continue;for(const role of roles.map(x=>state.roleMap[x]).filter(Boolean))await api(token,`/guilds/${s.target}/members/${id}/roles/${role}`,{method:"PUT",reason})}state.phase="complete";state.completedAt=new Date().toISOString();save(path,state)}
  save(`${dir}/${s.key}-id-map.json`,{backupId:BACKUP,sourceGuildId:s.source,targetGuildId:s.target,roles:state.roleMap,channels:state.channelMap});console.log(`${s.label}: complete (${Object.keys(state.roleMap).length} role mappings, ${Object.keys(state.channelMap).length} channels)`);
}
async function apply(arg){
  const dir=resolve(arg),manifest=load(`${dir}/manifest.json`);if(manifest.backupId!==BACKUP||manifest.restores.length!==SPECS.length)throw new Error("manifest mismatch");const db=await openDb();
  try{for(const s of SPECS){const st=load(`${dir}/${s.key}-state.json`);if(st.phase!=="prepared")continue;const e=manifest.restores.find(x=>x.key===s.key);if(hash(await snapshot(env(s.file)[s.tokenKey],s.target))!==e.targetHash)throw new Error(`${s.label}: changed after preflight`)}for(const s of SPECS)await restoreOne(s,manifest.restores.find(x=>x.key===s.key),dir,db);console.log("RESTORE_COMPLETE") }finally{await db.end()}
}
const[a,b]=process.argv.slice(2);if(a==="--prepare"&&!b)await prepare();else if(a==="--apply"&&b)await apply(b);else{console.error("Usage: restore-network-guilds.mjs --prepare | --apply RUN_DIR");process.exitCode=2}
