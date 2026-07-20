const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
let supabaseUrl, supabaseKey;

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim();
  } else if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    supabaseKey = line.split('=')[1].trim();
  }
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const urlBase = 'https://gamefaqs.gamespot.com/pc/179341-hollow-knight/faqs/76039%';
  
  console.log(`Deleting from guide_chunks like: ${urlBase}`);
  const res = await supabase.from('guide_chunks').delete().like('guide_url', urlBase);
  console.log('guide_chunks:', res.error ? res.error : 'Success');
}

main();
