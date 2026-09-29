// Local-only regression fixture. Run with PGLITE_MODULE=<absolute dist/index.js> node scripts/test-shared-tablet.mjs
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const modulePath = process.env.PGLITE_MODULE
if (!modulePath) throw new Error('PGLITE_MODULE is required')
const { PGlite } = await import(pathToFileURL(modulePath).href)
const { pgcrypto } = await import(pathToFileURL(modulePath.replace(/index\.js$/, 'contrib/pgcrypto.js')).href)
const db = new PGlite({ extensions: { pgcrypto } })
const q = async (sql, params) => db.query(sql, params)
const base = `
  create extension if not exists pgcrypto;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as 'select null::uuid';
  create function auth.role() returns text language sql stable as 'select ''service_role''';
  create role anon; create role authenticated; create role service_role;
  create table public.factories(id uuid primary key, name text not null);
  create table public.profiles(id uuid primary key references auth.users(id), full_name text, role text, factory_id uuid references public.factories(id), is_active boolean default true, is_shared_device boolean default false);
  create table public.machines(id uuid primary key, machine_code text, machine_name text);
  create table public.incidents(id uuid primary key, factory_id uuid not null references public.factories(id), machine_id uuid references public.machines(id), incident_no text, title text, status text, reported_at timestamptz default now());
  create table public.incident_updates(id uuid primary key default gen_random_uuid(), incident_id uuid not null references public.incidents(id), note text, updated_by text, updated_by_id uuid, created_at timestamptz default now());
`
await db.exec(base)
for (const name of ['20260928032216_shared_technician_tablet_foundation.sql', '20260929051731_shared_tablet_independent_roster.sql']) {
  await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
}
const ids = { admin:'11111111-1111-4111-8111-111111111111', device:'22222222-2222-4222-8222-222222222222', f1:'33333333-3333-4333-8333-333333333333', f2:'44444444-4444-4444-8444-444444444444', i1:'55555555-5555-4555-8555-555555555555', i2:'66666666-6666-4666-8666-666666666666', req:'77777777-7777-4777-8777-777777777777' }
await db.exec(`insert into auth.users(id) values ('${ids.admin}'),('${ids.device}'); insert into factories values ('${ids.f1}','A'),('${ids.f2}','B'); insert into profiles(id,full_name,role,is_active,is_shared_device) values ('${ids.admin}','Admin','admin',true,false),('${ids.device}','Tablet','technician',true,true); insert into incidents(id,factory_id,incident_no,title,status) values ('${ids.i1}','${ids.f1}','A-1','Open','repairing'),('${ids.i2}','${ids.f2}','B-1','Closed','closed');`)
const config = { p_actor_id:ids.admin, p_auth_user_id:ids.device, p_label:'Tablet A+B', p_factory_ids:[ids.f1,ids.f2], p_performers:[{full_name:'Pak Dasir'},{full_name:'Suwardi'}] }
const configured = await q('select public.configure_shared_device($1,$2,$3,$4,$5) id', [config.p_actor_id,config.p_auth_user_id,config.p_label,config.p_factory_ids,JSON.stringify(config.p_performers)])
const deviceId = configured.rows[0].id
const roster = await q('select technician_id, full_name from shared_device_roster r join shared_technicians t on t.id=r.technician_id where device_id=$1 order by full_name',[deviceId])
if (roster.rows.length !== 2) throw new Error('canonical roster missing')
const dasir = roster.rows.find(x => x.full_name === 'Pak Dasir').technician_id
const event = [deviceId,ids.i1,ids.device,ids.req,'fixed it',[dasir]]
const first = await q('select public.create_shared_tablet_update($1,$2,$3,$4,$5,$6) id', event)
await q(`update incidents set status='closed' where id='${ids.i1}'`)
const replay = await q('select public.create_shared_tablet_update($1,$2,$3,$4,$5,$6) id', event)
if (first.rows[0].id !== replay.rows[0].id) throw new Error('idempotent replay failed after close')
const mine = await q('select public.get_shared_tablet_incidents($1,$2,$3,$4) result',[deviceId,ids.device,dasir,'mine'])
if (!mine.rows[0].result.some(x => x.id === ids.i1 && x.status === 'closed')) throw new Error('mine must retain closed performer activity')
const renamed = await q('select public.configure_shared_device($1,$2,$3,$4,$5) id',[ids.admin,ids.device,'Tablet A+B',[ids.f1,ids.f2],JSON.stringify([{id:dasir,full_name:'Pak Dasir Baru'},{id:roster.rows.find(x=>x.full_name==='Suwardi').technician_id,full_name:'Suwardi'}])])
if (renamed.rows[0].id !== deviceId) throw new Error('device edit changed stable device id')
const snapshot = await q('select performer_name_snapshot from incident_update_performers where update_id=$1',[first.rows[0].id])
if (snapshot.rows[0].performer_name_snapshot !== 'Pak Dasir') throw new Error('historical name snapshot mutated')
for (const table of ['shared_technicians','shared_device_factories']) { const r = await q(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`); if (!r.rows[0].relrowsecurity) throw new Error(`${table} RLS off`) }
let negativeCount = 0
async function deny(label, sql, params, code) {
  try { await q(sql, params) } catch (error) {
    if (error.code !== code) throw new Error(label + ': expected ' + code + ', got ' + error.code)
    negativeCount++
    return
  }
  throw new Error(label + ': unexpectedly allowed')
}
const saveSql = 'select public.create_shared_tablet_update($1,$2,$3,$4,$5,$6) id'
await deny('changed request payload', saveSql, [...event.slice(0,4),'different content',[dasir]], '23505')
await deny('new event on closed incident', saveSql, [deviceId,ids.i1,ids.device,crypto.randomUUID(),'new event',[dasir]], '55000')
await deny('spoofed actor', saveSql, [deviceId,ids.i1,ids.admin,crypto.randomUUID(),'spoof',[dasir]], '42501')
await deny('empty note', saveSql, [deviceId,ids.i1,ids.device,crypto.randomUUID(),' ',[dasir]], '22023')
await deny('duplicate performers', saveSql, [deviceId,ids.i1,ids.device,crypto.randomUUID(),'duplicate',[dasir,dasir]], '22023')
await q('update incidents set status=$1 where id=$2',['repairing',ids.i2])
await deny('unknown performer', saveSql, [deviceId,ids.i2,ids.device,crypto.randomUUID(),'unknown',[ids.admin]], '42501')
await q('delete from shared_device_factories where device_id=$1 and factory_id=$2',[deviceId,ids.f2])
await deny('forbidden factory', saveSql, [deviceId,ids.i2,ids.device,crypto.randomUUID(),'other factory',[dasir]], '42501')
await q('update shared_technicians set is_active=false where id=$1',[dasir])
await deny('inactive performer', saveSql, [deviceId,ids.i2,ids.device,crypto.randomUUID(),'inactive',[dasir]], '42501')
await q('insert into shared_device_factories(device_id,factory_id) values ($1,$2)',[deviceId,ids.f2])
await deny('inactive performer in allowed factory', saveSql, [deviceId,ids.i2,ids.device,crypto.randomUUID(),'inactive',[dasir]], '42501')
await q('update shared_technicians set is_active=true where id=$1',[dasir])
await q('update shared_devices set enabled=false where id=$1',[deviceId])
await deny('disabled device', saveSql, [deviceId,ids.i2,ids.device,crypto.randomUUID(),'disabled',[dasir]], '42501')
await q('update shared_devices set enabled=true where id=$1',[deviceId])
await q('update profiles set is_active=false where id=$1',[ids.device])
await deny('disabled account', saveSql, [deviceId,ids.i2,ids.device,crypto.randomUUID(),'disabled',[dasir]], '42501')
await q('update profiles set is_active=true where id=$1',[ids.device])

const beforeConfig = await q('select label,enabled from shared_devices where id=$1',[deviceId])
const rosterBefore = await q('select technician_id from shared_device_roster where device_id=$1 order by technician_id',[deviceId])
await deny('atomic invalid configuration', 'select public.configure_shared_device($1,$2,$3,$4,$5)', [ids.admin,ids.device,'Must roll back',[ids.f1],JSON.stringify([{id:dasir,full_name:'Unexpected rename'},{id:dasir,full_name:'Unexpected rename'}])], '22023')
const afterConfig = await q('select label,enabled from shared_devices where id=$1',[deviceId])
const rosterAfter = await q('select technician_id from shared_device_roster where device_id=$1 order by technician_id',[deviceId])
if (JSON.stringify(beforeConfig.rows) !== JSON.stringify(afterConfig.rows) || JSON.stringify(rosterBefore.rows) !== JSON.stringify(rosterAfter.rows)) throw new Error('failed configuration was not atomic')
const nameAfterFailure = await q('select full_name from shared_technicians where id=$1',[dasir])
if (nameAfterFailure.rows[0].full_name !== 'Pak Dasir Baru') throw new Error('failed configuration renamed performer')

for (const role of ['anon','authenticated']) {
  await db.exec('set role ' + role)
  try {
    for (const table of ['shared_devices','shared_device_roster','incident_update_performers','shared_technicians','shared_device_factories']) {
      for (const sql of ['select 1 from public.'+table+' limit 0', 'insert into public.'+table+' default values', 'update public.'+table+' set created_at=created_at where false', 'delete from public.'+table+' where false']) {
        await deny(role+' table ACL '+table, sql, undefined, '42501')
      }
    }
    for (const sql of ['select public.configure_shared_device(null,null,null,null,null)', 'select public.set_shared_device_enabled(null,null,true)', 'select public.create_shared_tablet_update(null,null,null,null,null,null)', 'select public.get_shared_tablet_incidents(null,null,null,null)']) {
      await deny(role+' RPC ACL', sql, undefined, '42501')
    }
  } finally { await db.exec('reset role') }
}
await db.exec('set role service_role')
try {
  const serviceRead = await q('select public.get_shared_tablet_incidents($1,$2,$3,$4) result',[deviceId,ids.device,dasir,'mine'])
  if (!serviceRead.rows[0].result.some(item => item.id === ids.i1)) throw new Error('service RPC allow path missing')
} finally { await db.exec('reset role') }
console.log('PASS shared tablet 2-migration fixture; ' + negativeCount + ' negative cases; atomicity + service allow path')
await db.close()
