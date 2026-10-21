// Tests d'intégration — backend Supabase : comptes, RPC, et surtout les garanties RGPD/RLS
// (un employé ne doit JAMAIS voir les salaires ni les infos de ses collègues) + Accès & rôles.
//
// Cible : le PROJET DE TEST `rourjugjspqppjhrizxw` (ancien projet Oplaa recyclé — org noamadar-cloud),
// « Confirm email » DÉSACTIVÉ (le signup renvoie un access_token). Ne jamais pointer sur la prod
// (`kldkqxqbmxtdedzjoghw`, confirmation activée) : ça créerait des comptes et brûlerait le quota d'e-mails.
// Les tests s'ignorent d'eux-mêmes si le projet de test est injoignable (en pause, hors ligne).
import { describe, it, expect, beforeAll } from 'vitest';

const URL = 'https://rourjugjspqppjhrizxw.supabase.co';
const ANON = 'sb_publishable_0YHzUC53GjuvekVfb8Azvg_Ze3fSUOF';
const PW = 'TestOplaa!2026';
const H = (tok) => ({ apikey: ANON, 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) });

async function signup(email) {
  const r = await fetch(`${URL}/auth/v1/signup`, { method: 'POST', headers: H(), body: JSON.stringify({ email, password: PW }) });
  return (await r.json()).access_token;
}
async function rpc(fn, body, tok) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(tok), body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function rest(pathQuery, tok, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${pathQuery}`, { method: opts.method || 'GET', headers: { ...H(tok), ...(opts.headers || {}) }, body: opts.body });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function uid(tok) { const r = await fetch(`${URL}/auth/v1/user`, { headers: H(tok) }); return (await r.json()).id; }

const stamp = Date.now();
const ctx = {};

const reachable = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(6000) }).then((r) => r.ok).catch(() => false);
if (!reachable) console.warn('⏭  Projet Supabase de test injoignable → tests d’intégration ignorés.');

describe.skipIf(!reachable)('backend Supabase — comptes, RPC, RLS et accès', () => {
  beforeAll(async () => {
    ctx.ownerTok = await signup(`it_owner_${stamp}@oplaa-test.fr`);
    ctx.empTok = await signup(`it_emp_${stamp}@oplaa-test.fr`);
    if (!ctx.ownerTok || !ctx.empTok) throw new Error('Le signup ne renvoie pas de token : « Confirm email » est activé sur la cible — ce n’est pas le projet de test.');
    // Les RPC « Accès & rôles » existent-elles sur ce projet ? (schema.sql ≥ 2026-10-21)
    const probe = await rpc('list_members', { est: '00000000-0000-0000-0000-000000000000' }, ctx.ownerTok);
    ctx.hasAccess = probe.status !== 404;
    if (!ctx.hasAccess) console.warn('⏭  RPC Accès & rôles absentes du projet de test (rejouer schema.sql) → tests Accès ignorés.');
  }, 30000);

  it('le patron crée un établissement (RPC create_establishment)', async () => {
    const r = await rpc('create_establishment', { p_name: 'Resto Intégration' }, ctx.ownerTok);
    expect(r.status).toBe(200);
    ctx.est = typeof r.json === 'string' ? r.json : String(r.json);
    expect(ctx.est).toMatch(/^[0-9a-f-]{36}$/);
  }, 20000);

  it('le patron ajoute un employé avec salaire (upsert local_id)', async () => {
    const r = await rest(`employees?on_conflict=establishment_id,local_id`, ctx.ownerTok, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([{ establishment_id: ctx.est, local_id: 'it-emp-1', name: 'Alex Test', role: 'salle', rate: 13.5 }]),
    });
    expect(r.status).toBeLessThan(300);
    ctx.empId = r.json[0].id;
  }, 20000);

  it('le patron VOIT le salaire de son employé', async () => {
    const r = await rest(`employees?select=name,rate&establishment_id=eq.${ctx.est}`, ctx.ownerTok);
    expect(r.status).toBe(200);
    expect(r.json.find((e) => e.name === 'Alex Test')?.rate).toBe(13.5);
  }, 20000);

  it("le patron génère un code d'invitation employé", async () => {
    ctx.code = 'IT' + String(stamp).slice(-6);
    const ownerId = await uid(ctx.ownerTok);
    const r = await rest('invite_codes', ctx.ownerTok, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ establishment_id: ctx.est, code: ctx.code, role: 'employee', employee_id: ctx.empId, created_by: ownerId }]),
    });
    expect(r.status).toBeLessThan(300);
  }, 20000);

  it("l'employé rejoint via le code (RPC join_with_code)", async () => {
    const r = await rpc('join_with_code', { p_code: ctx.code }, ctx.empTok);
    expect(r.json?.ok).toBe(true);
    expect(r.json?.role).toBe('employee');
  }, 20000);

  it('🔒 RGPD : un employé NE VOIT PAS les salaires (table employees bloquée)', async () => {
    const r = await rest(`employees?select=name,rate&establishment_id=eq.${ctx.est}`, ctx.empTok);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json)).toBe(true);
    expect(r.json.length).toBe(0); // RLS renvoie 0 ligne
  }, 20000);

  it('un employé voit seulement les prénoms via team_members_public', async () => {
    const r = await rest(`team_members_public?establishment_id=eq.${ctx.est}`, ctx.empTok);
    expect(r.status).toBe(200);
    const alex = r.json.find((e) => e.name === 'Alex Test');
    expect(alex).toBeTruthy();
    expect(alex.rate).toBeUndefined(); // aucune donnée sensible
  }, 20000);

  it('🔒 RGPD : un employé NE VOIT PAS les codes d’invitation', async () => {
    const r = await rest(`invite_codes?establishment_id=eq.${ctx.est}`, ctx.empTok);
    expect(r.json.length).toBe(0);
  }, 20000);

  it("accès : l'admin voit la liste des membres avec e-mails (list_members)", async ({ skip }) => {
    if (!ctx.hasAccess) skip();
    const r = await rpc('list_members', { est: ctx.est }, ctx.ownerTok);
    expect(r.status).toBe(200);
    const emails = r.json.map((m) => m.email);
    expect(emails).toContain(`it_owner_${stamp}@oplaa-test.fr`);
    expect(emails).toContain(`it_emp_${stamp}@oplaa-test.fr`);
    expect(r.json.find((m) => m.email === `it_emp_${stamp}@oplaa-test.fr`)?.role).toBe('employee');
  }, 20000);

  it("🔒 accès : un employé ne voit PAS la liste des membres", async ({ skip }) => {
    if (!ctx.hasAccess) skip();
    const r = await rpc('list_members', { est: ctx.est }, ctx.empTok);
    expect(r.status).toBe(200);
    expect(r.json.length).toBe(0);
  }, 20000);

  it("🔒 accès : un employé ne peut pas changer les rôles", async ({ skip }) => {
    if (!ctx.hasAccess) skip();
    const ownerId = await uid(ctx.ownerTok);
    const r = await rpc('set_member_role', { est: ctx.est, target: ownerId, new_role: 'employee' }, ctx.empTok);
    expect(r.json?.ok).toBe(false);
  }, 20000);

  it("accès : impossible de rétrograder le dernier admin", async ({ skip }) => {
    if (!ctx.hasAccess) skip();
    const ownerId = await uid(ctx.ownerTok);
    const r = await rpc('set_member_role', { est: ctx.est, target: ownerId, new_role: 'manager' }, ctx.ownerTok);
    expect(r.json?.ok).toBe(false);
  }, 20000);

  it("accès : l'admin promeut l'employé manager, puis le remet employé", async ({ skip }) => {
    if (!ctx.hasAccess) skip();
    const empId = await uid(ctx.empTok);
    let r = await rpc('set_member_role', { est: ctx.est, target: empId, new_role: 'manager' }, ctx.ownerTok);
    expect(r.json?.ok).toBe(true);
    // Devenu manager, il voit les employés… mais PAS les salaires (l'app ne demande pas la colonne rate) — ici on vérifie l'accès table
    const emps = await rest(`employees?select=name&establishment_id=eq.${ctx.est}`, ctx.empTok);
    expect(emps.status).toBe(200);
    expect(emps.json.length).toBeGreaterThan(0);
    r = await rpc('set_member_role', { est: ctx.est, target: empId, new_role: 'employee' }, ctx.ownerTok);
    expect(r.json?.ok).toBe(true);
  }, 30000);

  it("🔒 accès : un manager ne peut créer QUE des codes employé", async ({ skip }) => {
    if (!ctx.hasAccess) skip();
    const empId = await uid(ctx.empTok);
    await rpc('set_member_role', { est: ctx.est, target: empId, new_role: 'manager' }, ctx.ownerTok);
    const bad = await rest('invite_codes', ctx.empTok, { method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ establishment_id: ctx.est, code: 'MG' + String(stamp).slice(-6), role: 'manager', created_by: empId }]) });
    expect(bad.status).toBeGreaterThanOrEqual(400);   // refusé par la RLS
    const ok = await rest('invite_codes', ctx.empTok, { method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ establishment_id: ctx.est, code: 'EM' + String(stamp).slice(-6), role: 'employee', created_by: empId }]) });
    expect(ok.status).toBeLessThan(300);
    await rpc('set_member_role', { est: ctx.est, target: empId, new_role: 'employee' }, ctx.ownerTok);
  }, 30000);

  it('suppression de compte in-app (RPC delete_account)', async () => {
    const throwaway = await signup(`it_del_${stamp}@oplaa-test.fr`);
    const del = await rpc('delete_account', {}, throwaway);
    expect(del.status).toBeLessThan(300);
    // reconnexion impossible ensuite
    const login = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: H(), body: JSON.stringify({ email: `it_del_${stamp}@oplaa-test.fr`, password: PW }) });
    expect(login.status).toBeGreaterThanOrEqual(400);
  }, 30000);
});
