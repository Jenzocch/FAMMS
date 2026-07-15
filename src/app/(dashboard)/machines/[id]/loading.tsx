export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-gray-200 rounded-lg" />
          <div className="space-y-1.5">
            <div className="h-5 bg-gray-200 rounded w-32" />
            <div className="h-3.5 bg-gray-200 rounded w-24" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 bg-gray-200 rounded-lg w-24" />
          <div className="h-9 bg-gray-200 rounded-lg w-20" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-64 bg-gray-200 rounded-xl" />
        <div className="space-y-3">
          <div className="h-28 bg-gray-200 rounded-xl" />
          <div className="h-20 bg-gray-200 rounded-xl" />
          <div className="h-20 bg-gray-200 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
