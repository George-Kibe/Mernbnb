import { useState, useEffect, createContext } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode"

export const UserContext = createContext({});

export const UserContextProvider = ({children}) => {
    const [user, setUser] = useState(null)
    const [ready, setReady] = useState(false)
    const token = localStorage.getItem("token")
    
    useEffect(() => {      
      if (token){
        const decoded = jwtDecode(token);
        setUser(decoded)
        setReady(true)
      }else{
        setReady(true)
      }
    }, [token])   

    return (
        <UserContext.Provider value={{user, setUser, ready}}>
            {children}
        </UserContext.Provider>
    )
}