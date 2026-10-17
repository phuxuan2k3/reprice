/**
 * Nút bấm dùng chung.
 * variant: primary | secondary | outline | danger | ghost
 */
export default function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary:
      "bg-brand-500 text-white hover:bg-brand-600 focus:ring-brand-200 shadow-sm",
    secondary:
      "bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-200 shadow-sm",
    outline:
      "bg-white text-ink-900 border border-gray-300 hover:bg-gray-50 hover:border-gray-400 focus:ring-gray-200",
    danger:
      "bg-white text-brand-600 border border-brand-300 hover:bg-brand-50 focus:ring-brand-200",
    ghost: "bg-transparent text-ink-700 hover:bg-gray-100 focus:ring-gray-200",
    success:
      "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-200 shadow-sm",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
