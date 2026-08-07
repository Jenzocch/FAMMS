// Instant skeleton while the tasks page fetches. The quick-add bar's shape
// shows immediately so the page feels ready to type into right away, instead
// of a blank wait — the whole point of tasks is fast capture.
export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
      {/* heading */}
      <div className="space-y-1.5">
        <div className="h-6 bg-gray-200 rounded w-24" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
      </div>
      {/* quick-add bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-11 flex-1 bg-gray-200 rounded-lg" />
          <div className="h-11 w-11 bg-gray-200 rounded-lg" />
          <div className="h-11 w-20 bg-gray-200 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 bg-gray-100 rounded-lg" />
          <div className="h-9 w-16 bg-gray-100 rounded-lg" />
          <div className="h-9 w-28 bg-gray-100 rounded-lg ml-auto" />
        </div>
      </div>
      {/* filter chips */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-20 bg-gray-100 rounded-full" />
        <div className="h-7 w-20 bg-gray-100 rounded-full" />
        <div className="h-7 w-14 bg-gray-100 rounded-full" />
      </div>
      {/* task rows */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 flex items-start gap-3">
          <div className="mt-1.5 w-2 h-2 rounded-full bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
          <div className="w-9 h-9 bg-gray-100 rounded-lg" />
        </div>
      ))}
    </div>
  )
}
