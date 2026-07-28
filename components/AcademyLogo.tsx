interface AcademyLogoProps {
  size?: "default" | "small" | "large";
  alt?: string;
  className?: string;
}

export default function AcademyLogo({ size = "default", alt = "목동유쌤영어학원 로고", className = "" }: AcademyLogoProps) {
  const classes = ["brand-logo", size !== "default" ? size : "", className].filter(Boolean).join(" ");
  return <img src="/academy-logo.png" alt={alt} className={classes} />;
}
