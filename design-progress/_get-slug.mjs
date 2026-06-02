import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8');
const get = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^["']|["']$/g,'');
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY')||get('SUPABASE_SERVICE_ROLE')||get('SUPABASE_SECRET_KEY'), { auth:{persistSession:false} });
// discover columns
const { data, error } = await sb.from('restaurants').select('*').eq('is_active',true).limit(40);
if(error){console.error('ERR',error.message);process.exit(1);}
const withProducts = [];
for (const r of data) {
  const { count } = await sb.from('products').select('id',{count:'exact',head:true}).eq('restaurant_id', r.id);
  withProducts.push({ slug:r.slug, mode:r.active_mode, primary:r.primary_color, products: count||0 });
}
withProducts.sort((a,b)=>b.products-a.products);
console.log(JSON.stringify(withProducts.slice(0,8),null,1));
