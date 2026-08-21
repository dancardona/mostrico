import { ok, fail } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";
import { takeSellInputSchema } from "@/lib/mostro/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = takeSellInputSchema.parse(await request.json());
    return ok(await new MostroService().takeSell(input));
  } catch (error) {
    return fail(error);
  }
}
