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
import PageNotFound from './pages/PageNotFound'
import PlacePage from './pages/PlacePage'
import ProfileLayout from './pages/ProfileLayout'
import AccountPage from './pages/AccountPage'
import BookingsPage from './pages/BookingsPage'
import BookingPage from './pages/BookingPage'
import MyPlacesPage from './pages/MyPlacesPage'
import PlaceFormPage from './pages/PlaceFormPage'

export const routes = [
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <IndexPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "place/:id", element: <PlacePage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: "profile",
            element: <ProfileLayout />,
            children: [
              { index: true, element: <AccountPage /> },
              { path: "bookings", element: <BookingsPage /> },
              { path: "bookings/:id", element: <BookingPage /> },
              { path: "places", element: <MyPlacesPage /> },
              { path: "places/new", element: <PlaceFormPage /> },
              { path: "places/:id", element: <PlaceFormPage /> },
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
