import React, { useContext } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { UserContext } from '../UserContext'

// Routes for signed-in users. Others go to /login, which sends them back here.
const RequireAuth = () => {
  const { user } = useContext(UserContext);
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}`, reason: 'Please log in to continue.' }} />;
  }
  return <Outlet />;
}

export default RequireAuth
