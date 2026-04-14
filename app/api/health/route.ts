import { NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { ensureDatabase } from "@/lib/db/bootstrap";

export const runtime = "nodejs";

export async function GET() {
  await ensureDatabase();
  await pool.query("select 1");

  return NextResponse.json({
    ok: true,
    database: "connected"
  });
}
