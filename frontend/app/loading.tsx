export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md p-4 border border-gray-300 rounded mt-10 animate-pulse">
        <div className="text-center mb-4">
          <div className="h-10 w-32 bg-gray-200 rounded mx-auto" />
        </div>
        <div className="flex flex-col gap-y-8">
          <div className="h-10 w-full bg-gray-200 rounded" />
          <div className="h-10 w-full bg-gray-200 rounded" />
          <div className="h-10 w-full bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  );
}
