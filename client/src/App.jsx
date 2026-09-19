/* eslint-disable react-refresh/only-export-components -- exports the route table for tests */
import React from 'react'
import { createBrowserRouter } from "react-router"
// The DOM RouterProvider supplies ReactDOM.flushSync, which navigate(to, { flushSync: true }) needs.
import { RouterProvider } from "react-router/dom"
import { UserContextProvider } from './UserContext'
import Layout from './Layout'
import RequireAuth from './components/RequireAuth'
import ErrorPage from './pages/ErrorPage'
import IndexPage from "./pages/IndexPage"
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import PageNotFound from './pages/PageNotFound'
import PlacePage from './pages/PlacePage'
import StaysPage from './pages/StaysPage'

// The signed-in area loads on demand, so guests and search engines download
// less JavaScript.
const lazyPage = (load) => async () => ({ Component: (await load()).default });

export const routes = [
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <IndexPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "place/:id", element: <PlacePage /> },
      { path: "stays/:slug", element: <StaysPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: "profile",
            lazy: lazyPage(() => import('./pages/ProfileLayout')),
            children: [
              { index: true, lazy: lazyPage(() => import('./pages/AccountPage')) },
              { path: "bookings", lazy: lazyPage(() => import('./pages/BookingsPage')) },
              { path: "bookings/:id", lazy: lazyPage(() => import('./pages/BookingPage')) },
              { path: "places", lazy: lazyPage(() => import('./pages/MyPlacesPage')) },
              { path: "places/new", lazy: lazyPage(() => import('./pages/PlaceFormPage')) },
              { path: "places/:id", lazy: lazyPage(() => import('./pages/PlaceFormPage')) },
            ],
          },
        ],
      },
      { path: "*", element: <PageNotFound /> },
    ],
  },
];

const router = createBrowserRouter(routes);

const App = () => (
  <UserContextProvider>
    <RouterProvider router={router} />
  </UserContextProvider>
)

export default App
