import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from("guide_chunks")
    .select("chunk_index, chunk_text")
    .eq("guide_url", "https://gamefaqs.gamespot.com/pc/835620-firewatch/faqs/72917");
    
  if (error) console.error("Error:", error);
  else {
    console.log(`Found ${data.length} chunks.`);
    let totalLength = 0;
    for (const chunk of data) {
      totalLength += chunk.chunk_text.length;
    }
    console.log(`Total characters stored: ${totalLength}`);
  }
}
run();
