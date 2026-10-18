import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(url, key);

  const sqlPath = path.join(__dirname, "../supabase/migrations/20260901000000_phase3_rag_vector_knowledge.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  console.log("Checking Supabase connection and tables...");
  
  // Test if knowledge_chunks table is present
  const { error: testErr } = await supabase.from("knowledge_chunks").select("id").limit(1);
  if (testErr && testErr.message.includes("does not exist") || testErr?.message.includes("schema cache")) {
    console.log("Tables not yet created in Supabase.");
    console.log("Please paste supabase/migrations/20260901000000_phase3_rag_vector_knowledge.sql into Supabase SQL Editor.");
  } else {
    console.log("knowledge_chunks is present and ready!");
  }
}

main().catch(console.error);
