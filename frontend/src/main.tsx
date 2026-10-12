import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./app";
import { queryClient } from "./lib/queryClient";
import "./style.css";
import ProtectedRoute from "./components/ProtectedRoute";
import ManagerRoute from "./components/ManagerRoute";
import AdminRoute from "./components/AdminRoute";
import Login from "./pages/Login";
import Users from "./pages/Users";

import POSRegister from "./pages/POSRegister";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import PurchaseNew from "./pages/PurchaseNew";
import PurchasesList from "./pages/PurchasesList";
import ReportCategory from "./pages/ReportCategory";
import PurchaseOrder from "./pages/PurchaseOrder";
import PurchaseShow from "./pages/PurchaseShow";
import InventoryLog from "./pages/InventoryLog";
import Inventory from "./pages/Inventory";
import SalesSummary from "./pages/SalesSummary";
import CashSession from "./pages/CashSession";
import SalesList from "./pages/SalesList";
import SaleInvoice from "./pages/SaleInvoice";
import ProductDetails from "./pages/ProductDetails";
import Suppliers from "./pages/Suppliers";
import SupplierDetail from "./pages/SupplierDetail";
import Categories from "./pages/Categories";
import CategoryDetail from "./pages/CategoryDetail";
import PurchaseOrderShow from "./pages/PurchaseOrderShow";
import { installNumberInputArrowStep } from "./lib/numberInputArrowStep";

installNumberInputArrowStep();

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Sales /> },
      { path: "cash-session", element: <CashSession /> },
      { path: "sales/list", element: <SalesList /> },
      { path: "sales/:id", element: <SaleInvoice /> },
      {
        path: "products",
        element: (
          <ManagerRoute>
            <Products />
          </ManagerRoute>
        ),
      },
      {
        path: "products/:id",
        element: (
          <ManagerRoute>
            <ProductDetails />
          </ManagerRoute>
        ),
      },
      {
        path: "register",
        element: (
          <ManagerRoute>
            <POSRegister />
          </ManagerRoute>
        ),
      },
      {
        path: "purchase",
        element: (
          <ManagerRoute>
            <PurchaseNew />
          </ManagerRoute>
        ),
      },
      {
        path: "purchases",
        element: (
          <ManagerRoute>
            <PurchasesList />
          </ManagerRoute>
        ),
      },
      {
        path: "purchases/:id",
        element: (
          <ManagerRoute>
            <PurchaseShow />
          </ManagerRoute>
        ),
      },
      {
        path: "reports/category",
        element: (
          <ManagerRoute>
            <ReportCategory />
          </ManagerRoute>
        ),
      },
      {
        path: "purchase-order",
        element: (
          <ManagerRoute>
            <PurchaseOrder />
          </ManagerRoute>
        ),
      },
      {
        path: "purchase-order/:id",
        element: (
          <ManagerRoute>
            <PurchaseOrderShow />
          </ManagerRoute>
        ),
      },
      {
        path: "categories",
        element: (
          <ManagerRoute>
            <Categories />
          </ManagerRoute>
        ),
      },
      {
        path: "categories/:id",
        element: (
          <ManagerRoute>
            <CategoryDetail />
          </ManagerRoute>
        ),
      },
      {
        path: "inventory-log",
        element: (
          <ManagerRoute>
            <InventoryLog />
          </ManagerRoute>
        ),
      },
      {
        path: "inventory",
        element: (
          <ManagerRoute>
            <Inventory />
          </ManagerRoute>
        ),
      },
      {
        path: "sales/summary",
        element: (
          <ManagerRoute>
            <SalesSummary />
          </ManagerRoute>
        ),
      },
      {
        path: "suppliers",
        element: (
          <ManagerRoute>
            <Suppliers />
          </ManagerRoute>
        ),
      },
      {
        path: "suppliers/:id",
        element: (
          <ManagerRoute>
            <SupplierDetail />
          </ManagerRoute>
        ),
      },
      {
        path: "users",
        element: (
          <AdminRoute>
            <Users />
          </AdminRoute>
        ),
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
