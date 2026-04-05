import { useNavigate } from 'react-router-dom'
import StubPage from '../components/StubPage'

export default function WorkOrder() {
  const navigate = useNavigate()
  return <StubPage title="Create Work Order" onBack={() => navigate('/')} />
}
