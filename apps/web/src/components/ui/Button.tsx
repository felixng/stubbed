// Triggers one action; matches FLButtonStyle in SwiftUI. One `primary` per
// screen, `secondary` for alternatives, `ghost` for low emphasis, `neutral`
// for third-party sign-in. Capsule.
const base =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill font-sans font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40";

const sizes = {
  md: "min-h-[50px] px-6 text-headline",
  sm: "min-h-11 px-4 text-subheadline",
};

const variants = {
  primary: "bg-tint text-on-tint shadow-btn hover:bg-tint-pressed",
  secondary: "bg-tint-fill text-tint-text hover:bg-fill",
  ghost: "bg-transparent text-tint-text hover:bg-tint-fill",
  // Third-party sign-in (Google, Apple), whose brand rules ask for a neutral button.
  neutral:
    "border border-separator bg-surface text-label shadow-sm hover:bg-fill",
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  ...props
}: React.ComponentPropsWithoutRef<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      type={type}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
