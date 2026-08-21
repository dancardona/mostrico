import { ok, fail } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(await new MostroService().diagnostics());
  } catch (error) {
    return fail(error);
  }
}
