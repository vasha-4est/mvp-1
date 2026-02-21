import { headers } from "next/headers";

import { BatchList } from "../../components/batch/BatchList";
import { requirePageRole } from "@/lib/server/guards";
import { listBatches } from "../../lib/api/batch";

type SearchParams = {
  prefix?: string;
  fromDate?: string;
  toDate?: string;
};

function getBaseUrl(): string {
  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  requirePageRole("/batches", ["OWNER", "COO", "VIEWER"]);

  const filters = {
    prefix: searchParams.prefix ?? "",
    fromDate: searchParams.fromDate ?? "",
    toDate: searchParams.toDate ?? "",
  };

  const result = await listBatches(filters, { baseUrl: getBaseUrl() });

  return (
    <main>
      <BatchList
        items={result.items}
        error={result.error}
        validationError={result.validationError}
        filters={filters}
      />
    </main>
  );
}
