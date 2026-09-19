import { useSearchParams } from "react-router";
import PlaceListings from "../components/PlaceListings";
import { hasSearch, readSearch } from "../lib/search";
import { homeSeo, useSeo } from "../lib/seo";

const IndexPage = () => {
  const [searchParams] = useSearchParams();
  const search = readSearch(searchParams);
  const searching = hasSearch(search);
  const page = Math.max(Number.parseInt(searchParams.get("page"), 10) || 1, 1);
  // Search results aren't indexed; the destination pages (/stays/…) are.
  useSeo(homeSeo({ page, searching, location: search.location }));

  return (
    <>
      {!searching && (
        <div className="mt-6">
          <h1 className="text-2xl font-semibold">Holiday homes &amp; vacation rentals in Kenya</h1>
          <p className="mt-1 text-gray-600">Beach villas, safari cottages, lake cabins and city apartments, priced per night in Kenyan shillings.</p>
        </div>
      )}
      <PlaceListings />
    </>
  )
}

export default IndexPage;
