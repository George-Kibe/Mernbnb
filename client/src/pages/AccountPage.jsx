import React, { useContext } from 'react'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { UserContext } from '../UserContext'

const AccountPage = () => {
  const { user, logout } = useContext(UserContext);
  const navigate = useNavigate();

  // Leave the protected area first (synchronously), then clear the session,
  // so the auth guard doesn't bounce us to /login.
  const handleLogout = async () => {
    await navigate('/', { flushSync: true });
    logout();
    toast.success('Logged out successfully');
  };

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 p-6 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gray-900 text-2xl font-semibold uppercase text-white">{user.name?.[0] ?? '?'}</span>
      <h1 className="mt-3 text-xl font-semibold">{user.name}</h1>
      <p className="text-gray-600">{user.email}</p>
      <button type="button" onClick={handleLogout} className="primary mt-6 max-w-xs">Log out</button>
    </div>
  )
}

export default AccountPage
