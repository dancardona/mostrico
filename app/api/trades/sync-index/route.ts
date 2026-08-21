import { fail, ok } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    return ok(await new MostroService().syncTradeIndex());
  } catch (error) {
    return fail(error);
  }
}
