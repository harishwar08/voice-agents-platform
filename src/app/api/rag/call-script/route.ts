import { NextResponse } from "next/server";
import { loadAccessibleEmployee } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBusinessCallScript, BusinessCallScript } from "@/lib/rag/qa-engine";

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const aiEmployeeId = searchParams.get("aiEmployeeId");

    if (!aiEmployeeId) {
      return NextResponse.json({ error: "aiEmployeeId is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    // 1. Fetch AI employee details & business
    const employee = await loadAccessibleEmployee(supabase, session, aiEmployeeId);

    if (!employee) {
      return NextResponse.json({ error: "AI Employee not found" }, { status: 404 });
    }

    const businessName = (employee as any).businesses?.name || "Our Business";

    // 2. Check if a saved call script exists in knowledge_documents
    const { data: existingScriptDoc } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("ai_employee_id", aiEmployeeId)
      .eq("source_type", "direct_note")
      .filter("metadata->>is_call_script", "eq", "true")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingScriptDoc && existingScriptDoc.metadata?.script_data) {
      return NextResponse.json({
        script: existingScriptDoc.metadata.script_data as BusinessCallScript,
        documentId: existingScriptDoc.id,
        isCustomized: true,
      });
    }

    // 3. If none saved yet, fetch knowledge documents to prepare one
    const { data: docs } = await supabase
      .from("knowledge_documents")
      .select("name, summary, raw_text, source_type")
      .eq("ai_employee_id", aiEmployeeId);

    const callScript = await generateBusinessCallScript({
      businessName,
      employeeName: employee.name,
      employeeRole: employee.description || "Voice Calling Specialist",
      documents: docs || [],
    });

    return NextResponse.json({
      script: callScript,
      documentId: null,
      isCustomized: false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to get call script" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { aiEmployeeId, customInstructions } = body;

    if (!aiEmployeeId) {
      return NextResponse.json({ error: "aiEmployeeId is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    // Fetch employee and business
    const employee = await loadAccessibleEmployee(supabase, session, aiEmployeeId);

    if (!employee) {
      return NextResponse.json({ error: "AI Employee not found" }, { status: 404 });
    }

    const businessName = (employee as any).businesses?.name || "Our Business";

    // Fetch documents
    const { data: docs } = await supabase
      .from("knowledge_documents")
      .select("name, summary, raw_text, source_type")
      .eq("ai_employee_id", aiEmployeeId)
      .not("metadata->>is_call_script", "eq", "true");

    const allDocs = [...(docs || [])];
    if (customInstructions) {
      allDocs.push({
        name: "Special Instructions",
        summary: customInstructions,
        raw_text: customInstructions,
        source_type: "direct_note",
      });
    }

    // Generate tailored script
    const callScript = await generateBusinessCallScript({
      businessName,
      employeeName: employee.name,
      employeeRole: employee.description || "Outbound Sales & Lead Calling Specialist",
      documents: allDocs,
    });

    // Save into knowledge_documents as the active call script
    const scriptDocTitle = `Outbound Call Script - ${businessName}`;
    const { data: existingDoc } = await supabase
      .from("knowledge_documents")
      .select("id")
      .eq("ai_employee_id", aiEmployeeId)
      .eq("source_type", "direct_note")
      .filter("metadata->>is_call_script", "eq", "true")
      .limit(1)
      .maybeSingle();

    let savedDoc = null;
    if (existingDoc?.id) {
      const { data } = await supabase
        .from("knowledge_documents")
        .update({
          name: scriptDocTitle,
          raw_text: callScript.fullScript,
          summary: callScript.openingMessage,
          status: "indexed",
          metadata: {
            is_call_script: "true",
            script_data: callScript,
            updated_at: new Date().toISOString(),
          },
        })
        .eq("id", existingDoc.id)
        .select("*")
        .single();
      savedDoc = data;
    } else {
      const { data } = await supabase
        .from("knowledge_documents")
        .insert({
          business_id: employee.business_id,
          ai_employee_id: aiEmployeeId,
          name: scriptDocTitle,
          source_type: "direct_note",
          file_type: "text/script",
          raw_text: callScript.fullScript,
          summary: callScript.openingMessage,
          status: "indexed",
          metadata: {
            is_call_script: "true",
            script_data: callScript,
            created_at: new Date().toISOString(),
          },
        })
        .select("*")
        .single();
      savedDoc = data;
    }

    return NextResponse.json({
      success: true,
      script: callScript,
      documentId: savedDoc?.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to generate call script" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { aiEmployeeId, scriptData } = body;

    if (!aiEmployeeId || !scriptData) {
      return NextResponse.json({ error: "aiEmployeeId and scriptData are required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    const employee = await loadAccessibleEmployee(supabase, session, aiEmployeeId);

    if (!employee) {
      return NextResponse.json({ error: "AI Employee not found" }, { status: 404 });
    }

    const { data: existingDoc } = await supabase
      .from("knowledge_documents")
      .select("id")
      .eq("ai_employee_id", aiEmployeeId)
      .eq("source_type", "direct_note")
      .filter("metadata->>is_call_script", "eq", "true")
      .limit(1)
      .maybeSingle();

    if (existingDoc?.id) {
      await supabase
        .from("knowledge_documents")
        .update({
          raw_text: scriptData.fullScript || "",
          summary: scriptData.openingMessage || "",
          metadata: {
            is_call_script: "true",
            script_data: scriptData,
            updated_at: new Date().toISOString(),
          },
        })
        .eq("id", existingDoc.id);
    } else {
      await supabase
        .from("knowledge_documents")
        .insert({
          business_id: employee.business_id,
          ai_employee_id: aiEmployeeId,
          name: `Outbound Call Script - ${scriptData.businessName || "Business"}`,
          source_type: "direct_note",
          file_type: "text/script",
          raw_text: scriptData.fullScript || "",
          summary: scriptData.openingMessage || "",
          status: "indexed",
          metadata: {
            is_call_script: "true",
            script_data: scriptData,
            created_at: new Date().toISOString(),
          },
        });
    }

    return NextResponse.json({ success: true, script: scriptData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update script" }, { status: 500 });
  }
}
