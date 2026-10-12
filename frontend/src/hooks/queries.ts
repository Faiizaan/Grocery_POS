import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJson, postJson } from "../lib/apiJson";
import { queryKeys } from "../lib/queryKeys";
import type { Role } from "../store/auth";

// —— Sales ——

export type SalesListRow = {
  id: number;
  invoiceCode: string;
  createdAt: string;
  subtotal: string;
  discountValue: string;
  taxTotal: string;
  total: string;
  itemCount: number;
  voidedAt: string | null;
  voidedByEmail: string | null;
};

export type SalesListResponse = {
  page: number;
  limit: number;
  totalCount: number;
  rows: SalesListRow[];
};

export function useSalesListQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.sales.list(page, pageSize),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      return getJson<SalesListResponse>(`/api/sales-all?${params}`);
    },
    // Keep prior page's totalCount while fetching so pagination doesn't snap back to page 1
    placeholderData: (previousData) => previousData,
  });
}

export function useSaleQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.detail(id),
    queryFn: () => getJson<Record<string, unknown>>(`/api/sales/${id}`),
    enabled: !!id,
  });
}

export type SalesSummaryData = {
  from: string;
  to: string;
  invoices: number;
  totalSales: number;
  totalCost: number;
  profit: number;
  profitMargin: number;
};

export function useSalesSummaryQuery(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.sales.summary(from, to),
    queryFn: () => {
      const params = new URLSearchParams({ from, to });
      return getJson<SalesSummaryData>(`/api/sales-summary?${params}`);
    },
    enabled: enabled && !!from && !!to,
  });
}

export function useVoidSaleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      saleId,
      confirmPassword,
    }: {
      saleId: number;
      confirmPassword: string;
    }) =>
      postJson<{ ok: boolean }>(`/api/sales/${saleId}/void`, {
        confirmPassword,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
    },
  });
}

// —— Users ——

export type UserRow = {
  id: number;
  email: string;
  role: Role;
  createdAt: string;
};

export function useUsersQuery() {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: () => getJson<UserRow[]>("/api/users"),
  });
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; role: Role }) =>
      postJson<UserRow>("/api/users", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

// —— Purchases ——

export type PurchaseListRow = {
  id: number;
  createdAt: string;
  subtotal?: string;
  discountValue?: string;
  taxTotal?: string;
  total: string;
  supplier?: { name: string } | null;
};

export type PaginatedResponse<T> = {
  page: number;
  limit: number;
  totalCount: number;
  rows: T[];
};

export function usePurchasesListQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.purchases.list(page, pageSize),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      return getJson<PaginatedResponse<PurchaseListRow>>(
        `/api/purchases?${params}`
      );
    },
  });
}

export function usePurchaseQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.purchases.detail(id),
    queryFn: () => getJson<Record<string, unknown>>(`/api/purchases/${id}`),
    enabled: !!id,
  });
}

// —— Categories & products ——

export type Category = { id: number; name: string };

export function useCategoriesQuery() {
  return useQuery({
    queryKey: queryKeys.categories.all,
    queryFn: () => getJson<Category[]>("/api/categories"),
  });
}

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      postJson<Category>("/api/categories", { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.categories.all,
      });
    },
  });
}

export type ProductSearchHit = {
  id: number;
  name: string;
  sku: string;
  barcode?: string | null;
  salePrice: string;
  taxRate: string;
  stock: string;
  categoryId?: number | null;
  categoryRef?: { id: number; name: string } | null;
};

export type SupplierRow = {
  id: number;
  name: string;
  phone?: string | null;
  createdAt: string;
};

export type SupplierOption = { id: number; name: string };

export type SupplierDetailProduct = {
  productId: number;
  name: string;
  sku: string;
  barcode: string | null;
  supplierUnitCost: string;
  latestProductCost: string;
  salePrice: string;
  stock: string;
  lastPurchasedAt: string;
};

export function useSuppliersQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["suppliers", "list", page, pageSize] as const,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      return getJson<PaginatedResponse<SupplierRow>>(
        `/api/suppliers?${params}`
      );
    },
  });
}

export function useSupplierOptionsQuery() {
  return useQuery({
    queryKey: ["suppliers", "options"] as const,
    queryFn: () => getJson<SupplierOption[]>("/api/suppliers/options"),
  });
}

export function useSupplierDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["suppliers", "detail", id] as const,
    queryFn: () =>
      getJson<{
        supplier: SupplierRow;
        products: SupplierDetailProduct[];
      }>(`/api/suppliers/${id}`),
    enabled: !!id,
  });
}

export function useCreateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; phone?: string }) =>
      postJson<SupplierRow>("/api/suppliers", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export function useProductSearchQuery(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: queryKeys.products.search(trimmed),
    queryFn: () =>
      getJson<ProductSearchHit[]>(
        `/api/products/search?q=${encodeURIComponent(trimmed)}`
      ),
    enabled: trimmed.length > 0,
  });
}

export type ProductListRow = ProductSearchHit & {
  price: string;
};

export function useProductsListQuery(
  q: string,
  page: number,
  pageSize: number
) {
  return useQuery({
    queryKey: queryKeys.products.list(q, page, pageSize),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      return getJson<PaginatedResponse<ProductListRow>>(
        `/api/products?${params}`
      );
    },
  });
}

// —— Cash sessions ——

export type CashSessionCurrentResponse = {
  session: { id: number } | null;
  zReport: Record<string, unknown> | null;
};

export function useCashSessionCurrentQuery() {
  return useQuery({
    queryKey: queryKeys.cashSessions.current(),
    queryFn: () => getJson<CashSessionCurrentResponse>("/api/cash-sessions/current"),
  });
}

export type CashSessionRow = {
  id: number;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  closingCash: string | null;
  user: { id: number; email: string };
};

export function useCashSessionHistoryQuery(limit = 15) {
  return useQuery({
    queryKey: queryKeys.cashSessions.history(limit),
    queryFn: () =>
      getJson<{ rows: CashSessionRow[] }>(
        `/api/cash-sessions?limit=${limit}`
      ).then((r) => r.rows ?? []),
  });
}

export function useOpenCashSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (openingFloat: string) =>
      postJson<{ zReport: Record<string, unknown> }>("/api/cash-sessions/open", {
        openingFloat,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.cashSessions.all,
      });
    },
  });
}

export function useCloseCashSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      closingCash,
    }: {
      sessionId: number;
      closingCash: string;
    }) =>
      postJson<{ zReport: Record<string, unknown> }>(
        `/api/cash-sessions/${sessionId}/close`,
        { closingCash }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.cashSessions.all,
      });
    },
  });
}

export function useCreateSaleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      postJson<{ ok: boolean; sale: { id: number } }>("/api/sales", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.cashSessions.all,
      });
    },
  });
}

// —— Reports ——

export type CategoryReportRow = {
  categoryId: number | null;
  category: string;
  qty: number;
  revenue: number;
  tax: number;
};

export type PurchaseOrderRow = {
  id: number;
  createdAt: string;
  daysLookback: number;
  status: string;
  note?: string | null;
  supplier: { id: number; name: string };
  items: {
    id: number;
    suggestedQty: string;
    currentStock: string;
    recentSales: string;
    product: { id: number; name: string; sku: string };
  }[];
};

export function usePurchaseOrdersListQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["purchaseOrders", "list", page, pageSize] as const,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      return getJson<PaginatedResponse<PurchaseOrderRow>>(
        `/api/purchase-orders?${params}`
      );
    },
  });
}

export function usePurchaseOrderQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["purchaseOrders", "detail", id] as const,
    queryFn: () => getJson<PurchaseOrderRow>(`/api/purchase-orders/${id}`),
    enabled: !!id,
  });
}

export type CategoryDetailProduct = {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  price: string;
  salePrice: string;
  stock: string;
};

export function useCategoryDetailQuery(
  id: string | undefined,
  q: string,
  page: number,
  pageSize: number
) {
  return useQuery({
    queryKey: ["categories", "detail", id, q, page, pageSize] as const,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      return getJson<{
        category: Category;
        page: number;
        limit: number;
        totalCount: number;
        products: CategoryDetailProduct[];
      }>(`/api/categories/${id}?${params}`);
    },
    enabled: !!id,
  });
}

export type CategoryReportResponse = {
  from: string;
  to: string;
  rows: CategoryReportRow[];
};

export function useCategoryReportQuery(
  from: string,
  to: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: queryKeys.reports.category(from, to),
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return getJson<CategoryReportResponse>(
        `/api/reports/category?${params}`
      );
    },
    enabled,
  });
}
