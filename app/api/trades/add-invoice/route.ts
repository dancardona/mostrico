import { ok, fail } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";
import { addInvoiceInputSchema } from "@/lib/mostro/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = addInvoiceInputSchema.parse(await request.json());
    return ok(await new MostroService().addInvoice(input));
  } catch (error) {
    return fail(error);
  }
}
