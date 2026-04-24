import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewInspection from './pages/NewInspection'
import InspectionRooms from './pages/InspectionRooms'
import InspectionSummary from './pages/InspectionSummary'
import InspectionOutdoor from './pages/InspectionOutdoor'
import InspectionMode from './pages/InspectionMode'
import InspectionIndoor from './pages/InspectionIndoor'
import InspectionAppliances from './pages/InspectionAppliances'
import InspectionApplianceReport from './pages/InspectionApplianceReport'
import Estimate from './pages/Estimate'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import PropertyBin from './pages/PropertyBin'
import RateCard from './pages/RateCard'
import ExploreInventory from './pages/inventory/ExploreInventory'
import RegisterInventory from './pages/inventory/RegisterInventory'
import InventoryDashboard from './pages/inventory/InventoryDashboard'
import LogUsage from './pages/inventory/LogUsage'
import PublicRateCard from './pages/inventory/PublicRateCard'
import PurchaseHistory from './pages/inventory/PurchaseHistory'
import WorkOrder from './pages/WorkOrder'
import ResetPassword from './pages/ResetPassword'
import Signup from './pages/Signup'
import Flentfit from './pages/Flentfit'
import SOPs from './pages/SOPs'
import SOPSetup from './pages/SOPSetup'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspections/new"
            element={
              <ProtectedRoute>
                <NewInspection />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspections/mode"
            element={
              <ProtectedRoute>
                <InspectionMode />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspections/indoor"
            element={
              <ProtectedRoute>
                <InspectionIndoor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspections/outdoor"
            element={
              <ProtectedRoute>
                <InspectionOutdoor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspections/appliances"
            element={
              <ProtectedRoute>
                <InspectionAppliances />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspections/appliance-report"
            element={
              <ProtectedRoute>
                <InspectionApplianceReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspections/rooms"
            element={
              <ProtectedRoute>
                <InspectionRooms />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspections/summary"
            element={
              <ProtectedRoute>
                <InspectionSummary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/estimate/:id"
            element={
              <ProtectedRoute>
                <Estimate />
              </ProtectedRoute>
            }
          />
          <Route
            path="/properties"
            element={
              <ProtectedRoute>
                <Properties />
              </ProtectedRoute>
            }
          />
          <Route
            path="/properties/bin"
            element={
              <ProtectedRoute>
                <PropertyBin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/properties/:pid"
            element={
              <ProtectedRoute>
                <PropertyDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rate-card"
            element={
              <ProtectedRoute>
                <RateCard />
              </ProtectedRoute>
            }
          />
          <Route path="/inventory" element={<ProtectedRoute><ExploreInventory /></ProtectedRoute>} />
          <Route path="/inventory/register" element={<ProtectedRoute><RegisterInventory /></ProtectedRoute>} />
          <Route path="/inventory/dashboard" element={<ProtectedRoute><InventoryDashboard /></ProtectedRoute>} />
          <Route path="/inventory/usage" element={<ProtectedRoute><LogUsage /></ProtectedRoute>} />
          <Route path="/inventory/public-rc" element={<PublicRateCard />} />
          <Route path="/inventory/history" element={<ProtectedRoute><PurchaseHistory /></ProtectedRoute>} />
          <Route
            path="/work-order"
            element={
              <ProtectedRoute>
                <WorkOrder />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flentfit"
            element={
              <ProtectedRoute>
                <Flentfit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sops"
            element={
              <ProtectedRoute>
                <SOPs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sops/setup"
            element={
              <ProtectedRoute>
                <SOPSetup />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
