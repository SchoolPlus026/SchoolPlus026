import React from 'react';
import ExecutiveBriefingWidget from '../features/dashboard/ExecutiveBriefingWidget';

export default function ExecutiveBriefingPage() {
  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto pb-10">
      <ExecutiveBriefingWidget forceShow={true} />
    </div>
  );
}
