import { handleStationAction } from "@/lib/stations/actions";

export async function POST(request: Request) {
  return handleStationAction(request, "packaging", "advance");
}
