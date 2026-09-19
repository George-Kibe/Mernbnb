import React, { useCallback, useEffect, useRef, useState } from 'react'
import UploadedPhoto from './UploadedPhoto'
import {
  ACCEPTED_PHOTO_TYPES, MIN_RECOMMENDED_PHOTOS, addPhotoByLink, errorMessage, photoProblem, uploadPhotos,
} from '../../lib/photos'

const moveItem = (list, from, to) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Airbnb-style photo step for the listing form.
// `photos` is the array of photo URLs; `onChange` is its state setter (it is
// called with updater functions). `onUploadingChange(bool)` reports whether
// uploads are still in flight so the form can hold off saving.
const PhotoUploader = ({ photos, onChange, toast, onUploadingChange }) => {
  const list = photos ?? [];
  const fileInput = useRef(null);
  const menuRef = useRef(null);
  const nextPendingId = useRef(0);
  const [pending, setPending] = useState([]); // { id, preview, progress }
  const [menuFor, setMenuFor] = useState(null); // photo URL whose menu is open
  // Index of the photo being dragged: a ref for the drop logic (drag events can
  // outrun re-renders), state for the faded styling.
  const dragFrom = useRef(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dropActive, setDropActive] = useState(false); // files dragged over
  const [link, setLink] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  // url -> blob URL of the file the host picked, so new photos show instantly.
  const localPreviews = useRef(new Map());
  // Uploaded photos whose stored copy can't be displayed (guests won't see them).
  const [unviewable, setUnviewable] = useState(() => new Set());

  useEffect(() => () => {
    localPreviews.current.forEach((preview) => URL.revokeObjectURL(preview));
  }, []);

  const onRemoteStatus = useCallback((url, ok) => {
    setUnviewable((prev) => {
      if (ok === !prev.has(url)) return prev;
      const next = new Set(prev);
      if (ok) next.delete(url); else next.add(url);
      return next;
    });
  }, []);

  useEffect(() => {
    onUploadingChange?.(pending.length > 0 || addingLink);
  }, [pending.length, addingLink, onUploadingChange]);

  useEffect(() => {
    if (menuFor === null) return;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !menuRef.current?.contains(e.target)) setMenuFor(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuFor]);

  const handleFiles = async (fileList) => {
    const files = [];
    for (const file of fileList) {
      const problem = photoProblem(file);
      if (problem) toast.error(problem);
      else files.push(file);
    }
    if (files.length === 0) return;

    const items = files.map((file) => ({
      id: nextPendingId.current++,
      preview: URL.createObjectURL(file),
      progress: 0,
    }));
    setPending((prev) => [...prev, ...items]);

    const results = await uploadPhotos(files, (i, progress) =>
      setPending((prev) => prev.map((item) => (item.id === items[i].id ? { ...item, progress } : item)))
    );

    // Keep the local preview of each uploaded file; drop the failed ones.
    results.forEach((result, i) => {
      if (result.url) localPreviews.current.set(result.url, items[i].preview);
      else URL.revokeObjectURL(items[i].preview);
    });
    const urls = results.filter((r) => r.url).map((r) => r.url);
    if (urls.length) onChange((prev) => [...(prev ?? []), ...urls]);
    const errors = [...new Set(results.filter((r) => r.error).map((r) => r.error))];
    errors.forEach((error) => toast.error(error));

    const ids = new Set(items.map((item) => item.id));
    setPending((prev) => prev.filter((item) => !ids.has(item.id)));
  }

  const addLink = async () => {
    if (!link.trim() || addingLink) return;
    setAddingLink(true);
    try {
      const url = await addPhotoByLink(link.trim());
      onChange((prev) => [...(prev ?? []), url]);
      setLink('');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not add that photo.'));
    } finally {
      setAddingLink(false);
    }
  }

  const reorder = (from, to) => {
    if (from === to) return;
    onChange((prev) => moveItem(prev ?? [], from, to));
  }
  const removePhoto = (url) => {
    onChange((prev) => (prev ?? []).filter((photo) => photo !== url));
    const preview = localPreviews.current.get(url);
    if (preview) {
      URL.revokeObjectURL(preview);
      localPreviews.current.delete(url);
    }
    onRemoteStatus(url, true);
  };

  const isFileDrag = (e) => e.dataTransfer?.types?.includes('Files');
  const dropHandlers = {
    onDragOver: (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDropActive(true);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDropActive(false);
    },
    onDrop: (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDropActive(false);
      handleFiles(e.dataTransfer.files);
    },
  };

  const openPicker = () => fileInput.current?.click();
  const count = list.length + pending.length;

  return (
    <div {...dropHandlers} className="mt-2">
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(',')}
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {count === 0 ? (
        <div
          className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition ${
            dropActive ? 'border-gray-900 bg-gray-50' : 'border-gray-300'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-20 w-20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
          </svg>
          <p className="text-xl font-semibold">Drag your photos here</p>
          <p className="text-gray-500">Choose at least {MIN_RECOMMENDED_PHOTOS} photos</p>
          <button type="button" onClick={openPicker} className="mt-2 bg-transparent font-semibold underline underline-offset-2">
            Upload from your device
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">
                {count < MIN_RECOMMENDED_PHOTOS ? 'Add some photos of your place' : 'Ta-da! How does this look?'}
              </p>
              <p className="text-sm text-gray-500">
                {count < MIN_RECOMMENDED_PHOTOS
                  ? `Add ${MIN_RECOMMENDED_PHOTOS - count} more to help guests picture their stay. `
                  : ''}
                Drag to reorder. The first photo is your cover.
              </p>
            </div>
            <button
              type="button"
              onClick={openPicker}
              className="flex items-center gap-2 rounded-lg border border-gray-900 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add photos
            </button>
          </div>

          {list.some((url) => unviewable.has(url)) && (
            <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p>
                <span className="font-semibold">Some photos can’t be shown to guests yet.</span>{' '}
                They uploaded, but the photo storage is refusing to display them. You can keep editing; they’ll appear once storage access is fixed.
              </p>
            </div>
          )}

          <div className={`grid grid-cols-2 gap-3 rounded-xl sm:gap-4 ${dropActive ? 'outline-2 outline-offset-4 outline-dashed outline-gray-900' : ''}`}>
            {list.map((url, index) => (
              <div
                key={url}
                draggable
                onDragStart={(e) => {
                  dragFrom.current = index;
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                  setDragIndex(null);
                }}
                onDragOver={(e) => {
                  if (dragFrom.current !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (dragFrom.current === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  reorder(dragFrom.current, index);
                  dragFrom.current = null;
                  setDragIndex(null);
                }}
                className={`group relative cursor-grab overflow-hidden rounded-xl bg-gray-100 active:cursor-grabbing ${
                  index === 0 ? 'col-span-2 aspect-[3/2]' : 'aspect-[4/3]'
                } ${dragIndex === index ? 'opacity-40' : ''}`}
              >
                <UploadedPhoto
                  url={url}
                  preview={localPreviews.current.get(url)}
                  alt={index === 0 ? 'Cover photo' : `Photo ${index + 1}`}
                  onRemoteStatus={onRemoteStatus}
                />
                {index === 0 && (
                  <span className="absolute left-2 top-2 rounded-md bg-white px-2.5 py-1 text-xs font-semibold shadow-sm sm:left-3 sm:top-3 sm:px-3 sm:text-sm">
                    Cover photo
                  </span>
                )}
                {unviewable.has(url) && (
                  <span title="Uploaded, but the photo storage won’t display it yet" className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3h.007v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span className="hidden sm:inline">Not visible to guests</span>
                    <span className="sm:hidden">Not visible</span>
                  </span>
                )}
                <div className="absolute right-2 top-2 sm:right-3 sm:top-3" ref={menuFor === url ? menuRef : null}>
                  <button
                    type="button"
                    aria-label="Photo options"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === url}
                    onClick={() => setMenuFor(menuFor === url ? null : url)}
                    className="grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-sm transition hover:scale-105 hover:bg-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                      <path fillRule="evenodd" d="M4.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm6 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm6 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {menuFor === url && (
                    <div role="menu" className="absolute right-0 z-10 mt-2 w-48 overflow-hidden rounded-xl bg-white py-2 text-sm shadow-xl ring-1 ring-black/5 dark:bg-gray-50 dark:ring-white/10">
                      {[
                        index > 0 && ['Move backward', () => reorder(index, index - 1)],
                        index < list.length - 1 && ['Move forward', () => reorder(index, index + 1)],
                        index > 0 && ['Make cover photo', () => reorder(index, 0)],
                        ['Delete', () => removePhoto(url)],
                      ]
                        .filter(Boolean)
                        .map(([label, action]) => (
                          <button
                            key={label}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              action();
                              setMenuFor(null);
                            }}
                            className="block w-full bg-transparent px-4 py-2 text-left hover:bg-gray-100"
                          >
                            {label}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {pending.map((item, i) => (
              <div
                key={item.id}
                className={`relative overflow-hidden rounded-xl bg-gray-100 ${
                  list.length === 0 && i === 0 ? 'col-span-2 aspect-[3/2]' : 'aspect-[4/3]'
                }`}
              >
                <img src={item.preview} alt="" className="h-full w-full object-cover opacity-50" />
                <div className="keep-light absolute inset-x-3 bottom-3 sm:inset-x-6 sm:bottom-6">
                  <p className="mb-2 text-center text-xs font-semibold text-gray-900 sm:text-sm">Uploading… {Math.round(item.progress * 100)}%</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/70">
                    <div className="h-full rounded-full bg-gray-900 transition-[width]" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={openPicker}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-transparent text-gray-600 transition hover:border-gray-900 hover:text-gray-900"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="font-semibold">Add more</span>
            </button>
          </div>
        </>
      )}

      <div className="mt-4">
        <label htmlFor="photo-link" className="text-sm text-gray-600">Or add a photo from a link</label>
        <div className="flex items-center gap-2">
          <input
            id="photo-link"
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault(); // don't submit the listing form
                addLink();
              }
            }}
            placeholder="https://example.com/photo.jpg"
          />
          <button
            type="button"
            onClick={addLink}
            disabled={!link.trim() || addingLink}
            className="shrink-0 rounded-2xl bg-gray-900 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {addingLink ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PhotoUploader
