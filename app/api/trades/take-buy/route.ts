import { ok, fail } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";
import { takeBuyInputSchema } from "@/lib/mostro/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = takeBuyInputSchema.parse(await request.json());
    return ok(await new MostroService().takeBuy(input));
  } catch (error) {
    return fail(error);
  }
}
