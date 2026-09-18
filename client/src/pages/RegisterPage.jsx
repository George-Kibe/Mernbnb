import React, {useState} from 'react'
import toast, {Toaster} from "react-hot-toast"
import Header from '../components/Header'
import Footer from '../components/Footer'
import { Link } from 'react-router'
import axios from "axios"

const RegisterPage = () => {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const registerUser = async(e) => {
    e.preventDefault()
    setLoading(true)
    toast.success('Registering user...');
    try {
      const response = await axios.post("/users/register", {
        name,
        email,
        password
      })
      setName(""); setEmail(""); setPassword("")
      setLoading(false)
      toast.success("Registration Successful. You can now Login.")
    } catch (error) {
      setLoading(false)
      toast.error("Registration failed. Try Again or contact Admin!")
      //toast.error(error.message)
    }
  
  }

  return (
    <div className='p-4 flex flex-col min-h-screen'>
      <Toaster position="top-center" reverseOrder={false}></Toaster>
      <Header />
        <div className='mt-4 grow flex items-center justify-around'>
          <div className="mb-64">
            <h2 className='text-2xl text-center mb-4'>Register</h2>
            <form className='max-w-md mx-auto' onSubmit={registerUser}>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder='username'/>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@email.com" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder='password' />
              <button className='primary'>Register</button>
              <div className="text-center py-2 text-gray-500">
                Already a member? <Link className='text-black' to={"/login"}>Sign In</Link>
              </div>
            </form>
          </div>
        </div>
      <Footer />
    </div>
  )
}

export default RegisterPage;