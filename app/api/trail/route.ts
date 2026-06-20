import { NextResponse } from "next/server";
import { loadTrail, saveTrail } from "@/lib/storage";
import type { Trail } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadTrail());
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Trail;
  body.updatedAt = new Date().toISOString();
  await saveTrail(body);
  return NextResponse.json({ ok: true, updatedAt: body.updatedAt });
}
