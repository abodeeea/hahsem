import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { AuthLayout } from '@/layouts/AuthLayout'
import { MainLayout } from '@/layouts/MainLayout'
import { PosLayout } from '@/layouts/PosLayout'
import { Spinner } from '@/components/ui/Spinner'

// تحميل كسول لكل صفحة (يحسّن سرعة الإقلاع خاصة على الجوال)
const L = <P extends object = any>(loader: () => Promise<any>, name = 'default') =>
  lazy<React.ComponentType<P>>(() => loader().then((m) => ({ default: name === 'default' ? m.default : m[name] })))

const LoginPage = L(() => import('@/features/auth/pages/LoginPage'))
const ForgotPasswordPage = L(() => import('@/features/auth/pages/ForgotPasswordPage'))
const DashboardPage = L(() => import('@/features/dashboard/pages/DashboardPage'))
const ProductsListPage = L(() => import('@/features/products/pages/ProductsListPage'))
const ProductFormPage = L(() => import('@/features/products/pages/ProductFormPage'))
const ProductMovementPage = L(() => import('@/features/products/pages/ProductMovementPage'))
const MainWarehousePage = L(() => import('@/features/inventory/pages/StockPage'), 'MainWarehousePage')
const BranchStockPage = L(() => import('@/features/inventory/pages/StockPage'), 'BranchStockPage')
const RequestsListPage = L(() => import('@/features/stock-requests/pages/RequestsListPage'))
const RequestFormPage = L(() => import('@/features/stock-requests/pages/RequestFormPage'))
const RequestDetailPage = L(() => import('@/features/stock-requests/pages/RequestDetailPage'))
const TransfersListPage = L(() => import('@/features/transfers/pages/TransfersListPage'))
const TransferDetailPage = L(() => import('@/features/transfers/pages/TransferDetailPage'))
const PurchasesListPage = L(() => import('@/features/purchases/pages/PurchasesListPage'))
const PurchaseFormPage = L(() => import('@/features/purchases/pages/PurchaseFormPage'))
const PosPage = L(() => import('@/features/pos/pages/PosPage'))
const InvoicesListPage = L(() => import('@/features/sales/pages/InvoicesListPage'))
const InvoiceDetailPage = L(() => import('@/features/sales/pages/InvoiceDetailPage'))
const ExpensesPage = L(() => import('@/features/expenses/pages/ExpensesPage'))
const ProfitLossPage = L(() => import('@/features/finance/pages/ProfitLossPage'))
const BranchAccountsPage = L(() => import('@/features/finance/pages/BranchAccountsPage'))
const NotificationsPage = L(() => import('@/features/notifications/pages/NotificationsPage'))
const Placeholder = L(() => import('@/features/common/pages/PlaceholderPage'))
const CategoriesPage = L(() => import('@/features/lookups/pages/LookupPages'), 'CategoriesPage')
const SuppliersPage = L(() => import('@/features/lookups/pages/LookupPages'), 'SuppliersPage')
const CustomersPage = L(() => import('@/features/lookups/pages/LookupPages'), 'CustomersPage')
const PaymentMethodsPage = L(() => import('@/features/lookups/pages/LookupPages'), 'PaymentMethodsPage')
const TaxesPage = L(() => import('@/features/lookups/pages/LookupPages'), 'TaxesPage')
const EmployeesPage = L(() => import('@/features/lookups/pages/LookupPages'), 'EmployeesPage')
const BranchesPage = L(() => import('@/features/lookups/pages/LookupPages'), 'BranchesPage')
const SettingsPage = L(() => import('@/features/admin/pages/SettingsPage'))
const UsersPage = L(() => import('@/features/admin/pages/UsersPage'))
const RolesPage = L(() => import('@/features/admin/pages/RolesPage'))
const AuditLogPage = L(() => import('@/features/admin/pages/AuditLogPage'))
const ShiftsPage = L(() => import('@/features/sales/pages/ShiftsPage'))
const ReturnsPage = L(() => import('@/features/sales/pages/ReturnsPage'))
const ExchangesPage = L(() => import('@/features/sales/pages/ExchangesPage'))
const OtherIncomePage = L(() => import('@/features/expenses/pages/OtherIncomePage'))
const StockCountsPage = L(() => import('@/features/inventory/pages/StockCountsPage'))
const DamagedItemsPage = L(() => import('@/features/inventory/pages/DamagedItemsPage'))
const PayrollPage = L(() => import('@/features/hr/pages/PayrollPage'))
const CommissionsPage = L(() => import('@/features/hr/pages/CommissionsPage'))
const ReportsPage = L(() => import('@/features/reports/pages/ReportsPage'))

const wrap = (el: JSX.Element) => <Suspense fallback={<Spinner />}>{el}</Suspense>

const router = createBrowserRouter([
  { element: <AuthLayout />, children: [
    { path: '/login', element: wrap(<LoginPage />) },
    { path: '/forgot-password', element: wrap(<ForgotPasswordPage />) },
  ] },

  // نقطة البيع (تخطيط مستقل بملء الشاشة)
  { element: <ProtectedRoute module="pos" />, children: [
    { element: <PosLayout />, children: [{ path: '/pos', element: wrap(<PosPage />) }] },
  ] },

  // باقي النظام داخل التخطيط الرئيسي
  { element: <ProtectedRoute />, children: [{ element: <MainLayout />, children: [
    { path: '/', element: <ProtectedRoute module="dashboard" />, children: [{ index: true, element: wrap(<DashboardPage />) }] },

    { element: <ProtectedRoute module="products" />, children: [
      { path: '/products', element: wrap(<ProductsListPage />) },
      { path: '/products/:id/movements', element: wrap(<ProductMovementPage />) },
    ] },
    { element: <ProtectedRoute module="products" action="create" />, children: [{ path: '/products/new', element: wrap(<ProductFormPage />) }] },
    { element: <ProtectedRoute module="products" action="update" />, children: [{ path: '/products/:id/edit', element: wrap(<ProductFormPage />) }] },
    { path: '/categories', element: <ProtectedRoute module="categories" />, children: [{ index: true, element: wrap(<CategoriesPage />) }] },

    { element: <ProtectedRoute module="inventory" />, children: [
      { path: '/inventory/main', element: wrap(<MainWarehousePage />) },
      { path: '/inventory/branches', element: wrap(<BranchStockPage />) },
    ] },
    { path: '/inventory/counts', element: <ProtectedRoute module="stock_counts" />, children: [{ index: true, element: wrap(<StockCountsPage />) }] },
    { path: '/inventory/damaged', element: <ProtectedRoute module="damaged" />, children: [{ index: true, element: wrap(<DamagedItemsPage />) }] },

    { element: <ProtectedRoute module="requests" />, children: [
      { path: '/requests', element: wrap(<RequestsListPage />) },
      { path: '/requests/new', element: wrap(<RequestFormPage />) },
      { path: '/requests/:id', element: wrap(<RequestDetailPage />) },
    ] },
    { element: <ProtectedRoute module="transfers" />, children: [
      { path: '/transfers', element: wrap(<TransfersListPage />) },
      { path: '/transfers/:id', element: wrap(<TransferDetailPage />) },
    ] },

    { path: '/suppliers', element: <ProtectedRoute module="suppliers" />, children: [{ index: true, element: wrap(<SuppliersPage />) }] },
    { element: <ProtectedRoute module="purchases" />, children: [
      { path: '/purchases', element: wrap(<PurchasesListPage />) },
      { path: '/purchases/new', element: wrap(<PurchaseFormPage />) },
    ] },

    { element: <ProtectedRoute module="sales" />, children: [
      { path: '/sales', element: wrap(<InvoicesListPage />) },
      { path: '/sales/:id', element: wrap(<InvoiceDetailPage />) },
    ] },
    { path: '/customers', element: <ProtectedRoute module="customers" />, children: [{ index: true, element: wrap(<CustomersPage />) }] },
    { path: '/returns', element: <ProtectedRoute module="returns" />, children: [{ index: true, element: wrap(<ReturnsPage />) }] },
    { path: '/exchanges', element: <ProtectedRoute module="exchanges" />, children: [{ index: true, element: wrap(<ExchangesPage />) }] },
    { path: '/shifts', element: <ProtectedRoute module="shifts" />, children: [{ index: true, element: wrap(<ShiftsPage />) }] },

    { path: '/expenses', element: <ProtectedRoute module="expenses" />, children: [{ index: true, element: wrap(<ExpensesPage />) }] },
    { path: '/other-income', element: <ProtectedRoute module="income" />, children: [{ index: true, element: wrap(<OtherIncomePage />) }] },
    { path: '/cashbox', element: <ProtectedRoute module="cashbox" />, children: [{ index: true, element: wrap(<PaymentMethodsPage />) }] },
    { path: '/branch-accounts', element: <ProtectedRoute module="branch_accounts" />, children: [{ index: true, element: wrap(<BranchAccountsPage />) }] },
    { path: '/taxes', element: <ProtectedRoute module="taxes" />, children: [{ index: true, element: wrap(<TaxesPage />) }] },
    { path: '/profit-loss', element: <ProtectedRoute module="profit_loss" />, children: [{ index: true, element: wrap(<ProfitLossPage />) }] },

    { path: '/employees', element: <ProtectedRoute module="employees" />, children: [{ index: true, element: wrap(<EmployeesPage />) }] },
    { path: '/payroll', element: <ProtectedRoute module="payroll" />, children: [{ index: true, element: wrap(<PayrollPage />) }] },
    { path: '/commissions', element: <ProtectedRoute module="commissions" />, children: [{ index: true, element: wrap(<CommissionsPage />) }] },
    { path: '/reports', element: <ProtectedRoute module="reports" />, children: [{ index: true, element: wrap(<ReportsPage />) }] },

    { path: '/branches', element: <ProtectedRoute module="branches" />, children: [{ index: true, element: wrap(<BranchesPage />) }] },
    { path: '/users', element: <ProtectedRoute module="users" />, children: [{ index: true, element: wrap(<UsersPage />) }] },
    { path: '/roles', element: <ProtectedRoute module="roles" />, children: [{ index: true, element: wrap(<RolesPage />) }] },
    { path: '/audit-log', element: <ProtectedRoute module="audit" />, children: [{ index: true, element: wrap(<AuditLogPage />) }] },
    { path: '/settings', element: <ProtectedRoute module="settings" />, children: [{ index: true, element: wrap(<SettingsPage />) }] },
    { path: '/notifications', element: wrap(<NotificationsPage />) },
  ] }] },

  { path: '*', element: <Navigate to="/" replace /> },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
