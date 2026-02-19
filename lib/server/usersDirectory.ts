import { callGas } from "@/lib/integrations/gasClient";

export type UsersDirectoryDebug = {
  users_directory_found: boolean;
  available_sheet_names: string[];
  header_row_index: number | null;
  header_row_values: unknown[];
  headers_seen: string[];
  missing_required: string[];
  header_ok: boolean;
  sheet_last_row?: number;
  sheet_last_col?: number;
  scanned_rows_preview?: unknown[];
  spreadsheet_id?: string;
  requested_sheet_name?: string;
};

export type UsersDirectoryUser = {
  id: string;
  username: string;
  password: string;
  password_hash: string;
  is_active: string;
  roles: string;
};

export async function readUsersDirectoryFromGas(requestId: string): Promise<{
  users: UsersDirectoryUser[];
  debug: UsersDirectoryDebug;
}> {
  const response = await callGas<{ users?: UsersDirectoryUser[]; debug?: UsersDirectoryDebug }>(
    "control_model.users_directory.read",
    {},
    requestId
  );

  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Failed to read users_directory");
  }

  return {
    users: Array.isArray(response.data.users) ? response.data.users : [],
    debug: {
      users_directory_found: Boolean(response.data.debug?.users_directory_found),
      available_sheet_names: Array.isArray(response.data.debug?.available_sheet_names)
        ? response.data.debug?.available_sheet_names
        : [],
      header_row_index:
        typeof response.data.debug?.header_row_index === "number" ? response.data.debug.header_row_index : null,
      header_row_values: Array.isArray(response.data.debug?.header_row_values) ? response.data.debug.header_row_values : [],
      headers_seen: Array.isArray(response.data.debug?.headers_seen) ? response.data.debug.headers_seen : [],
      missing_required: Array.isArray(response.data.debug?.missing_required) ? response.data.debug.missing_required : [],
      header_ok: Boolean(response.data.debug?.header_ok),
      sheet_last_row: typeof response.data.debug?.sheet_last_row === "number" ? response.data.debug.sheet_last_row : undefined,
      sheet_last_col: typeof response.data.debug?.sheet_last_col === "number" ? response.data.debug.sheet_last_col : undefined,
      scanned_rows_preview: Array.isArray(response.data.debug?.scanned_rows_preview)
        ? response.data.debug.scanned_rows_preview
        : undefined,
      spreadsheet_id: typeof response.data.debug?.spreadsheet_id === "string" ? response.data.debug.spreadsheet_id : undefined,
      requested_sheet_name:
        typeof response.data.debug?.requested_sheet_name === "string" ? response.data.debug.requested_sheet_name : undefined,
    },
  };
}

export async function writeUsersDirectoryHashes(
  requestId: string,
  updates: Array<{ id: string; password_hash: string }>
): Promise<{ updated: number; mode: "password_hash" | "password" }> {
  const response = await callGas<{ updated?: number; mode?: "password_hash" | "password" }>(
    "control_model.users_directory.update_passwords",
    { updates },
    requestId
  );

  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Failed to write users_directory password hashes");
  }

  return {
    updated: typeof response.data.updated === "number" ? response.data.updated : 0,
    mode: response.data.mode === "password" ? "password" : "password_hash",
  };
}
