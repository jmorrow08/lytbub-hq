import React from 'react';

export default function PaymentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black p-6">
      {children}
    </div>
  );
}
