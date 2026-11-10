import { Routes, Route } from 'react-router'
import AppLayout from './components/AppLayout'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import BankImport from './pages/BankImport'
import Invoices from './pages/Invoices'
import Expenses from './pages/Expenses'
import Reports from './pages/Reports'
import SettingsPage from './pages/SettingsPage'

function guarded(node: React.ReactNode) {
  return <AppLayout>{node}</AppLayout>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={guarded(<Dashboard />)} />
      <Route path="/transactions" element={guarded(<Transactions />)} />
      <Route path="/import" element={guarded(<BankImport />)} />
      <Route path="/import/:batchId" element={guarded(<BankImport />)} />
      <Route path="/invoices" element={guarded(<Invoices />)} />
      <Route path="/expenses" element={guarded(<Expenses />)} />
      <Route path="/reports" element={guarded(<Reports />)} />
      <Route path="/settings" element={guarded(<SettingsPage />)} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
