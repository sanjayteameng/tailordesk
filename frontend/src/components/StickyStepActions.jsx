export default function StickyStepActions({ children }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-3 border-t border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
