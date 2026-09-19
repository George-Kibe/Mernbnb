import { Link, useSearchParams } from "react-router";
import toast from "react-hot-toast"
import PhotoCarousel from "../components/photos/PhotoCarousel";
import Pagination from "../components/Pagination";
import { useState, useEffect, useMemo } from "react";
import { apiFiltersFor, hasSearch, readSearch, searchParamsFor } from "../lib/search";
import { api, errorMessage } from "../lib/api";

// 12 fills whole rows at every breakpoint of the 1/2/3/4/6-column grid.
const PAGE_SIZE = 12;

const SkeletonCard = () => (
  <div className="animate-pulse" aria-hidden="true">
    <div className="aspect-square rounded-xl bg-gray-200" />
    <div className="mt-3 h-4 w-3/4 rounded bg-gray-200" />
    <div className="mt-2 h-4 w-1/2 rounded bg-gray-200" />
    <div className="mt-2 h-4 w-1/3 rounded bg-gray-200" />
  </div>
)

const IndexPage = () => {
  // The page and the search (from the navbar) live in the URL, e.g.
  // ?location=Kilifi&adults=2&page=2, so refresh, back/forward and shared
  // links land on the same results.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(Number.parseInt(searchParams.get("page"), 10) || 1, 1);
  const search = useMemo(() => readSearch(searchParams), [searchParams]);
  const searchKey = new URLSearchParams(searchParamsFor(search)).toString();
  const requestKey = `${page}|${searchKey}`;
  // The result remembers which request it answers; anything else is loading.
  const [result, setResult] = useState({ key: null, places: [], total: 0, totalPages: 0 });
  const loading = result.key !== requestKey;

  const withPage = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 1) params.delete("page");
    else params.set("page", String(next));
    return params;
  }
  const goToPage = (next) => {
    setSearchParams(withPage(next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    let cancelled = false;
    const filters = apiFiltersFor(readSearch(new URLSearchParams(searchKey)));
    api.get("/places", { params: { page, limit: PAGE_SIZE, ...filters } })
      .then(({ data }) => {
        if (cancelled) return;
        if (!Array.isArray(data?.places)) throw new Error("Unexpected response from the server.");
        // Past the last page (e.g. a stale link): jump to the last one.
        if (data.totalPages > 0 && page > data.totalPages) {
          setSearchParams(withPage(data.totalPages), { replace: true });
          return;
        }
        setResult({ ...data, key: requestKey });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(errorMessage(error, "Could not load places."));
        setResult({ key: requestKey, places: [], total: 0, totalPages: 0 });
      });
    return () => { cancelled = true; };
    // withPage only depends on the URL, which page/searchKey already track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // Carry dates and guests to the listing so its booking form is prefilled.
  const tripQuery = (() => {
    const { checkin, checkout, adults, children } = searchParamsFor(search);
    const params = new URLSearchParams({ ...(checkin && { checkin, checkout }), ...(adults && { adults }), ...(children && { children }) });
    return params.size ? `?${params}` : "";
  })();
  const searching = hasSearch(search);

  return (
    <div className='flex flex-col'>
      {
        searching && !loading && result.total > 0 && (
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">
              {result.total} {result.total === 1 ? "stay" : "stays"}{search.location && ` in ${search.location}`}
            </p>
            <Link to="/" className="text-sm font-semibold underline">Clear search</Link>
          </div>
        )
      }
      <div className='mt-8 grow grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 content-start' aria-busy={loading}>
        {
          loading
            ? Array.from({ length: PAGE_SIZE }, (_, i) => <SkeletonCard key={i} />)
            : result.places.map(place => (
              <Link to={`/place/${place._id}${tripQuery}`} key={place._id}>
                <PhotoCarousel photos={place.photos} alt={place.title} />
                <div className="mt-3 text-[15px] leading-5">
                  <h2 className="font-semibold truncate">{place.address}</h2>
                  <h3 className="text-gray-500 truncate">{place.title}</h3>
                  <p className="mt-1.5">
                    <span className="font-semibold">Kshs. {Number(place.price).toLocaleString("en-KE")}</span> night
                  </p>
                </div>
              </Link>
            ))
        }
      </div>
      {
        !loading && result.total === 0 && (
          searching ? (
            <div className="mx-auto max-w-md py-16 text-center">
              <h2 className="text-2xl font-semibold">No exact matches</h2>
              <p className="mt-2 text-gray-600">Try changing or removing some of your filters or adjusting your dates.</p>
              <Link to="/" className="mt-6 inline-block rounded-lg border border-gray-900 px-6 py-3 font-semibold hover:bg-gray-50">
                Remove all filters
              </Link>
            </div>
          ) : (
            <p className="py-16 text-center text-gray-500">No places to stay yet.</p>
          )
        )
      }
      {
        !loading && (
          <Pagination
            page={page}
            totalPages={result.totalPages}
            total={result.total}
            pageSize={PAGE_SIZE}
            onPageChange={goToPage}
          />
        )
      }
    </div>
  )
}

export default IndexPage;
