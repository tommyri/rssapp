import { apiJson } from "@/lib/api-v1-response";
import { nativeProviderAvailability } from "@/lib/native-provider-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return apiJson({ data: nativeProviderAvailability() });
}
