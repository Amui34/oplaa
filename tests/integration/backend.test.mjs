// Tests d'intégration — backend Supabase : comptes, RPC, et surtout les garanties RGPD/RLS
// (un employé ne doit JAMAIS voir les salaires ni les infos de ses collègues).
// Hit le vrai projet Supabase de test. Confirmation email désactivée → signup renvoie un token.
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

describe('backend Supabase — comptes, RPC et confidentialité RLS', () => {
  beforeAll(async () => {
    ctx.ownerTok = await signup(`it_owner_${stamp}@oplaa-test.fr`);
    ctx.empTok = await signup(`it_emp_${stamp}@oplaa-test.fr`);
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

  it('suppression de compte in-app (RPC delete_account)', async () => {
    const throwaway = await signup(`it_del_${stamp}@oplaa-test.fr`);
    const del = await rpc('delete_account', {}, throwaway);
    expect(del.status).toBeLessThan(300);
    // reconnexion impossible ensuite
    const login = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: H(), body: JSON.stringify({ email: `it_del_${stamp}@oplaa-test.fr`, password: PW }) });
    expect(login.status).toBeGreaterThanOrEqual(400);
  }, 30000);
});
