import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LogoSpinner from './LogoSpinner'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) return <LogoSpinner full />

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}
