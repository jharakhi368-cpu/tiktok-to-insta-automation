import { exec } from "child_process";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const run = promisify(exec);

/**
 * Hands the whole project back as one archive — no secrets inside.
 * Lets an operator grab everything from a phone and push it to GitHub.
 */
export async function GET() {
  const root = process.cwd();
  const out = path.join(root, ".deploy-kit.tar.gz");

  const excludes = [
    "--exclude=./node_modules",
    "--exclude=./.next",
    "--exclude=./.git",
    "--exclude=./.media",
    "--exclude=./.uploads",
    "--exclude=./.deploy-kit.tar.gz",
    "--exclude=./.env", // secrets stay on the server
    "--exclude=*.log",
    "--exclude=./tsconfig.tsbuildinfo",
  ].join(" ");

  try {
    await run(
      `tar czf ${JSON.stringify(out)} ${excludes} --exclude=./public/deploy-kit.tar.gz .`,
      { cwd: root, timeout: 60_000 },
    );
    if (!existsSync(out)) throw new Error("archive was not created");
    const buf = await readFile(out);

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": 'attachment; filename="reelay-source.tar.gz"',
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not build the archive" },
      { status: 500 },
    );
  }
}
