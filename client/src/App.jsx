import React from 'react'
import {createBrowserRouter,RouterProvider} from "react-router"
import { UserContextProvider } from './UserContext'
import axios from 'axios'
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL
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