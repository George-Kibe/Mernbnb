import axios from 'axios';
import React, { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import Perks from '../components/Perks';
import MyPlacesPage from './MyPlacesPage';

const PlacesPage = ({toast, ownerId}) => {
  const navigate = useNavigate();
  const {actionOrId} = useParams();
  //states
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [addedPhotos, setAddedPhotos] = useState([])
  const [photoLink, setPhotoLink] = useState('')
  const [description, setDescription] = useState('')
  const [perks, setPerks] = useState([])
  const [extraInfo, setExtraInfo] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState("")
  const [maxGuests, setMaxGuests] = useState(1)
  const [price, setPrice] = useState(0)
  const [uploading, setUploading] = useState(false)

  const addPhotoByLink = async(e) => {
    e.preventDefault()
    toast.success("Uploading image", { autoClose: 5000,})
    try {
        const response = await axios.post("/upload-by-link", {link:photoLink})
        //console.log(response.status)
        toast.success("adding photo")
        const {data:filename} = response;
        setAddedPhotos(prev => {
            //console.log(prev)
            return prev? [...prev, filename] : [filename]
        });
        toast.success("Photo uploaded successfully")
        setPhotoLink("")
    } catch (error) {
        console.log(error)
        toast.error("File upload failed! Try Again")
    }
  }

  const uploadPhoto = async(e) => {
    const files = e.target.files;
    //console.log(files[0])
    toast.success("Uploading image(s)", { autoClose: 5000,})
    const data = new FormData();
    for (let i = 0; i < files.length; i++) {
        data.append("photos", files[i]);        
    }
    try {
        const response = await axios.post('/upload', data, {
            headers: {'Content-Type':'multipart/form-data'}
        })
        const {data:filenames} = response;
        console.log(response.data)
        setAddedPhotos(prev => {
            return prev? [...prev, ...filenames] : [...filenames]
        });
        toast.success("Photo(s) uploaded successfully")
    } catch (error) {
        toast.error(error.message)
    }
  }

  const savePlace = async(e) => {
    e.preventDefault()
    if (!ownerId || !title || !address || !addedPhotos || !description || 
      !perks || !extraInfo || !checkIn || !checkOut || !maxGuests ||!price){
        toast.error("Missing data. Check all your Input Fields!");
        return;
    }
    const data = {owner:ownerId, title, address, photos:addedPhotos, description, perks, 
      extraInfo, checkIn, checkOut, maxGuests, price }
    const setStatesNull = ()=> {
      setTitle(""); setAddress(""); setAddedPhotos(null); setDescription(""); setPerks(null); setExtraInfo("");
      setCheckIn(""); setCheckOut(""); setMaxGuests(1); setPrice(0)
    }
    //create a new place
    if (actionOrId === "new") {
      toast.success("Creating new place...")
      try {
        const response = await axios.post("/places", data)
        console.log(response);
        if (response.status === 201){
            toast.success("Place created successfully!")
            navigate("/profile/places")
            setStatesNull()
        }        
      } catch (error) {
        toast.error(error.message)
      }
    } else {
      toast.success("updating place...")
      try {
        const response = await axios.put(`/places/${actionOrId}/${ownerId}`, data)
        console.log(response);
        if (response.status === 201){
            toast.success("Place Updated successfully!")
            navigate("/profile/places")
            setStatesNull()
        }        
      } catch (error) {
        toast.error(error.message)
      }
    }
    
  }
  const getPlace = async() => {
    try {
      const response = await axios.get(`places/place/${actionOrId}`);
      const {data} =response;
      setTitle(data.title); setAddress(data.address); setAddedPhotos(data.photos); setDescription(data.description);
      setPerks(data.perks); setExtraInfo(data.extraInfo); setCheckIn(data.checkIn); setCheckOut(data.checkOut); 
      setMaxGuests(data.maxGuests); setPrice(data.price)
    } catch (error) {
      toast.error("Fetching Place error!")
    }
  }

  useEffect(() => {
    if (!actionOrId || actionOrId === "new"){
      setTitle(""); setAddress(""); setAddedPhotos(null); setDescription(""); setPerks(null); 
      setExtraInfo(""); setCheckIn(""); setCheckOut(""); setMaxGuests(1); setPrice(0)
      return
    }
    getPlace()
    
  }, [actionOrId])

  const removePhoto = (e, link) => {
    e.preventDefault()
    setAddedPhotos([...addedPhotos.filter(photo => photo !== link)])
  }

  const setFavoritePhoto = (e, link) => {
    e.preventDefault()
    const otherPhotos = [...addedPhotos.filter(photo => photo !== link)];
    const newAddedPhotos =[link, ...otherPhotos];
    setAddedPhotos(newAddedPhotos);
  }
  
  //console.log(addedPhotos)
  return (
    <div>        
        {            
          !actionOrId  && (
           <MyPlacesPage toast={toast} ownerId={ownerId} />
          )
        }
        {
          actionOrId && (
            <div>
              <form action="">
                <h2 className="text-2xl mt-4">Title</h2>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder='title eg: My Lovely Apartment' />
                <h2 className="text-2xl mt-4">Address</h2>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder='address' />
                <h2 className="text-2xl mt-4">Photos</h2>
                <div className='flex gap-2'> 
                  <input value={photoLink} onChange={e => setPhotoLink(e.target.value)} type="text" placeholder='Add Using a link ...jpg' />
                  <button onClick={addPhotoByLink} className="bg-gray-200 px-4 rounded-2xl">Add&nbsp;Photo</button>
                </div>
                <div className='mt-2 gap-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4'>
                  {
                    addedPhotos?.length > 0 && addedPhotos.map(link => (
                      <div className='h-80 flex relative' key={link}>
                        <img className='rounded-2xl w-full object-cover' src={link} alt="" />
                        <button onClick={(e) => removePhoto(e, link)} className="absolute bottom-1 right-1 text-white bg-black/50 rounded-2xl p-2">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                        <button onClick={(e) => setFavoritePhoto(e, link)} className="absolute bottom-1 left-1 text-white bg-black/50 rounded-2xl p-2">
                          {
                            link === addedPhotos[0] ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                              </svg>
                            ):(
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                              </svg>
                            )
                          }
                          
                        </button>
                      </div>
                    ))
                  }
                  <label className="h-80 cursor-pointer p-4 flex gap-1 justify-center border bg-transparent items-center rounded-2xl text-2xl text-gray-600">
                    <input type="file" multiple className='hidden' onChange={uploadPhoto} />
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                    Upload
                  </label>
                </div>
                <h2 className="text-2xl mt-4">Description</h2>
                <textarea value={description} onChange={e => setDescription(e.target.value)} className='' name="description" id="" rows="5" />
                <h2 className="text-2xl mt-4">Perks</h2>
                <Perks selected={perks} onChange={setPerks} />
                <h2 className="text-2xl mt-4">Extra Information</h2>
                <textarea value={extraInfo} onChange={e => setExtraInfo(e.target.value)} className='' name="description" id="" rows="5" />
                <h2 className="text-2xl mt-4">Check in&out Times</h2>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <h3 className="m2-2 -mb-1">Check In Time</h3>
                    <input value={checkIn} onChange={e => setCheckIn(e.target.value)} type="time" placeholder='14:00' />
                  </div>
                  <div>
                    <h3 className="m2-2 -mb-1">Check Out Time</h3>
                    <input value={checkOut} onChange={e => setCheckOut(e.target.value)} type="time" placeholder='14:00' />
                  </div>
                  <div>
                    <h3 className="m2-2 -mb-1">Maximum Number of Guests</h3>
                    <input value={maxGuests} onChange={e => setMaxGuests(e.target.value)} type="number" placeholder='0' />
                  </div>
                  <div>
                    <h3 className="m2-2 -mb-1">Price</h3>
                    <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder='0' />
                  </div>
                </div>
                <button onClick={savePlace} className="primary my-4">Save Place</button>
             </form>
            </div>
          )
        }           
    </div>
  )
}

export default PlacesPage