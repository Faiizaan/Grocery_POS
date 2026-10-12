export const queryKeys = {
  sales: {
    all: ["sales"] as const,
    list: (page: number, pageSize: number) =>
      [...queryKeys.sales.all, "list", page, pageSize] as const,
    detail: (id: string | undefined) =>
      [...queryKeys.sales.all, "detail", id] as const,
    summary: (from: string, to: string) =>
      [...queryKeys.sales.all, "summary", from, to] as const,
  },
  users: {
    all: ["users"] as const,
  },
  purchases: {
    all: ["purchases"] as const,
    list: (page: number, pageSize: number) =>
      [...queryKeys.purchases.all, "list", page, pageSize] as const,
    detail: (id: string | undefined) =>
      [...queryKeys.purchases.all, "detail", id] as const,
  },
  categories: {
    all: ["categories"] as const,
  },
  products: {
    all: ["products"] as const,
    list: (q: string, page: number, pageSize: number) =>
      [...queryKeys.products.all, "list", q, page, pageSize] as const,
    search: (q: string) => [...queryKeys.products.all, "search", q] as const,
  },
  cashSessions: {
    all: ["cashSessions"] as const,
    current: () => [...queryKeys.cashSessions.all, "current"] as const,
    history: (limit: number) =>
      [...queryKeys.cashSessions.all, "history", limit] as const,
    zReport: (sessionId: number) =>
      [...queryKeys.cashSessions.all, "zReport", sessionId] as const,
  },
  reports: {
    category: (from: string, to: string) =>
      ["reports", "category", from, to] as const,
  },
};
