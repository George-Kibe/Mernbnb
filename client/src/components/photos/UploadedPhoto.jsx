import React, { useEffect, useState } from 'react'

// One photo tile in the listing editor.
// - Shows `preview` (a local blob URL of the file just picked) when available,
//   so photos appear instantly; otherwise the stored `url`.
// - Shimmers while loading and shows a clear message if the image can't load
//   (instead of the browser's broken-image icon).
// - When showing a local preview, it also checks that the stored copy is
//   viewable and reports the result through onRemoteStatus(url, ok), so the
//   host learns about storage problems before guests do.
const UploadedPhoto = ({ url, preview, alt, onRemoteStatus, children }) => {
  const src = preview ?? url;
  // Status is derived from which src last loaded/failed, so a fast (cached or
  // blob) load can't be overwritten by a later "reset to loading".
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [failedSrc, setFailedSrc] = useState(null);
  const status = src === loadedSrc ? 'loaded' : src === failedSrc ? 'error' : 'loading';

  useEffect(() => {
    if (!preview || !onRemoteStatus) return;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => { if (!cancelled) onRemoteStatus(url, true); };
    probe.onerror = () => { if (!cancelled) onRemoteStatus(url, false); };
    probe.src = url;
    return () => { cancelled = true; probe.src = ''; };
  }, [url, preview, onRemoteStatus]);

  return (
    <>
      {status !== 'error' && (
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {status === 'loading' && <div className="absolute inset-0 animate-pulse bg-gray-200" aria-hidden="true" />}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-100 p-4 text-center text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3l18 18M3.75 19.5h16.5" />
          </svg>
          <p className="text-sm font-semibold text-gray-900">Couldn’t load photo</p>
          <p className="hidden text-xs sm:block">Delete it and try uploading again.</p>
        </div>
      )}
      {children}
    </>
  )
}

export default UploadedPhoto
