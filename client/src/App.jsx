import React from 'react'
import { createBrowserRouter } from "react-router"
// The DOM RouterProvider supplies ReactDOM.flushSync, which navigate(to, { flushSync: true }) needs.
import { RouterProvider } from "react-router/dom"
import { UserContextProvider } from './UserContext'
import axios from 'axios'
// Defaults to the same-origin /api (Vite proxies it in dev; Vercel rewrites it).
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || "/api"
// Send the login token so protected endpoints (photo uploads) know the user.
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
//continue from 5:03:01
//pages
import IndexPage from "./pages/IndexPage";
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PageNotFound from './pages/PageNotFound';
import ProfilePage from './pages/ProfilePage'
import PlacePage from './pages/PlacePage'

const router = createBrowserRouter([
  { path:"/", element: <IndexPage/> },
  { path:"/login", element: <LoginPage/> },
  { path:"/register", element: <RegisterPage/> },
  { path:"/profile/:subpage?", element: <ProfilePage/> },
  { path:"/profile/:subpage/:actionOrId", element: <ProfilePage/> },
  { path:"/place/:id", element: <PlacePage/> },

  { path:"*", element: <PageNotFound/> },
])

const App = () => {
  return (
    <UserContextProvider>
      <main>
        <RouterProvider router={router}></RouterProvider>
      </main>
    </UserContextProvider>
  )
}

export default App