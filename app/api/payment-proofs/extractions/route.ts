import { NextResponse } from "next/server";
import { extractRoleDocuments } from "../../../../src/server/input-extraction/reconciliation-workflow";
import { uploadsFromFormData } from "../../../../src/server/input-extraction/upload-form";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await extractRoleDocuments("payment_proof", await uploadsFromFormData(formData));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to extract payment proof documents." },
      { status: 400 }
    );
  }
}
