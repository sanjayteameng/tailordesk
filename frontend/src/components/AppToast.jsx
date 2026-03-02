function toneForType(type) {
  if (type === "error") {
    return {
      wrap: "border-red-200/40 bg-gradient-to-r from-red-800 to-rose-700",
      icon: "!"
    };
  }
  if (type === "warning") {
    return {
      wrap: "border-amber-200/40 bg-gradient-to-r from-amber-700 to-orange-600",
      icon: "!"
    };
  }
  return {
    wrap: "border-brand-200/40 bg-gradient-to-r from-brand-900 via-brand-800 to-brand-700",
    icon: "✓"
  };
}

export default function AppToast({ toast }) {
  if (!toast) return null;
  const tone = toneForType(toast.type);

  return (
    <div className="fixed right-5 top-5 z-[60]">
      <div
        className={`td-toast-enter td-toast-card min-w-[280px] max-w-[380px] rounded-xl border px-4 py-3 text-sm text-white shadow-2xl ${tone.wrap}`}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/25 text-xs font-bold">
            {tone.icon}
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{toast.message}</p>
          </div>
        </div>
        <div className="td-toast-progress mt-2 h-1 rounded-full bg-white/70" />
      </div>
    </div>
  );
}
