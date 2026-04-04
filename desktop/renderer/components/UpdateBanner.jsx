import { useEffect, useState } from 'react';

export default function UpdateBanner() {
  const [status, setStatus] = useState(null); // null | 'downloading' | 'ready'

  useEffect(() => {
    window.electronAPI.onUpdateAvailable(() => setStatus('downloading'));
    window.electronAPI.onUpdateDownloaded(() => setStatus('ready'));
  }, []);

  if (!status) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-blue-600 text-white text-sm shadow-md">
      {status === 'downloading' ? (
        <span>A new update is downloading in the background...</span>
      ) : (
        <>
          <span>Update ready to install.</span>
          <button
            onClick={() => window.electronAPI.installUpdate()}
            className="ml-4 px-3 py-1 bg-white text-blue-600 font-semibold rounded hover:bg-blue-50 transition-colors"
          >
            Restart & Update
          </button>
        </>
      )}
    </div>
  );
}
