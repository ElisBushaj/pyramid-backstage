/** The response envelope shared verbatim with the frontend (api/types/_envelope.ts). */
export interface ServiceResponse<T> {
  status: "OK";
  message: string;
  messageKey: string;
  data: T;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type PaginatedServiceResponse<T> = ServiceResponse<Paginated<T>>;

export function ok<T>(data: T, messageKey: string, message = ""): ServiceResponse<T> {
  return { status: "OK", message, messageKey, data };
}

/** The authenticated staff identity attached to every private request. */
export interface Actor {
  id: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "OPS" | "VIEWER";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
      locale: "al" | "en";
    }
  }
}
