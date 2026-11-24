// Webhook RevenueCat → Supabase (Oplaa Pro, abonnement PAR ÉTABLISSEMENT).
//
// RevenueCat appelle cette fonction à chaque évènement d'abonnement (achat, renouvellement, expiration…).
// L'app identifie RevenueCat avec « est_<id de l'établissement> » : on en déduit l'établissement et on met à jour
// establishments.pro_until / pro_source. C'est ce qui rend l'abonnement visible sur le web et pour tous les admins.
//
// Variables d'environnement (Supabase → Edge Functions → Secrets) :
//   REVENUECAT_WEBHOOK_AUTH   valeur choisie par nous, recopiée dans RevenueCat (Integrations → Webhooks → Authorization header)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   fournies automatiquement par Supabase (ne jamais les copier ailleurs)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GRANT = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'TEMPORARY_ENTITLEMENT_GRANT'];
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  const ev = body && body.event;
  if (!ev || !ev.type) return json({ error: 'bad request' }, 400);

  // Identifiant d'établissement : « est_<uuid> » (id courant, d'origine ou alias)
  const ids: string[] = [ev.app_user_id, ev.original_app_user_id, ...(ev.aliases || [])].filter(Boolean);
  const tagged = ids.find((x) => /^est_[0-9a-f-]{36}$/i.test(x));
  if (!tagged) return json({ ok: true, ignored: 'no establishment id' });
  const est = tagged.slice(4);

  let until: string | null = null;
  if (GRANT.includes(ev.type)) until = ev.expiration_at_ms ? new Date(ev.expiration_at_ms).toISOString() : null;
  else if (ev.type === 'EXPIRATION') until = new Date(ev.expiration_at_ms || Date.now()).toISOString();
  else return json({ ok: true, ignored: ev.type });   // CANCELLATION, BILLING_ISSUE… : l'accès court jusqu'à l'échéance déjà enregistrée
  if (!until) return json({ ok: true, ignored: 'no expiration' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cur, error: e1 } = await supabase.from('establishments').select('pro_until, pro_source').eq('id', est).maybeSingle();
  if (e1) return json({ error: e1.message }, 500);
  if (!cur) return json({ ok: true, ignored: 'unknown establishment' });

  // Un Pro offert par code n'est jamais raccourci par un évènement d'abonnement (à vie = 'infinity', ou échéance plus lointaine)
  const offered = typeof cur.pro_source === 'string' && cur.pro_source.startsWith('code:');
  if (cur.pro_until === 'infinity') return json({ ok: true, kept: 'lifetime' });
  if (offered && cur.pro_until && Date.parse(cur.pro_until) > Date.parse(until)) return json({ ok: true, kept: 'offered code is longer' });

  const { error: e2 } = await supabase.from('establishments').update({ pro_until: until, pro_source: 'apple' }).eq('id', est);
  if (e2) return json({ error: e2.message }, 500);
  return json({ ok: true, establishment: est, pro_until: until, event: ev.type });
});
