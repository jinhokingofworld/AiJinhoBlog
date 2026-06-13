import type { ReactNode } from "react";

export const pageFramePaddingClass = "px-4 sm:px-6";
export const pageFrameMaxWidthClass = "max-w-[1120px]";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type PageFrameProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  paddingClassName?: string;
};

export function PageFrame({
  children,
  className,
  contentClassName,
  paddingClassName = "py-5 lg:py-8",
}: PageFrameProps) {
  return (
    <main
      className={cx(
        "min-h-screen bg-[#f8f7f4] text-zinc-950",
        pageFramePaddingClass,
        paddingClassName,
        className,
      )}
    >
      <div className={cx("mx-auto w-full", pageFrameMaxWidthClass, contentClassName)}>
        {children}
      </div>
    </main>
  );
}
