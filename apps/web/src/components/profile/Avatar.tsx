// Round avatar: the profile photo, or the first letter of the name in white
// on the `sweep` gradient when there isn't one.
export function Avatar({
  name,
  url,
  size,
  className = "",
}: {
  name: string;
  url?: string | null;
  size: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars come from anywhere
      <img src={url} alt="" style={style} className={`flex-none rounded-pill bg-fill object-cover ${className}`} />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: size * 0.42 }}
      className={`flex flex-none items-center justify-center rounded-pill bg-sweep font-display font-bold text-white uppercase ${className}`}
    >
      {name.replace(/^@/, "").charAt(0)}
    </span>
  );
}
