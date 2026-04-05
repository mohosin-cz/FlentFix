import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}

const styles = {
  loading: {
    minHeight: '100svh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F7F8FC',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid #E8E4FF',
    borderTopColor: '#5B4FE8',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
}
