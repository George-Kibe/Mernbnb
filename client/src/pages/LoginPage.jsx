import React, { useContext, useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { Link } from 'react-router'
import axios from 'axios'
import toast, {Toaster} from "react-hot-toast"
import { Navigate } from 'react-router'
import { UserContext } from '../UserContext'

const LoginPage = () => {
  const {user, ready, setUser} = useContext(UserContext);
  console.log(user)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Redirect declaratively: setUser() renders before a transition-wrapped
  // navigate() commits, which would trip the "already logged in" branch.
  const [loggedIn, setLoggedIn] = useState(false)

  const handleLogin = async(e) => {
    e.preventDefault();
    toast.success("Loggin In")
    try {
      const response = await axios.post("/users/login", {email, password})
      //console.log(response)
      setUser(response.data.userDoc)
      const token = response.data.token;
      toast.success("Login successful")
      //console.log(token)
      localStorage.setItem("token", token)
      setLoggedIn(true)
    } catch (error) {
      toast.error("Login Failed. Try Again");
    }
  }
  if (loggedIn){
    return <Navigate to={"/"} />
  }
  if(!ready){
    return "Loading..."
  }
  if (ready && user){
    toast.error("You are already logged In!");
    return <Navigate to={"/profile"} />
  }
  
  return (
    <div className='p-4 flex flex-col min-h-screen'>
      <Toaster position="top-center" reverseOrder={false}></Toaster>
      <Header />
        <div className='mt-4 grow flex items-center justify-around'>
          <div className="mb-64">
            <h2 className='text-2xl text-center mb-4'>Login</h2>
            <form className='max-w-md mx-auto' onSubmit={handleLogin}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@email.com" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder='password' />
              <button className='primary'>Login</button>
              <div className="text-center py-2 text-gray-500">
                Don't have an account yet? <Link className='font-semibold text-gray-900 underline' to={"/register"}>Register Now</Link>
              </div>
            </form>
          </div>
        </div>
      <Footer />
    </div>
  )
}

export default LoginPage