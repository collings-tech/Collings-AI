import React from 'react';

export default function SeoRewriteBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full text-xs text-white flex items-center justify-center font-bold shadow-lg">
      {count > 9 ? '9+' : count}
    </span>
  );
}
