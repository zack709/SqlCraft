import { Check, Globe, LayoutGrid, List, Moon, PanelRight, Settings, Sun, Type, X } from "lucide-react";
import { type AppLanguage, t } from "../lib/i18n";
import { useWorkbenchStore } from "../store/workbenchStore";
import { isMacOS } from "../utils/platform";

export function SettingsModal() {
  const {
    settingsModalOpen,
    setSettingsModalOpen,
    theme,
    setTheme,
    language,
    setLanguage,
    editorFontSize,
    setEditorFontSize,
    rightPaneOpen,
    setRightPaneOpen,
    objectViewMode,
    setObjectViewMode,
  } = useWorkbenchStore();

  if (!settingsModalOpen) return null;

  const isMac = isMacOS();
  const isDark = theme === "dark";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setSettingsModalOpen(false);
      }}
    >
      <div
        className={`flex w-full max-w-[480px] flex-col overflow-hidden border shadow-2xl text-xs ${
          isMac ? "rounded-xl" : "rounded-md"
        } ${
          isDark
            ? "border-[#3a3a3c] bg-[#1e1e20] text-[#f5f5f7]"
            : "border-[#cbd5e1] bg-[#f8f9fb] text-[#1f2329]"
        }`}
      >
        {/* Title Bar */}
        <div
          className={`flex items-center justify-between border-b px-4 ${
            isMac ? "h-10" : "h-9"
          } ${
            isDark
              ? "border-[#333336] bg-[#252528]"
              : isMac
              ? "border-black/10 bg-[#ececed]"
              : "border-[#dcdfe6] bg-white"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <Settings
              className={`h-4 w-4 ${isDark ? "text-[#38bdf8]" : isMac ? "text-[#007aff]" : "text-[#2563eb]"}`}
            />
            <span>{t(language, "preferences")}</span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsModalOpen(false)}
            className={`p-1 transition-colors ${
              isMac ? "rounded-full" : "rounded"
            } ${
              isDark
                ? "text-[#98989d] hover:bg-white/10 hover:text-white"
                : "text-[#6b7280] hover:bg-black/8 hover:text-[#111827]"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div
          className={`space-y-5 p-5 ${
            isDark ? "bg-[#1c1c1e]" : "bg-white"
          }`}
        >
          {/* Theme Switcher Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t(language, "themeLabel")}</span>
              <span className={`text-[11px] ${isDark ? "text-[#98989d]" : "text-[#64748b]"}`}>
                {t(language, "themeDesc")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Light Theme Card */}
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`relative flex flex-col items-start gap-2.5 border p-3.5 text-left transition-all ${
                  isMac ? "rounded-xl" : "rounded-lg"
                } ${
                  !isDark
                    ? "border-[#2563eb] bg-[#eff6ff]/60 ring-2 ring-[#2563eb]/20"
                    : "border-[#3a3a3c] bg-[#252528] hover:border-[#52525b]"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Sun className="h-4 w-4 text-[#f59e0b]" />
                    {t(language, "lightMode")}
                  </span>
                  {!isDark && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2563eb] text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                {/* Mini Preview Swatch */}
                <div className="theme-swatch flex h-11 w-full overflow-hidden rounded-md border border-[#cbd5e1] bg-[#f8fafc]">
                  <div className="theme-swatch w-1/4 border-r border-[#e2e8f0] bg-[#f1f5f9] p-1 space-y-1">
                    <div className="theme-swatch h-1.5 w-3/4 rounded bg-[#94a3b8]" />
                    <div className="theme-swatch h-1.5 w-1/2 rounded bg-[#cbd5e1]" />
                  </div>
                  <div className="theme-swatch flex-1 bg-white p-1.5 space-y-1">
                    <div className="theme-swatch h-2 w-2/3 rounded bg-[#dbeafe]" />
                    <div className="theme-swatch h-1.5 w-full rounded bg-[#f1f5f9]" />
                  </div>
                </div>
              </button>

              {/* Dark Theme Card */}
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`relative flex flex-col items-start gap-2.5 border p-3.5 text-left transition-all ${
                  isMac ? "rounded-xl" : "rounded-lg"
                } ${
                  isDark
                    ? "border-[#38bdf8] bg-[#0ea5e9]/15 ring-2 ring-[#38bdf8]/25"
                    : "border-[#cbd5e1] bg-[#f8fafc] hover:border-[#94a3b8]"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Moon className="h-4 w-4 text-[#38bdf8]" />
                    {t(language, "darkMode")}
                  </span>
                  {isDark && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0ea5e9] text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                {/* Mini Preview Swatch */}
                <div className="flex h-11 w-full overflow-hidden rounded-md border border-[#3f3f46] bg-[#18181b]">
                  <div className="w-1/4 border-r border-[#27272a] bg-[#202023] p-1 space-y-1">
                    <div className="h-1.5 w-3/4 rounded bg-[#52525b]" />
                    <div className="h-1.5 w-1/2 rounded bg-[#3f3f46]" />
                  </div>
                  <div className="flex-1 bg-[#18181b] p-1.5 space-y-1">
                    <div className="h-2 w-2/3 rounded bg-[#1d4ed8]/60" />
                    <div className="h-1.5 w-full rounded bg-[#27272a]" />
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Language Switcher */}
          <div
            className={`flex items-center justify-between border-t pt-4 ${
              isDark ? "border-[#2c2c2e]" : "border-[#e2e8f0]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#10b981]" />
              <div>
                <div className="font-medium">{t(language, "languageLabel")}</div>
                <div className={`text-[11px] ${isDark ? "text-[#98989d]" : "text-[#64748b]"}`}>
                  {t(language, "languageDesc")}
                </div>
              </div>
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as AppLanguage)}
              className={`h-7 border px-2.5 text-[11px] font-medium outline-none transition ${
                isMac ? "rounded-lg" : "rounded"
              } ${
                isDark
                  ? "border-[#3a3a3c] bg-[#252528] text-[#f4f4f5] focus:border-[#0ea5e9]"
                  : "border-[#cbd5e1] bg-[#f8fafc] text-[#1f2329] focus:border-[#2563eb]"
              }`}
            >
              <option value="zh-TW">繁體中文</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* SQL Editor Font Size */}
          <div
            className={`flex items-center justify-between border-t pt-4 ${
              isDark ? "border-[#2c2c2e]" : "border-[#e2e8f0]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-[#38bdf8]" />
              <div>
                <div className="font-medium">{t(language, "fontSizeLabel")}</div>
                <div className={`text-[11px] ${isDark ? "text-[#98989d]" : "text-[#64748b]"}`}>
                  Monaco SQL Editor
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {[12, 13, 14, 15, 16].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setEditorFontSize(sz)}
                  className={`h-7 px-2.5 font-mono text-[11px] font-medium transition ${
                    isMac ? "rounded-lg" : "rounded"
                  } ${
                    editorFontSize === sz
                      ? isDark
                        ? "bg-[#0ea5e9] text-white"
                        : "bg-[#2563eb] text-white"
                      : isDark
                      ? "border border-[#3a3a3c] bg-[#252528] text-[#d1d1d6] hover:bg-[#2c2c30]"
                      : "border border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:bg-[#eef2f7]"
                  }`}
                >
                  {sz}px
                </button>
              ))}
            </div>
          </div>

          {/* Default Object View Mode & Right Inspector */}
          <div
            className={`space-y-3 border-t pt-4 ${
              isDark ? "border-[#2c2c2e]" : "border-[#e2e8f0]"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-[#10b981]" />
                <span>{t(language, "defaultObjectView")}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setObjectViewMode("list")}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium ${
                    isMac ? "rounded-lg" : "rounded"
                  } ${
                    objectViewMode === "list"
                      ? isDark
                        ? "bg-[#0ea5e9] text-white"
                        : "bg-[#2563eb] text-white"
                      : isDark
                      ? "border border-[#3a3a3c] bg-[#252528] text-[#d1d1d6]"
                      : "border border-[#cbd5e1] bg-[#f8fafc] text-[#334155]"
                  }`}
                >
                  <List className="h-3 w-3" />
                  {t(language, "listView")}
                </button>
                <button
                  type="button"
                  onClick={() => setObjectViewMode("grid")}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium ${
                    isMac ? "rounded-lg" : "rounded"
                  } ${
                    objectViewMode === "grid"
                      ? isDark
                        ? "bg-[#0ea5e9] text-white"
                        : "bg-[#2563eb] text-white"
                      : isDark
                      ? "border border-[#3a3a3c] bg-[#252528] text-[#d1d1d6]"
                      : "border border-[#cbd5e1] bg-[#f8fafc] text-[#334155]"
                  }`}
                >
                  <LayoutGrid className="h-3 w-3" />
                  {t(language, "gridView")}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PanelRight className="h-4 w-4 text-[#a855f7]" />
                <span>{t(language, "showInspector")}</span>
              </div>
              <input
                type="checkbox"
                checked={rightPaneOpen}
                onChange={(e) => setRightPaneOpen(e.target.checked)}
                className="h-4 w-4 accent-[#2563eb]"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-end border-t px-4 py-2.5 ${
            isDark
              ? "border-[#333336] bg-[#252528]"
              : isMac
              ? "border-black/10 bg-[#f2f2f7]"
              : "border-[#dcdfe6] bg-[#f8f9fb]"
          }`}
        >
          <button
            type="button"
            onClick={() => setSettingsModalOpen(false)}
            className={`px-4 py-1.5 font-medium text-white ${
              isMac
                ? "rounded-lg bg-[#007aff] hover:bg-[#0066cc]"
                : "rounded bg-[#2563eb] hover:bg-[#1d4ed8]"
            }`}
          >
            {t(language, "done")}
          </button>
        </div>
      </div>
    </div>
  );
}
