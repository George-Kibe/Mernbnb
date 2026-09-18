import { Link } from "react-router";
import toast, {Toaster} from "react-hot-toast"
import Header from "../components/Header";
import Footer from "../components/Footer"
import { useState, useEffect } from "react";
import axios from "axios";
const IndexPage = () => {
  const [places, setPlaces] = useState([]);

  const getAllPlaces = async() => {
    try {
      const response = await axios.get("/places");
      //console.log(response)
      //setPlaces([...response.data, ...response.data, ...response.data]);
      setPlaces(response.data)
    } catch (error) {
      toast.error(error.message)
    }
  }

  useEffect(() => {
    getAllPlaces()
  }, [])
  //<div className='mt-4 grow flex-col items-center'>
  
  return (
    <div className='p-4 flex flex-col min-h-screen'>
      <Toaster position="top-center" reverseOrder={false}></Toaster>
      <Header />
      <div className='mt-8 gap-y-8 grow grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6'>
        {
          places.length > 0 && places.map(place => (
            <Link to={`/place/${place._id}`} key={place._id} className="">
              <div className=" " >
              {
                place.photos?.[0] && (
                  <img className="rounded-2xl aspect-square object-cover" src={place.photos[0]} alt="place photo" />
                 )
              }
              </div>
              <h2 className="text-sm truncate">{place.title}</h2>
              <h3 className="font-bold">{place.address}</h3>
              <div className="mt-1">
                <h2 className="font-bold">Kshs. {place.price}</h2>
              </div>
            </Link>
          ))
        }
      </div>
      <Footer />
    </div>
  )
}

export default IndexPage;
