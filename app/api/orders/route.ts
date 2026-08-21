import { ok, fail } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";
import { listOrdersInputSchema, newOrderInputSchema } from "@/lib/mostro/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = listOrdersInputSchema.parse({ currency: url.searchParams.get("currency") ?? "COP" });
    return ok(await new MostroService().listOrders(input.currency));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = newOrderInputSchema.parse(await request.json());
    return ok(await new MostroService().createOrder(input));
  } catch (error) {
    return fail(error);
  }
}
