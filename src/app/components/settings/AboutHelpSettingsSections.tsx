import {
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import defaultHelpContentJson from '../../content/helpContent.json';
import { useAppUpdateState } from '../../hooks/useAppUpdateState.ts';
import omvraLogo from '../../images/logo-large.svg';
import profilePicture from '../../images/profile.png';
import {
  type HelpContent,
  type HelpFaq,
  type HelpResource,
} from '../utils/helpContent.ts';
import { parseUpdateReleaseNotes } from '../../utils/updateReleaseNotes.ts';
import { AnchoredPanelSection } from '../AnchoredPanel';
import { AboutIcon, HelpIcon } from '../SettingsPanel';

const CONTACT_EMAIL_URL = 'mailto:sorin.jurcut@gmail.com';
const LINKEDIN_URL = 'https://www.linkedin.com/in/sorinjurcut/';

const MIT_LICENSE_TERMS = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const LICENSE_TEXT = [
  `React — MIT License
Copyright (c) Facebook, Inc. and its affiliates.

${MIT_LICENSE_TERMS}`,
  `Electron — MIT License
Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

${MIT_LICENSE_TERMS}`,
  `Vite — MIT License
Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

${MIT_LICENSE_TERMS}`,
  `Tailwind CSS — MIT License
Copyright (c) Tailwind Labs, Inc.

${MIT_LICENSE_TERMS}`,
  `Radix UI — MIT License
Copyright (c) 2022 WorkOS

${MIT_LICENSE_TERMS}`,
  `Lucide — ISC License
Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,
].join('\n\n────────────────────────────────────────\n\n');

const helpContent = defaultHelpContentJson as HelpContent;

interface AboutVersionInfo {
  appVersion: string;
  mcpVersion: string;
  build: string;
}

interface AboutSettingsSectionProps {
  updateChannel: 'stable' | 'rc';
  onUpdateChannelChange: (channel: 'stable' | 'rc') => void;
  onExportWorkspaceBackup: () => Promise<boolean>;
}

export function HelpSettingsSection({ onReplayOnboarding }: { onReplayOnboarding: () => void }) {
  return (
    <AnchoredPanelSection
      id="help"
      title="Help"
      icon={HelpIcon}
      description="Useful resources for learning and troubleshooting Omvra"
    >
      <div className="min-w-0 space-y-8">
        <section className="space-y-3" aria-labelledby="help-onboarding-title">
          <div className="space-y-1">
            <h4 id="help-onboarding-title" className="text-sm font-semibold leading-5 text-[#71717a]">
              Onboarding
            </h4>
            <p className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">
              Restart the first-run guide and revisit the basics.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#71717a] outline-none hover:bg-[#fafafa] focus-visible:ring-2 focus-visible:ring-[#76879d]"
            onClick={onReplayOnboarding}
          >
            <RotateCcw className="size-4" />
            Restart Onboarding
          </button>
        </section>

        <ResourceList title="Tutorials">
          {helpContent.resources.length === 0 && <HelpEmptyState label="No tutorials are available yet." />}
          {helpContent.resources.map(item => (
            <ResourceRow key={item.id} icon={<TutorialIcon className="size-4" />} resource={item} />
          ))}
        </ResourceList>

        <ResourceList title="FAQs">
          {helpContent.faqs.length === 0 && <HelpEmptyState label="No FAQs are available yet." />}
          {helpContent.faqs.map(item => (
            <FaqRow key={item.id} faq={item} />
          ))}
        </ResourceList>
      </div>
    </AnchoredPanelSection>
  );
}

export function AboutSettingsSection({
  updateChannel,
  onUpdateChannelChange,
  onExportWorkspaceBackup,
}: AboutSettingsSectionProps) {
  const [versionInfo, setVersionInfo] = useState<AboutVersionInfo>({
    appVersion: 'Loading...',
    mcpVersion: 'Loading...',
    build: 'Loading...',
  });
  const {
    updateState,
    backupExportedAt,
    installBlocked,
    handleCheckForUpdates,
    handleDownloadUpdate,
    handleDismissUpdate,
    handleInstallUpdate,
    handleExportBackup,
    handleUpdateChannelSelect,
  } = useAppUpdateState({
    updateChannel,
    onUpdateChannelChange,
    onExportWorkspaceBackup,
  });

  useEffect(() => {
    let cancelled = false;

    const loadVersionInfo = async () => {
      const runtimeInfo = await loadRuntimeInfo();
      const mcpVersion = await loadMcpVersion();

      if (cancelled) return;

      setVersionInfo({
        appVersion: runtimeInfo.appVersion,
        mcpVersion,
        build: runtimeInfo.build,
      });
    };

    void loadVersionInfo();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateBadge = getUpdateBadge(updateState);
  const showDownloadAction = updateState.status === 'available';
  const showInstallAction = updateState.status === 'downloaded';
  const showBackupAction = showDownloadAction || showInstallAction;
  const isCheckingForUpdates = updateState.status === 'checking';
  const parsedReleaseNotes = parseUpdateReleaseNotes(updateState.update?.releaseNotes, { maxItems: 4 });

  return (
    <AnchoredPanelSection id="about" title="About" icon={AboutIcon}>
      <div className="min-w-0 space-y-8">
        <div className="pt-1">
          <img src={omvraLogo} alt="Omvra" className="h-8 w-auto" />
        </div>

        <section className="space-y-3" aria-labelledby="about-version-title">
          <h4 id="about-version-title" className="text-sm font-semibold leading-5 text-[#71717a]">
            Version
          </h4>
          <div className="rounded-xl bg-[#fafafa] px-4 py-3">
            <InfoRow label="App version" value={versionInfo.appVersion} />
            <InfoRow label="MCP version" value={versionInfo.mcpVersion} />
            <InfoRow label="Build" value={versionInfo.build} />
            <InfoRow label="Copyright" value="Sorin Jurcut" />
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="about-update-title">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h4 id="about-update-title" className="text-sm font-semibold leading-5 text-[#71717a]">
                Update
              </h4>
              <p className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">
                Check if there is a new version available to download.
              </p>
            </div>
            <span className={updateBadge.className}>
              {updateBadge.showCheck ? <Check className="size-3.5" /> : null}
              {updateBadge.label}
            </span>
          </div>
          <div className="space-y-3 rounded-xl bg-[#fafafa] px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleUpdateChannelSelect('stable')}
                className={getChannelButtonClass(updateChannel === 'stable')}
              >
                Stable releases
              </button>
              <button
                type="button"
                onClick={() => handleUpdateChannelSelect('rc')}
                className={getChannelButtonClass(updateChannel === 'rc')}
              >
                Release candidates
              </button>
            </div>

            <div className="space-y-1 text-xs leading-4 text-[#6a7282]">
              <p>
                {getUpdateSummary(updateState)}
              </p>
              {updateState.update ? (
                <p className="text-[#71717a]">
                  Version {updateState.update.version}
                  {updateState.update.releaseDate ? ` • ${formatUpdateDate(updateState.update.releaseDate)}` : ''}
                </p>
              ) : null}
              {updateState.error ? (
                <p className="text-[#c40000]">{updateState.error}</p>
              ) : null}
              {installBlocked ? (
                <p className="text-[#8a5a00]">Export a backup before installing this release candidate.</p>
              ) : null}
              {backupExportedAt ? (
                <p className="text-[#138a39]">Backup exported for this update.</p>
              ) : null}
            </div>

            {parsedReleaseNotes.items.length > 0 ? (
              <div className="space-y-2 text-xs leading-4 text-[#71717a]">
                {parsedReleaseNotes.summary && !parsedReleaseNotes.items.includes(parsedReleaseNotes.summary) ? (
                  <p>{parsedReleaseNotes.summary}</p>
                ) : null}
                <ul className="ml-[18px] list-disc space-y-1">
                  {parsedReleaseNotes.items.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {parsedReleaseNotes.hasMore ? <p>...and more in the full release notes.</p> : null}
              </div>
            ) : parsedReleaseNotes.summary ? (
              <p className="text-xs leading-4 text-[#71717a]">{parsedReleaseNotes.summary}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isCheckingForUpdates}
                onClick={() => {
                  void handleCheckForUpdates();
                }}
                className="inline-flex h-8 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#67676f] outline-none hover:bg-[#71717a]/5 focus-visible:ring-2 focus-visible:ring-gray-300 disabled:cursor-wait disabled:opacity-80"
              >
                <RotateCcw className={isCheckingForUpdates ? 'size-4 shrink-0 animate-spin' : 'size-4 shrink-0'} />
                Check now
              </button>

              {showBackupAction ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleExportBackup();
                  }}
                  className="inline-flex h-8 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#67676f] outline-none hover:bg-[#71717a]/5 focus-visible:ring-2 focus-visible:ring-gray-300"
                >
                  <Download className="size-4 shrink-0" />
                  Export backup
                </button>
              ) : null}

              {showDownloadAction ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleDownloadUpdate();
                  }}
                  className="inline-flex h-8 items-center gap-2 rounded-xl border border-[#111827]/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none hover:bg-[#1f2937] focus-visible:ring-2 focus-visible:ring-gray-300"
                >
                  Download
                </button>
              ) : null}

              {showInstallAction ? (
                <button
                  type="button"
                  disabled={installBlocked}
                  onClick={() => {
                    void handleInstallUpdate();
                  }}
                  className="inline-flex h-8 items-center gap-2 rounded-xl border border-[#111827]/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none hover:bg-[#1f2937] focus-visible:ring-2 focus-visible:ring-gray-300 disabled:cursor-not-allowed disabled:bg-[#d4d4d8] disabled:text-[#71717a]"
                >
                  Restart and install
                </button>
              ) : null}

              {(showDownloadAction || showInstallAction || updateState.status === 'error') ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleDismissUpdate();
                  }}
                  className="inline-flex h-8 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#67676f] outline-none hover:bg-[#71717a]/5 focus-visible:ring-2 focus-visible:ring-gray-300"
                >
                  Later
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="about-feedback-title">
          <div className="space-y-1">
            <h4 id="about-feedback-title" className="text-sm font-semibold leading-5 text-[#71717a]">
              Suggestions & feedback
            </h4>
            <p className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">
              Share ideas, questions, and issues with the person building Omvra.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl bg-[#fafafa] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={profilePicture}
                alt=""
                aria-hidden="true"
                className="size-10 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold leading-5 text-[#71717a]">Sorin Jurcut</div>
                <div className="truncate text-xs leading-4 text-[#8a8a92]">Product Designer</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <IconAction label="Open contact email" url={CONTACT_EMAIL_URL}>
                <PaperPlaneIcon className="size-4" />
              </IconAction>
              <IconAction label="Open LinkedIn profile" url={LINKEDIN_URL}>
                <ExternalLink className="size-4" />
              </IconAction>
            </div>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="about-licenses-title">
          <div className="space-y-1">
            <h4 id="about-licenses-title" className="text-sm font-semibold leading-5 text-[#71717a]">
              Licenses
            </h4>
            <p className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">
              Omvra is built with React, Electron, Vite, Tailwind CSS, Radix UI, and Lucide.
            </p>
          </div>
          <textarea
            disabled
            aria-label="Open-source licenses"
            value={LICENSE_TEXT}
            readOnly
            rows={6}
            className="min-h-32 w-full resize-none rounded-xl border border-black/10 bg-[#fafafa] px-4 py-3 text-sm leading-5 text-[#71717a] opacity-100 outline-none disabled:cursor-default disabled:opacity-100"
          />
        </section>
      </div>
    </AnchoredPanelSection>
  );
}

function getChannelButtonClass(selected: boolean) {
  return selected
    ? 'inline-flex h-8 items-center rounded-xl border border-[#111827]/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-gray-300'
    : 'inline-flex h-8 items-center rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#67676f] outline-none hover:bg-[#71717a]/5 focus-visible:ring-2 focus-visible:ring-gray-300';
}

function getUpdateBadge(updateState: AppUpdateState) {
  if (!updateState.packaged) {
    return {
      className: 'inline-flex h-7 shrink-0 items-center rounded-full border border-black/10 bg-[#f4f4f5] px-3 text-xs font-semibold text-[#71717a]',
      label: 'Packaged builds only',
      showCheck: false,
    };
  }

  if (!updateState.supported) {
    return {
      className: 'inline-flex h-7 shrink-0 items-center rounded-full border border-black/10 bg-[#f4f4f5] px-3 text-xs font-semibold text-[#71717a]',
      label: updateState.unsupportedReason === 'updater-unavailable'
        ? 'Updater failed to load'
        : 'Updater unavailable',
      showCheck: false,
    };
  }

  if (updateState.status === 'downloaded') {
    return {
      className: 'inline-flex h-7 shrink-0 items-center rounded-full border border-[#2563eb]/15 bg-[#2563eb]/10 px-3 text-xs font-semibold text-[#1d4ed8]',
      label: 'Ready to install',
      showCheck: false,
    };
  }

  if (updateState.status === 'available' || updateState.status === 'downloading') {
    return {
      className: 'inline-flex h-7 shrink-0 items-center rounded-full border border-[#f59e0b]/15 bg-[#f59e0b]/10 px-3 text-xs font-semibold text-[#b45309]',
      label: updateState.status === 'downloading' && updateState.progressPercent !== null
        ? `Downloading ${updateState.progressPercent}%`
        : 'Update available',
      showCheck: false,
    };
  }

  if (updateState.status === 'error') {
    return {
      className: 'inline-flex h-7 shrink-0 items-center rounded-full border border-[#c40000]/15 bg-[#c40000]/10 px-3 text-xs font-semibold text-[#c40000]',
      label: 'Update issue',
      showCheck: false,
    };
  }

  if (updateState.status === 'checking') {
    return {
      className: 'inline-flex h-7 shrink-0 items-center rounded-full border border-black/10 bg-[#f4f4f5] px-3 text-xs font-semibold text-[#71717a]',
      label: 'Checking…',
      showCheck: false,
    };
  }

  return {
    className: 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[#15c349]/15 bg-[#15c349]/10 px-3 text-xs font-semibold text-[#138a39]',
    label: updateState.status === 'not-available' ? 'Up to date' : 'Not checked',
    showCheck: updateState.status === 'not-available',
  };
}

function getUpdateSummary(updateState: AppUpdateState) {
  if (!updateState.packaged) {
    return 'Auto-update checks run only in packaged Omvra builds.';
  }

  if (!updateState.supported) {
    const details = updateState.unsupportedDetails?.trim();
    return updateState.unsupportedReason === 'updater-unavailable'
      ? details
        ? `This packaged Omvra build could not load electron-updater: ${details}`
        : 'This packaged Omvra build could not load electron-updater.'
      : 'Auto-update checks are unavailable in this build.';
  }

  switch (updateState.status) {
    case 'checking':
      return 'Checking GitHub Releases for a newer Omvra build.';
    case 'available':
      return updateState.requiresBackup
        ? 'A release candidate is available. Export a backup before installing it.'
        : 'A newer stable build is available to download.';
    case 'downloading':
      return 'Downloading the update package in the background.';
    case 'downloaded':
      return updateState.requiresBackup
        ? 'The release candidate is ready. Export a backup, then restart to install.'
        : 'The update is ready. Restart Omvra to install it.';
    case 'not-available':
      return 'This Omvra build is up to date for the selected channel.';
    case 'error':
      if (/code signature|did not pass validation|code requirement/i.test(updateState.error || '')) {
        return 'The downloaded macOS build failed code-signature validation. Rebuild and republish the signed release artifact before retrying this update.';
      }
      if (updateState.update) {
        return 'The downloaded update could not be installed. You can retry the install after the release artifact or installer issue is fixed.';
      }
      return 'The update check hit an error. You can retry from here.';
    default:
      return 'Choose stable releases or release candidates, then check for updates when needed.';
  }
}

function formatUpdateDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-black/[0.04] last:border-b-0">
      <span className="min-w-0 truncate text-xs leading-4 text-[#8a8a92]">{label}</span>
      <span className="max-w-[260px] truncate text-right text-xs font-semibold leading-4 text-[#71717a]">{value}</span>
    </div>
  );
}

async function loadRuntimeInfo(): Promise<{ appVersion: string; build: string }> {
  if (!window.electron?.app?.getRuntimeInfo) {
    return {
      appVersion: 'Unavailable',
      build: 'Browser preview',
    };
  }

  try {
    const runtimeInfo = await window.electron.app.getRuntimeInfo();
    return {
      appVersion: runtimeInfo.version || 'Unavailable',
      build: `${runtimeInfo.isPackaged ? 'Packaged' : 'Development'} / Electron ${runtimeInfo.electronVersion || 'unknown'}`,
    };
  } catch {
    return {
      appVersion: 'Unavailable',
      build: 'Unavailable',
    };
  }
}

async function loadMcpVersion(): Promise<string> {
  if (!window.electron?.mcp?.getCapabilities) {
    return 'Unavailable';
  }

  try {
    const result = await window.electron.mcp.getCapabilities();
    return result.data?.serverInfo?.version || 'Unavailable';
  } catch {
    return 'Unavailable';
  }
}

function ResourceList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-labelledby={`${title.toLowerCase()}-title`}>
      <h4 id={`${title.toLowerCase()}-title`} className="text-sm font-semibold leading-5 text-[#71717a]">
        {title}
      </h4>
      <div className="overflow-hidden rounded-xl bg-[#fafafa]">
        {children}
      </div>
    </section>
  );
}

function HelpEmptyState({ label }: { label: string }) {
  return <p className="px-4 py-6 text-center text-xs leading-5 text-[#8a8a92]">{label}</p>;
}

function ResourceRow({
  icon,
  resource,
}: {
  icon?: ReactNode;
  resource: HelpResource;
}) {
  return (
    <button
      type="button"
      onClick={() => openExternal(resource.url)}
      className="flex min-h-12 w-full items-center gap-3 border-b border-black/[0.04] px-4 py-3 text-left outline-none last:border-b-0 hover:bg-[#f4f4f5] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300"
    >
      {icon && <span className="flex size-5 shrink-0 items-center justify-center text-[#797981]">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-[#71717a]">{resource.title}</span>
      <ExternalLink className="size-3.5 shrink-0 text-[#8a8a92]" />
    </button>
  );
}

function FaqRow({ faq }: { faq: HelpFaq }) {
  return (
    <details className="group border-b border-black/[0.04] last:border-b-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-left outline-none hover:bg-[#f4f4f5] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-sm font-medium leading-5 text-[#71717a]">{faq.question}</span>
        <ChevronRight className="size-4 shrink-0 text-[#8a8a92] transition-transform group-open:rotate-90" />
      </summary>
      <p className="whitespace-pre-line px-4 pb-4 pr-10 text-xs leading-5 text-[#6a7282] [overflow-wrap:anywhere]">{faq.answer}</p>
    </details>
  );
}

function openExternal(url: string) {
  if (typeof window === 'undefined') return;

  if (window.electron?.openExternal) {
    void window.electron.openExternal(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function IconAction({ label, url, children }: { label: string; url: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => openExternal(url)}
      className="inline-flex size-8 items-center justify-center rounded-full border border-black/10 bg-white text-[#71717a] outline-none hover:bg-[#71717a]/5 focus-visible:ring-2 focus-visible:ring-gray-300"
    >
      {children}
    </button>
  );
}

function TutorialIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>half-dotted-circle-play</title>
      <g fill="currentColor">
        <path d="M11.652 8.56801L8.00099 6.43901C7.66799 6.24501 7.24899 6.48501 7.24899 6.87101V11.13C7.24899 11.516 7.66799 11.756 8.00099 11.562L11.652 9.43301C11.983 9.24001 11.983 8.76201 11.652 8.56901V8.56801Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M11.652 8.56801L8.00099 6.43901C7.66799 6.24501 7.24899 6.48501 7.24899 6.87101V11.13C7.24899 11.516 7.66799 11.756 8.00099 11.562L11.652 9.43301C11.983 9.24001 11.983 8.76201 11.652 8.56901V8.56801Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M9 1.75C13.004 1.75 16.25 4.996 16.25 9C16.25 13.004 13.004 16.25 9 16.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M3.87299 14.877C4.2872 14.877 4.62299 14.5412 4.62299 14.127C4.62299 13.7128 4.2872 13.377 3.87299 13.377C3.45877 13.377 3.12299 13.7128 3.12299 14.127C3.12299 14.5412 3.45877 14.877 3.87299 14.877Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M1.75 9.75C2.16421 9.75 2.5 9.41421 2.5 9C2.5 8.58579 2.16421 8.25 1.75 8.25C1.33579 8.25 1 8.58579 1 9C1 9.41421 1.33579 9.75 1.75 9.75Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M3.87299 4.623C4.2872 4.623 4.62299 4.28721 4.62299 3.873C4.62299 3.45879 4.2872 3.123 3.87299 3.123C3.45877 3.123 3.12299 3.45879 3.12299 3.873C3.12299 4.28721 3.45877 4.623 3.87299 4.623Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M6.22601 16.448C6.64023 16.448 6.97601 16.1122 6.97601 15.698C6.97601 15.2838 6.64023 14.948 6.22601 14.948C5.8118 14.948 5.47601 15.2838 5.47601 15.698C5.47601 16.1122 5.8118 16.448 6.22601 16.448Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M2.302 12.524C2.71622 12.524 3.052 12.1882 3.052 11.774C3.052 11.3598 2.71622 11.024 2.302 11.024C1.88779 11.024 1.552 11.3598 1.552 11.774C1.552 12.1882 1.88779 12.524 2.302 12.524Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M2.302 6.976C2.71622 6.976 3.052 6.64021 3.052 6.226C3.052 5.81178 2.71622 5.476 2.302 5.476C1.88779 5.476 1.552 5.81178 1.552 6.226C1.552 6.64021 1.88779 6.976 2.302 6.976Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M6.22601 3.052C6.64023 3.052 6.97601 2.71622 6.97601 2.302C6.97601 1.88779 6.64023 1.552 6.22601 1.552C5.8118 1.552 5.47601 1.88779 5.47601 2.302C5.47601 2.71622 5.8118 3.052 6.22601 3.052Z" fill="currentColor" data-stroke="none" stroke="none" />
      </g>
    </svg>
  );
}

function PaperPlaneIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>paper-plane-2</title>
      <g fill="currentColor">
        <path d="M15.947 2.73L11.793 15.653C11.651 16.096 11.05 16.162 10.816 15.759L7.65698 10.343L2.24098 7.184C1.83898 6.949 1.90398 6.349 2.34698 6.207L15.27 2.053C15.687 1.919 16.081 2.313 15.947 2.73Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M15.813 2.187L7.65701 10.343" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M15.947 2.73L11.793 15.653C11.651 16.096 11.05 16.162 10.816 15.759L7.65698 10.343L2.24098 7.184C1.83898 6.949 1.90398 6.349 2.34698 6.207L15.27 2.053C15.687 1.919 16.081 2.313 15.947 2.73Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}
