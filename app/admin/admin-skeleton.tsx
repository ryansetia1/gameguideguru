type AdminSkeletonProps = {
  variant: "activity" | "traces";
};

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`admin-skeleton-block ${className}`} aria-hidden />;
}

export function AdminSkeleton({ variant }: AdminSkeletonProps) {
  if (variant === "traces") {
    return (
      <div className="admin-skeleton" aria-busy="true" aria-label="Loading traces">
        <div className="kpi-grid admin-skeleton-kpi">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="admin-skeleton-kpi-card" />
          ))}
        </div>
        <SkeletonBlock className="admin-skeleton-toolbar" />
        <SkeletonBlock className="admin-skeleton-tabs" />
        <div className="admin-skeleton-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="admin-skeleton-trace-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-skeleton" aria-busy="true" aria-label="Loading activity">
      <div className="kpi-grid admin-skeleton-kpi">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock key={index} className={`admin-skeleton-kpi-card${index === 4 ? " admin-skeleton-kpi-card--wide" : ""}`} />
        ))}
      </div>
      <SkeletonBlock className="admin-skeleton-note" />
      <SkeletonBlock className="admin-skeleton-toolbar" />
      <div className="admin-skeleton-list">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock key={index} className="admin-skeleton-activity-card" />
        ))}
      </div>
    </div>
  );
}
