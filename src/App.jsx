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
import Estimate from './pages/Estimate'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import RateCard from './pages/RateCard'
import WorkOrder from './pages/WorkOrder'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
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
            path="/inspections/outdoor"
            element={
              <ProtectedRoute>
                <InspectionOutdoor />
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
          <Route
            path="/work-order"
            element={
              <ProtectedRoute>
                <WorkOrder />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
