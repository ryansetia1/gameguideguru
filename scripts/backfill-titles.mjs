import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "../.env.local"), "utf8");

/** @param {string} key */
const getEnv = (key) => {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].replace(/['"]/g, "") : null;
};

const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: chunks, error } = await supabase
    .from("guide_chunks")
    .select("guide_url")
    .is("guide_bundle", null);
    
  if (error) {
    console.error("Error fetching chunks:", error);
    return;
  }
  
  const uniqueUrls = [...new Set(chunks.map(c => c.guide_url))].filter(url => !url.startsWith("upload://") && !url.includes("gamefaqs.gamespot.com/"));
  console.log(`Found ${uniqueUrls.length} unique single-page URLs.`);
  
  for (const url of uniqueUrls) {
    console.log(`Fetching title for ${url}...`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const html = await res.text();
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (match) {
          const htmlTitle = match[1].trim().replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
          console.log(`  -> ${htmlTitle}`);
          
          await supabase.from("guide_bundle_cache").upsert({
            bundle_key: url,
            data: { title: htmlTitle }
          });
        } else {
          console.log(`  -> No <title> tag found.`);
        }
      } else {
         console.log(`  -> Fetch failed: ${res.status}`);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.log(`  -> Error: ${errorMsg}`);
    }
  }
  
  console.log("Done!");
}

run();
