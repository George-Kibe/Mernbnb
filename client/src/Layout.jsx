import React from 'react'
import { Outlet } from 'react-router'
import { Toaster } from 'react-hot-toast'
import Footer from './components/Footer'
import Header from './components/Header'

// Shared page shell: navbar, page content, footer and one toast container.
const Layout = () => (
  <div className="flex min-h-screen flex-col p-4">
    <Header />
    <main id="main" className="grow">
      <Outlet />
    </main>
    <Footer />
    <Toaster position="top-center" />
  </div>
)

export default Layout
