import type { DbKind } from "../types/database";

interface DbEngineIconProps {
  kind: DbKind;
  size?: number;
  connected?: boolean;
  muted?: boolean;
  className?: string;
}

export const DB_ENGINE_META: Record<
  DbKind,
  { label: string; shortLabel: string; bgColor: string; defaultPort: number }
> = {
  mysql: {
    label: "MySQL",
    shortLabel: "MySQL",
    bgColor: "#22C55E",
    defaultPort: 3306,
  },
  mariadb: {
    label: "MariaDB",
    shortLabel: "MariaDB",
    bgColor: "#B89166",
    defaultPort: 3306,
  },
  postgres: {
    label: "PostgreSQL",
    shortLabel: "PG",
    bgColor: "#3B82F6",
    defaultPort: 5432,
  },
};

/**
 * Navicat-style rounded-square database engine icon with optional green connected checkmark badge.
 */
export function DbEngineIcon({
  kind,
  size = 18,
  connected = false,
  muted = false,
  className = "",
}: DbEngineIconProps) {
  const meta = DB_ENGINE_META[kind] ?? DB_ENGINE_META.mysql;
  const bg = muted ? "#71717A" : meta.bgColor;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="block"
        aria-hidden="true"
      >
        <rect x="1" y="1" width="22" height="22" rx="5" fill={bg} />

        {kind === "mysql" && (
          /* White leaping dolphin silhouette */
          <path
            d="M5.2 6.8C7.6 5.4 11.4 6.2 14.3 8.8C16.2 10.5 17.5 12.6 18.4 14.9C19.2 15.1 20 15.7 20.4 16.6C19.3 16.7 18.2 16.4 17.4 15.8C16.9 16.8 16.2 17.6 15.3 18.3C15.5 17.2 15.4 16.1 14.9 15.2C13.6 14.5 12.2 13.5 11.1 12.2C10.1 12.7 9.1 12.9 8.1 12.8C8.6 11.9 9.1 11.2 9.7 10.7C8.2 9.4 6.6 8.3 4.8 7.8C4.6 7.4 4.8 7 5.2 6.8ZM11.8 6.9C12.3 5.7 13.2 5 14.3 4.8C14 5.9 13.5 6.8 12.8 7.5Z"
            fill="#FFFFFF"
          />
        )}

        {kind === "mariadb" && (
          /* White sea lion / seal silhouette */
          <path
            d="M4.6 16.8C6.3 16.2 7.8 15.2 9.4 13.8C11.2 12.2 12.7 10.2 13.9 7.8C14.5 6.6 15.6 5.8 16.9 5.9C18 6 18.8 6.8 18.7 7.8C18.6 8.6 17.9 9.1 17.1 9.3C16.4 11 16.2 12.9 16.6 14.7C17.4 15.1 18.3 15.6 19 16.3C17.7 16.6 16.4 16.4 15.3 15.8C14.2 16.6 12.9 17.1 11.4 17.3L10.3 18.6L9.1 17.5C7.6 17.6 6 17.5 4.6 16.8Z"
            fill="#FFFFFF"
          />
        )}

        {kind === "postgres" && (
          /* White elephant head silhouette */
          <path
            d="M12 5.2C9.8 5.2 8.2 6.2 7.2 7.4C5.4 7 4.2 8.3 4.4 10.6C4.6 12.8 6 14.3 7.5 14.2C8.1 15.6 9.3 16.6 10.7 16.9V18.3C10.7 19.2 11.4 19.8 12.3 19.8C13.2 19.8 13.8 19.2 13.8 18.3C13.8 17.7 13.3 17.3 12.7 17.3V15.4C14.7 15.2 16 14.6 16.5 14.2C18 14.3 19.4 12.8 19.6 10.6C19.8 8.3 18.6 7 16.8 7.4C15.8 6.2 14.2 5.2 12 5.2ZM9.8 10.6C9.4 10.6 9.1 10.2 9.1 9.8C9.1 9.4 9.4 9 9.8 9C10.2 9 10.5 9.4 10.5 9.8C10.5 10.2 10.2 10.6 9.8 10.6ZM14.2 10.6C13.8 10.6 13.5 10.2 13.5 9.8C13.5 9.4 13.8 9 14.2 9C14.6 9 14.9 9.4 14.9 9.8C14.9 10.2 14.6 10.6 14.2 10.6Z"
            fill="#FFFFFF"
          />
        )}
      </svg>

      {connected && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-[#16A34A] ring-1 ring-white"
          style={{
            width: Math.max(8, Math.round(size * 0.45)),
            height: Math.max(8, Math.round(size * 0.45)),
          }}
        >
          <svg
            viewBox="0 0 12 12"
            width={Math.max(6, Math.round(size * 0.32))}
            height={Math.max(6, Math.round(size * 0.32))}
          >
            <path
              d="M2.5 6.2L5 8.7L9.5 3.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </span>
  );
}
