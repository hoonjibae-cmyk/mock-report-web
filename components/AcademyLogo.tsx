import Link from "next/link";

interface AcademyLogoProps {
  size?: "default" | "small" | "large";
  alt?: string;
  className?: string;
  /**
   * 눌렀을 때 갈 곳. 주면 로고가 링크가 된다.
   *
   * 관리 화면에서는 홈으로 돌아가는 길로 쓴다 — 로고를 누르면 첫 화면이라는
   * 것은 웹에서 오래된 약속이라, 없으면 사람이 뒤로가기를 거듭 누르게 된다.
   * 학부모가 보는 성적표에는 주지 않는다. 갈 곳이 관리 화면뿐이다.
   */
  href?: string;
}

export default function AcademyLogo({
  size = "default",
  alt = "목동유쌤영어학원 로고",
  className = "",
  href,
}: AcademyLogoProps) {
  const classes = ["brand-logo", size !== "default" ? size : "", className].filter(Boolean).join(" ");
  const img = <img src="/academy-logo.png" alt={alt} className={classes} />;
  if (!href) return img;
  return (
    <Link href={href} className="brand-logo-link" aria-label="홈으로" title="홈으로">
      {img}
    </Link>
  );
}
