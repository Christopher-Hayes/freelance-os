import React from "react";

export interface DownloadButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  download?: string | boolean;
}

export const DownloadButton = React.forwardRef<HTMLAnchorElement, DownloadButtonProps>(
  (
    {
      href,
      download = true,
      className = "",
      ...props
    },
    ref
  ) => {
    const baseStyles = "inline-flex items-center justify-center p-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-blue-500 shadow-sm";

    return (
      <a
        ref={ref}
        href={href}
        download={download}
        className={`${baseStyles} ${className}`}
        title="Download"
        {...props}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-4 h-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
      </a>
    );
  }
);

DownloadButton.displayName = "DownloadButton";
