import { useNavigate } from 'react-router-dom'
import StubPage from '../components/StubPage'

export default function RateCard() {
  const navigate = useNavigate()
  return <StubPage title="Rate Card" onBack={() => navigate('/')} />
}
