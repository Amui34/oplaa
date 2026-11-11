// Fonction serveur « notify » : envoie des notifications push (APNs) aux appareils de l'équipe.
//
// Appelée par l'app (utilisateur connecté) avec { establishment_id, type, week?, request_id?, details? }.
// Types : planning_published (→ employés et managers de l'établissement), leave_requested (→ admins / managers),
//         leave_approved / leave_refused (→ l'employé concerné par la demande).
//
// Secrets (Supabase → Edge Functions → Secrets) :
//   APNS_KEY_ID      identifiant de la clé APNs (10 caractères), créée dans developer.apple.com → Keys
//   APNS_TEAM_ID     772LDD7BCT
//   APNS_P8          contenu du fichier .p8 (la clé privée, PEM) — ne jamais la copier ailleurs
//   APNS_BUNDLE_ID   com.oplaa.app
//   APNS_ENV         production (ou sandbox pour les builds de développement)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY : fournis automatiquement
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let _jwt: { token: string; at: number } | null = null;
async function apnsJwt(): Promise<string> {
  if (_jwt && Date.now() - _jwt.at < 45 * 60 * 1000) return _jwt.token;   // Apple accepte un jeton pendant 1 h
  const pem = Deno.env.get('APNS_P8')!.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: Deno.env.get('APNS_KEY_ID') })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({ iss: Deno.env.get('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(header + '.' + claims));
  _jwt = { token: header + '.' + claims + '.' + b64url(sig), at: Date.now() };
  return _jwt.token;
}

async function sendApns(token: string, title: string, body: string, data: Record<string, unknown>) {
  const host = (Deno.env.get('APNS_ENV') || 'production') === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const res = await fetch(`${host}/3/device/${token}`, {
    method: 'POST',
    headers: { authorization: `bearer ${await apnsJwt()}`, 'apns-topic': Deno.env.get('APNS_BUNDLE_ID') || 'com.oplaa.app', 'apns-push-type': 'alert', 'apns-priority': '10' },
    body: JSON.stringify({ aps: { alert: { title, body }, sound: 'default' }, ...data }),
  });
  return { ok: res.ok, status: res.status, reason: res.ok ? '' : (await res.text()).slice(0, 200) };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const body = await req.json().catch(() => null);
  if (!body || !body.establishment_id || !body.type) return json({ error: 'bad request' }, 400);
  const est: string = body.establishment_id;

  // Qui appelle ? (jeton de l'utilisateur) → son rôle dans l'établissement
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: me } = await asUser.auth.getUser();
  if (!me?.user) return json({ error: 'unauthorized' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: mem } = await admin.from('memberships').select('role, employee_id').eq('establishment_id', est).eq('user_id', me.user.id).maybeSingle();
  if (!mem) return json({ error: 'forbidden' }, 403);
  const { data: estRow } = await admin.from('establishments').select('name').eq('id', est).maybeSingle();
  const estName = estRow?.name || 'Oplaa';

  // Destinataires + message selon le type
  let userIds: string[] = []; let title = estName; let text = '';
  const frWeek = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); };
  if (body.type === 'planning_published') {
    if (!['owner', 'manager'].includes(mem.role)) return json({ error: 'forbidden' }, 403);
    const { data: ms } = await admin.from('memberships').select('user_id').eq('establishment_id', est).neq('user_id', me.user.id);
    userIds = (ms || []).map((m) => m.user_id); text = `Ton planning de la semaine du ${frWeek(body.week)} est publié.`;
  } else if (body.type === 'leave_requested') {
    const { data: ms } = await admin.from('memberships').select('user_id').eq('establishment_id', est).in('role', ['owner', 'manager']).neq('user_id', me.user.id);
    userIds = (ms || []).map((m) => m.user_id); title = `${estName} — demande de congé`; text = String(body.details || 'Nouvelle demande à valider').slice(0, 120);
  } else if (body.type === 'leave_approved' || body.type === 'leave_refused') {
    if (!['owner', 'manager'].includes(mem.role)) return json({ error: 'forbidden' }, 403);
    const { data: r } = await admin.from('day_off_requests').select('employee_id, details').eq('id', body.request_id).maybeSingle();
    if (r?.employee_id) { const { data: ms } = await admin.from('memberships').select('user_id').eq('establishment_id', est).eq('employee_id', r.employee_id); userIds = (ms || []).map((m) => m.user_id); }
    title = `${estName} — congé`; text = body.type === 'leave_approved' ? `Ta demande est acceptée ✅ ${r?.details ? '(' + String(r.details).slice(0, 60) + ')' : ''}` : `Ta demande n'a pas pu être acceptée. ${r?.details ? '(' + String(r.details).slice(0, 60) + ')' : ''}`;
  } else return json({ error: 'unknown type' }, 400);

  if (!userIds.length) return json({ ok: true, sent: 0, recipients: 0 });
  if (!Deno.env.get('APNS_P8')) return json({ ok: true, sent: 0, recipients: userIds.length, error: 'APNs non configuré' });
  const { data: toks } = await admin.from('push_tokens').select('token, user_id').in('user_id', userIds);
  let sent = 0; const dead: string[] = [];
  for (const t of toks || []) {
    const r = await sendApns(t.token, title, text, { type: body.type, week: body.week || null });
    if (r.ok) sent++; else if (r.status === 410 || /BadDeviceToken|Unregistered/.test(r.reason)) dead.push(t.token);
  }
  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  return json({ ok: true, sent, recipients: userIds.length, devices: (toks || []).length });
});
