import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/AuthContext'
import { Spinner } from '@/components/ui'
import AppLayout from '@/layouts/AppLayout'
import PublicLayout from '@/layouts/PublicLayout'
import Account from '@/pages/app/Account'
import CustomerDetail from '@/pages/app/CustomerDetail'
import Customers from '@/pages/app/Customers'
import Discounts from '@/pages/app/Discounts'
import { InvoiceDetail, InvoiceList } from '@/pages/app/Invoices'
import OrderDetail from '@/pages/app/OrderDetail'
import OrderNew from '@/pages/app/OrderNew'
import Orders from '@/pages/app/Orders'
import ProductForm from '@/pages/app/ProductForm'
import Products from '@/pages/app/Products'
import StorefrontSettings from '@/pages/app/StorefrontSettings'
import Payments from '@/pages/app/Payments'
import Wallet from '@/pages/app/Wallet'
import AppHome from '@/pages/app/AppHome'
import BusinessSettings from '@/pages/app/BusinessSettings'
import Dashboard from '@/pages/app/Dashboard'
import NewWorkspace from '@/pages/app/NewWorkspace'
import Team from '@/pages/app/Team'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import Invite from '@/pages/auth/Invite'
import ResetPassword from '@/pages/auth/ResetPassword'
import SignIn from '@/pages/auth/SignIn'
import SignUp from '@/pages/auth/SignUp'
import VerifyEmail from '@/pages/auth/VerifyEmail'
import Contact from '@/pages/public/Contact'
import Docs from '@/pages/public/Docs'
import Features from '@/pages/public/Features'
import HowItWorks from '@/pages/public/HowItWorks'
import Landing from '@/pages/public/Landing'
import Pricing from '@/pages/public/Pricing'
import CartPage from '@/pages/store/CartPage'
import CheckoutPage from '@/pages/store/CheckoutPage'
import OrderStatus from '@/pages/store/OrderStatus'
import ProductPage from '@/pages/store/ProductPage'
import PublicInvoice from '@/pages/store/PublicInvoice'
import StoreLayout from '@/pages/store/StoreLayout'
import StorePage from '@/pages/store/StorePage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import NotFound from '@/pages/NotFound'
import Assistant from '@/pages/app/Assistant'
import Insights from '@/pages/app/Insights'
import Inbox from '@/pages/app/Inbox'
import Knowledge from '@/pages/app/Knowledge'
import Notifications from '@/pages/app/Notifications'
import WorkflowEditor from '@/pages/app/WorkflowEditor'
import Workflows from '@/pages/app/Workflows'
import { SupportForm, SupportThread } from '@/pages/store/Support'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner label="Loading" />
  if (!user) return <Navigate to="/signin" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="features" element={<Features />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="docs" element={<Docs />} />
          <Route path="contact" element={<Contact />} />
        </Route>

        <Route path="signin" element={<SignIn />} />
        <Route path="signup" element={<SignUp />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="invite" element={<Invite />} />

        <Route path="s/:slug" element={<StoreLayout />}>
          <Route index element={<StorePage />} />
          <Route path="p/:pid" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="support" element={<SupportForm />} />
        </Route>
        <Route path="order/:oid" element={<OrderStatus />} />
        <Route path="support/:pid" element={<SupportThread />} />
        <Route path="i/:pubid" element={<PublicInvoice />} />

        <Route path="app" element={<AppHome />} />
        <Route
          path="app/new"
          element={
            <RequireAuth>
              <NewWorkspace />
            </RequireAuth>
          }
        />
        <Route
          path="app/:wid"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:pid" element={<ProductForm />} />
          <Route path="discounts" element={<Discounts />} />
          <Route path="storefront" element={<StorefrontSettings />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/new" element={<OrderNew />} />
          <Route path="orders/:oid" element={<OrderDetail />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:cid" element={<CustomerDetail />} />
          <Route path="invoices" element={<InvoiceList />} />
          <Route path="invoices/:vid" element={<InvoiceDetail />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="inbox/:cid" element={<Inbox />} />
          <Route path="workflows" element={<Workflows />} />
          <Route path="workflows/:fid" element={<WorkflowEditor />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="insights" element={<Insights />} />
          <Route path="payments" element={<Payments />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="team" element={<Team />} />
          <Route path="settings" element={<BusinessSettings />} />
          <Route path="account" element={<Account />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      </ErrorBoundary>
    </AuthProvider>
  )
}
